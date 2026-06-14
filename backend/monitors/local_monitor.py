"""Monitors a local log file by byte offset, polling at a configured interval."""
import asyncio
import logging
from pathlib import Path

from backend.monitors.base import BaseMonitor
from backend.monitors.persistence import update_offset

logger = logging.getLogger(__name__)


class LocalMonitor(BaseMonitor):
    async def run(self) -> None:
        path = Path(self.config["log_path"])
        interval = int(self.config.get("scan_interval", 60))
        offset: int = int(self.config.get("byte_offset", 0))

        logger.info("[%s] Local monitor started  path=%s  interval=%ss", self.name, path, interval)

        while True:
            try:
                if path.exists():
                    current_size = path.stat().st_size
                    if current_size < offset:
                        # Log was rotated or truncated — reset to beginning
                        logger.info("[%s] Log rotation detected, resetting offset", self.name)
                        offset = 0
                        update_offset(self.mon_id, 0)

                    with path.open("rb") as fh:
                        fh.seek(offset)
                        chunk = fh.read()

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
                else:
                    logger.warning("[%s] Log file not found: %s", self.name, path)

            except Exception as exc:
                logger.error("[%s] Scan error: %s", self.name, exc)

            await asyncio.sleep(interval)
