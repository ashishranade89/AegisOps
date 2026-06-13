"""MonitorManager — starts and stops all enabled monitors as asyncio tasks.

Lifecycle:
  start_all()  — called from FastAPI lifespan startup
  stop_all()   — called from FastAPI lifespan shutdown
  add(mid)     — called after a monitor is created/enabled via the API
  remove(mid)  — called after a monitor is deleted/disabled via the API
"""
import asyncio
import logging

from backend.monitors.persistence import get_monitor, list_monitors, set_enabled

logger = logging.getLogger(__name__)

# mid → asyncio.Task
_tasks: dict[str, asyncio.Task] = {}


def _build(config: dict):
    mon_type = config["type"]
    if mon_type == "local":
        from backend.monitors.local_monitor import LocalMonitor
        return LocalMonitor(config)
    if mon_type == "ssh":
        from backend.monitors.ssh_monitor import SSHMonitor
        return SSHMonitor(config)
    if mon_type in ("syslog_udp", "syslog_tcp"):
        from backend.monitors.syslog_monitor import SyslogMonitor
        return SyslogMonitor(config)
    raise ValueError(f"Unknown monitor type: {mon_type!r}")


async def _run(config: dict) -> None:
    monitor = _build(config)
    try:
        await monitor.run()
    except asyncio.CancelledError:
        logger.info("[%s] Monitor task cancelled", config["name"])
    except Exception as exc:
        logger.error("[%s] Monitor crashed: %s", config["name"], exc, exc_info=True)


def _start_task(config: dict) -> None:
    mid = config["id"]
    existing = _tasks.get(mid)
    if existing and not existing.done():
        return  # already running
    task = asyncio.create_task(_run(config), name=f"monitor-{mid}")
    _tasks[mid] = task
    logger.info("Monitor started: %s (%s)", config["name"], config["type"])


async def start_all() -> None:
    """Start tasks for every enabled monitor — called at API startup."""
    enabled = [m for m in list_monitors() if m["enabled"]]
    logger.info("Starting %d enabled monitor(s)", len(enabled))
    for m in enabled:
        _start_task(m)


async def stop_all() -> None:
    """Cancel all running monitor tasks — called at API shutdown."""
    for mid, task in list(_tasks.items()):
        task.cancel()
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=5)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass
    _tasks.clear()
    logger.info("All monitors stopped")


async def add(mid: str) -> None:
    """Start the monitor task for a newly created or re-enabled monitor."""
    config = get_monitor(mid)
    if config and config["enabled"]:
        _start_task(config)


async def remove(mid: str) -> None:
    """Cancel and remove the task for a monitor that was deleted or disabled."""
    task = _tasks.pop(mid, None)
    if task and not task.done():
        task.cancel()
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=5)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass


async def toggle(mid: str, enabled: bool) -> None:
    """Enable or disable a monitor and start/stop its task accordingly."""
    set_enabled(mid, enabled)
    if enabled:
        await add(mid)
    else:
        await remove(mid)
