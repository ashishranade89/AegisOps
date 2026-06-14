#!/usr/bin/env python3
"""
Log-generator daemon.

Reads LogGenerator/settings.cfg and emits randomly-picked log entries
into logs/incident.log at the configured intervals:
  [info]     — every 30 s  (from Incidents-info.log)
  [warning]  — every 5 min (from Incidents-warnings.log)
  [critical] — every 10 min (from Incidents-Critical.log)

Run:  python daemon.py
Stop: Ctrl+C  (or SIGTERM)
"""

import configparser
import logging
import logging.handlers
import os
import random
import re
import signal
import sys
import threading
import time
from pathlib import Path

BASE_DIR = Path(__file__).parent

# HTML style-tag artifacts present in Incidents-Critical.log
_HTML_TAG = re.compile(r'style="[^"]*">')

# Matches: TIMESTAMP [LEVEL] [source] <rest>
_LOG_LINE = re.compile(r"^\S+\s+\[\w+\]\s+(\[\w+\]\s+.*)")


def load_lines(source_file: str) -> list[str]:
    """Load non-empty lines from a source file, stripping HTML artifacts."""
    path = BASE_DIR / source_file
    if not path.exists():
        raise FileNotFoundError(path)

    lines = []
    with path.open(encoding="utf-8") as fh:
        for raw in fh:
            clean = _HTML_TAG.sub("", raw).strip()
            if clean:
                lines.append(clean)
    return lines


def extract_message(line: str) -> str:
    """Return '[source] message body' from a raw source log line."""
    m = _LOG_LINE.match(line)
    if m:
        return m.group(1)
    # Fallback: drop just the leading timestamp
    parts = line.split(" ", 1)
    return parts[1] if len(parts) > 1 else line


def build_logger(log_file: str, max_bytes: int, backup_count: int) -> logging.Logger:
    log_path = BASE_DIR / log_file
    log_path.parent.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger("incident")
    logger.setLevel(logging.DEBUG)
    logger.propagate = False

    fmt = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%SZ",
    )
    fmt.converter = time.gmtime  # UTC

    file_handler = logging.handlers.RotatingFileHandler(
        log_path,
        maxBytes=max_bytes if max_bytes > 0 else 0,
        backupCount=backup_count,
        encoding="utf-8",
    )
    file_handler.setFormatter(fmt)
    logger.addHandler(file_handler)

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(fmt)
    logger.addHandler(console)

    return logger


class LevelEmitter(threading.Thread):
    """Emits a random log line from source_lines every interval_seconds."""

    def __init__(
        self,
        name: str,
        level: int,
        interval: float,
        source_lines: list[str],
        logger: logging.Logger,
        stop_event: threading.Event,
    ) -> None:
        super().__init__(name=name, daemon=True)
        self.level = level
        self.interval = interval
        self.source_lines = source_lines
        self.logger = logger
        self.stop_event = stop_event

    def run(self) -> None:
        next_emit = time.monotonic() + self.interval

        while not self.stop_event.is_set():
            if time.monotonic() >= next_emit:
                message = extract_message(random.choice(self.source_lines))
                self.logger.log(self.level, message)
                next_emit = time.monotonic() + self.interval
            self.stop_event.wait(timeout=1.0)


def main() -> None:
    cfg_path = BASE_DIR / "settings.cfg"
    if not cfg_path.exists():
        sys.exit(f"[daemon] settings.cfg not found at {cfg_path}")

    cfg = configparser.ConfigParser()
    cfg.read(cfg_path)

    log_file = cfg.get("output", "log_file", fallback="logs/incident.log")
    max_bytes = cfg.getint("output", "max_bytes", fallback=10_485_760)
    backup_count = cfg.getint("output", "backup_count", fallback=5)
    logger = build_logger(log_file, max_bytes, backup_count)

    level_cfg = {
        "info":     (logging.INFO,     cfg.get("info",     "source_file", fallback="Incidents-info.log")),
        "warning":  (logging.WARNING,  cfg.get("warning",  "source_file", fallback="Incidents-warnings.log")),
        "critical": (logging.CRITICAL, cfg.get("critical", "source_file", fallback="Incidents-Critical.log")),
    }

    stop_event = threading.Event()
    threads: list[LevelEmitter] = []

    for section, (log_level, source_file) in level_cfg.items():
        interval = cfg.getfloat(section, "interval_seconds", fallback=60)
        try:
            lines = load_lines(source_file)
        except FileNotFoundError as exc:
            logger.error("Source file not found: %s — skipping %s emitter", exc, section)
            continue

        t = LevelEmitter(
            name=f"{section}-emitter",
            level=log_level,
            interval=interval,
            source_lines=lines,
            logger=logger,
            stop_event=stop_event,
        )
        threads.append(t)
        logger.info(
            "Registered %s emitter  interval=%ss  source=%s  (%d lines)",
            section, int(interval), source_file, len(lines),
        )

    if not threads:
        sys.exit("[daemon] No emitters could be started. Check source files.")

    def _shutdown(sig, _frame):
        logger.info("Shutdown requested (signal %s). Stopping…", sig)
        stop_event.set()

    signal.signal(signal.SIGINT, _shutdown)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, _shutdown)

    for t in threads:
        t.start()

    logger.info("Daemon running  PID=%d  output=%s  Press Ctrl+C to stop.", os.getpid(), log_file)
    stop_event.wait()

    for t in threads:
        t.join(timeout=5)
    logger.info("Daemon stopped.")


if __name__ == "__main__":
    main()
