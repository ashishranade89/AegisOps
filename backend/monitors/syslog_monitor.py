"""Syslog push receiver — UDP and TCP variants.

For UDP: each datagram is one syslog message.
For TCP: messages are newline-delimited (RFC 6587 octet stuffing not supported).

Received messages are buffered for scan_interval seconds (default 30),
then the batch is passed to the severity classifier. This avoids firing
the expensive LLM pipeline for every single incoming syslog line.
"""
import asyncio
import logging
import re

from backend.monitors.base import BaseMonitor

logger = logging.getLogger(__name__)

# RFC 3164 / RFC 5424 priority header: <NNN>
_PRI_RE = re.compile(r"^<\d+>\d*\s*")


def _strip_pri(raw: str) -> str:
    """Remove the syslog PRI (and optional VERSION) header."""
    return _PRI_RE.sub("", raw).strip()


# ──────────────────────────────────────────────────────────────────────────────
# asyncio protocol implementations
# ──────────────────────────────────────────────────────────────────────────────

class _UDPProtocol(asyncio.DatagramProtocol):
    def __init__(self, queue: asyncio.Queue) -> None:
        self._q = queue

    def datagram_received(self, data: bytes, addr) -> None:
        line = _strip_pri(data.decode("utf-8", errors="replace"))
        if line:
            self._q.put_nowait(line)

    def error_received(self, exc: Exception) -> None:
        logger.warning("Syslog UDP socket error: %s", exc)


class _TCPProtocol(asyncio.Protocol):
    def __init__(self, queue: asyncio.Queue) -> None:
        self._q = queue
        self._buf = ""

    def data_received(self, data: bytes) -> None:
        self._buf += data.decode("utf-8", errors="replace")
        while "\n" in self._buf:
            line, self._buf = self._buf.split("\n", 1)
            line = _strip_pri(line)
            if line:
                self._q.put_nowait(line)

    def connection_lost(self, exc) -> None:
        # Flush any remaining buffer on disconnect
        if self._buf.strip():
            self._q.put_nowait(_strip_pri(self._buf))
            self._buf = ""


# ──────────────────────────────────────────────────────────────────────────────
# Monitor
# ──────────────────────────────────────────────────────────────────────────────

class SyslogMonitor(BaseMonitor):
    """
    Listens for incoming syslog messages and triggers the incident pipeline
    when the accumulated batch contains critical/warning-level entries.

    config fields used:
      type          "syslog_udp" or "syslog_tcp"
      host          listen interface (default "0.0.0.0")
      port          listen port     (default 10514)
      scan_interval buffer flush interval in seconds (default 30)
    """

    async def run(self) -> None:
        mon_type: str = self.config["type"]
        listen_host: str = self.config.get("host") or "0.0.0.0"
        listen_port: int = int(self.config.get("port") or 10514)
        flush_interval: int = int(self.config.get("scan_interval") or 30)

        queue: asyncio.Queue[str] = asyncio.Queue()
        loop = asyncio.get_event_loop()

        if mon_type == "syslog_udp":
            transport, _ = await loop.create_datagram_endpoint(
                lambda: _UDPProtocol(queue),
                local_addr=(listen_host, listen_port),
            )
            logger.info("[%s] Syslog UDP listening on %s:%s", self.name, listen_host, listen_port)
        else:
            server = await loop.create_server(
                lambda: _TCPProtocol(queue),
                host=listen_host,
                port=listen_port,
            )
            logger.info("[%s] Syslog TCP listening on %s:%s", self.name, listen_host, listen_port)

        buffer: list[str] = []
        try:
            while True:
                # Drain the queue for flush_interval seconds, then classify
                deadline = loop.time() + flush_interval
                while loop.time() < deadline:
                    remaining = deadline - loop.time()
                    try:
                        msg = await asyncio.wait_for(queue.get(), timeout=min(remaining, 1.0))
                        buffer.append(msg)
                    except asyncio.TimeoutError:
                        pass

                if buffer:
                    await self._process(buffer)
                    buffer.clear()

        finally:
            if mon_type == "syslog_udp":
                transport.close()
            else:
                server.close()
                await server.wait_closed()
            logger.info("[%s] Syslog listener stopped", self.name)
