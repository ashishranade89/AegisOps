import asyncio
import json
import logging
from backend.api.persistence import RunState, create_run, get_run, persist_run

logger = logging.getLogger(__name__)

__all__ = ["RunState", "create_run", "get_run", "persist_run", "send_sse_event", "event_generator"]


async def send_sse_event(run_id: str, event: str, data: dict):
    state = get_run(run_id)
    if state is not None:
        await state.queue.put({"event": event, "data": json.dumps(data)})
        logger.info("[%s] SSE sent event='%s' payload=%s", run_id, event, data)
    else:
        logger.info("[%s] CLI LOG: event='%s' payload=%s", run_id, event, data)


async def event_generator(state: RunState):
    try:
        while True:
            msg = await state.queue.get()
            yield msg
            if isinstance(msg, dict) and msg.get("event") in ("done", "error"):
                break
    except asyncio.CancelledError:
        logger.info("SSE client disconnected for run: %s", state.run_id)
