"""Monitors a remote log file via SSH/SFTP using asyncssh.

Supports both password auth and private-key auth. On disconnect it
waits _RETRY_DELAY seconds before reconnecting so as not to hammer
the remote host.
"""
import asyncio
import logging

from backend.monitors.base import BaseMonitor
from backend.monitors.encryption import decrypt
from backend.monitors.persistence import update_offset

logger = logging.getLogger(__name__)

_RETRY_DELAY = 30  # seconds between reconnect attempts after a failure


class SSHMonitor(BaseMonitor):
    async def run(self) -> None:
        try:
            import asyncssh
        except ImportError:
            logger.error("[%s] asyncssh is not installed — SSH monitor cannot start", self.name)
            return

        creds = decrypt(self.config["credentials_enc"]) if self.config.get("credentials_enc") else {}
        host: str = self.config["host"]
        port: int = int(self.config.get("port") or 22)
        log_path: str = self.config["log_path"]
        interval: int = int(self.config.get("scan_interval", 60))
        offset: int = int(self.config.get("byte_offset", 0))

        connect_kwargs: dict = dict(
            host=host,
            port=port,
            username=creds.get("username", ""),
            known_hosts=None,  # accept any host key; harden with known_hosts file in prod
        )
        if creds.get("private_key"):
            connect_kwargs["client_keys"] = [
                asyncssh.import_private_key(
                    creds["private_key"],
                    passphrase=creds.get("passphrase") or None,
                )
            ]
        elif creds.get("password"):
            connect_kwargs["password"] = creds["password"]

        logger.info(
            "[%s] SSH monitor started  %s:%s  path=%s  interval=%ss",
            self.name, host, port, log_path, interval,
        )

        while True:
            try:
                async with asyncssh.connect(**connect_kwargs) as conn:
                    async with conn.start_sftp_client() as sftp:
                        logger.info("[%s] SFTP connected to %s", self.name, host)

                        while True:
                            try:
                                stat = await sftp.stat(log_path)
                                file_size: int = stat.size or 0

                                if file_size > offset:
                                    async with await sftp.open(log_path, "rb") as fh:
                                        await fh.seek(offset)
                                        chunk = await fh.read(file_size - offset)

                                    if chunk:
                                        new_offset = offset + len(chunk)
                                        lines = [
                                            ln.strip()
                                            for ln in chunk.decode("utf-8", errors="replace").splitlines()
                                            if ln.strip()
                                        ]
                                        update_offset(self.mon_id, new_offset)
                                        offset = new_offset
                                        await self._process(lines)

                                elif file_size < offset:
                                    # Log was rotated — reset to beginning
                                    logger.info("[%s] Log rotation detected, resetting offset", self.name)
                                    offset = 0
                                    update_offset(self.mon_id, 0)

                            except asyncssh.SFTPError as exc:
                                logger.error("[%s] SFTP read error: %s", self.name, exc)

                            await asyncio.sleep(interval)

            except (asyncssh.Error, OSError) as exc:
                logger.error(
                    "[%s] SSH connection failed: %s — retrying in %ss",
                    self.name, exc, _RETRY_DELAY,
                )
                await asyncio.sleep(_RETRY_DELAY)
