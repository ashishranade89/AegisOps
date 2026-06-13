from pathlib import Path
from functools import lru_cache
from langchain_openai import ChatOpenAI
from backend.utils.config import get_config
import logging

config = get_config()

# Default cheap model for all agents — ~20x cheaper than gpt-4o and still accurate for JSON tasks
_DEFAULT_MODEL = "google/gemini-2.5-flash"


@lru_cache(maxsize=1)
def load_agent_rules() -> str:
    """Loads operational guidelines once per process (cached after first read)."""
    rules_path = Path(__file__).parent.parent.parent / "agent_rules.md"
    if rules_path.exists():
        try:
            return rules_path.read_text(encoding="utf-8")
        except Exception:
            pass
    return ""


def get_llm(
    openrouter_key: str = None,
    model_name: str = None,
    base_url: str = None,
    max_tokens: int = 800,
) -> ChatOpenAI:
    """
    Returns a ChatOpenAI-compatible LLM client.

    Args:
        max_tokens: Hard ceiling on output tokens. JSON agents use 800 (default),
                    the reporter agent uses 2000 to allow full postmortem generation.
    """
    key = openrouter_key or config.openrouter_api_key
    model = model_name or config.model_name or _DEFAULT_MODEL
    target_base_url = base_url or config.openrouter_base_url

    # Log the key usage (masked) and targets for debugging
    logger = logging.getLogger(__name__)
    masked = "(none)" if not key else f"{key[:8]}..."
    logger.debug("get_llm: key=%s model=%s base_url=%s", masked, model, target_base_url)
    # Also print directly so it appears in stdout/stderr immediately during dev
    print(f"[DEBUG] get_llm: key={masked} model={model} base_url={target_base_url}")

    return ChatOpenAI(
        model=model,
        base_url=target_base_url,
        api_key=key,
        temperature=0,
        max_tokens=max_tokens,
    )
