"""Abstract base monitor + shared severity classification and pipeline trigger."""
import logging
import re
import time
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)

_CRITICAL_RE = re.compile(r"\b(CRITICAL|FATAL|ERROR|EMERG|ALERT|CRIT)\b", re.IGNORECASE)
_WARNING_RE  = re.compile(r"\b(WARN(?:ING)?)\b", re.IGNORECASE)

# Trigger the pipeline when this many warnings accumulate in a single scan
WARNING_BATCH_THRESHOLD = 3

_TRIGGER_COOLDOWN_SECS = 300  # 5 minutes


def classify(lines: list[str]) -> tuple[list[str], list[str]]:
    """Return (critical_lines, warning_lines) from a batch of log lines."""
    crit, warn = [], []
    for line in lines:
        if _CRITICAL_RE.search(line):
            crit.append(line)
        elif _WARNING_RE.search(line):
            warn.append(line)
    return crit, warn


class BaseMonitor(ABC):
    def __init__(self, config: dict) -> None:
        self.config = config
        self.mon_id: str = config["id"]
        self.name: str = config["name"]
        self._last_triggered_at: float = 0.0

    @abstractmethod
    async def run(self) -> None:
        """Main monitoring loop — must handle its own reconnects and sleep."""
        ...

    async def _process(self, lines: list[str]) -> None:
        """Classify new lines and trigger the pipeline when warranted."""
        if not lines:
            return

        crit, warn = classify(lines)

        if crit:
            trigger_lines = crit + warn
            logger.info("[%s] %d critical line(s) found — triggering pipeline", self.name, len(crit))
        elif len(warn) >= WARNING_BATCH_THRESHOLD:
            trigger_lines = warn
            logger.info("[%s] %d warnings hit threshold — triggering pipeline", self.name, len(warn))
        else:
            if warn:
                logger.debug("[%s] %d warning(s) below threshold (%d), skipping",
                             self.name, len(warn), WARNING_BATCH_THRESHOLD)
            return

        # Cooldown: skip if we triggered less than _TRIGGER_COOLDOWN_SECS ago
        now = time.monotonic()
        elapsed = now - self._last_triggered_at
        if elapsed < _TRIGGER_COOLDOWN_SECS:
            logger.info(
                "[%s] Trigger suppressed — cooldown active (%.0fs remaining)",
                self.name, _TRIGGER_COOLDOWN_SECS - elapsed,
            )
            return

        self._last_triggered_at = now
        auto_remediate = bool(self.config.get("auto_remediate", False))
        from backend.monitors.trigger import trigger_incident
        try:
            run_id = await trigger_incident("\n".join(trigger_lines), self.name, auto_remediate)
            logger.info("[%s] → run_id=%s  auto_remediate=%s", self.name, run_id, auto_remediate)
        except Exception as exc:
            logger.error("[%s] Pipeline trigger failed: %s", self.name, exc)
