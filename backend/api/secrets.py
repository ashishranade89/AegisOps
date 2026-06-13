import os
from fastapi import HTTPException
from backend.utils.config import get_config
from dotenv import load_dotenv

load_dotenv()

def resolve_llm_credentials(payload: dict | None = None) -> dict:
    """
    Resolve LLM/search credentials server-side.
    Client-supplied keys are accepted only when ALLOW_CLIENT_API_KEYS=true.
    """
    config = get_config()
    payload = payload or {}

    openrouter_key = config.openrouter_api_key or os.getenv("OPENROUTER_API_KEY")
    tavily_key = config.tavily_api_key or os.getenv("TAVILY_API_KEY")
    llm_model = payload.get("llm_model") or config.model_name
    llm_base_url = payload.get("llm_base_url") or config.openrouter_base_url

    if config.allow_client_api_keys:
        openrouter_key = payload.get("openrouter_api_key") or openrouter_key
        tavily_key = payload.get("tavily_api_key") or tavily_key

    using_local = llm_base_url and ("localhost" in llm_base_url or "127.0.0.1" in llm_base_url)
    if not openrouter_key and not using_local:
        raise HTTPException(
            status_code=400,
            detail=(
                "No LLM API key configured. Set OPENROUTER_API_KEY in server .env "
                "or enable ALLOW_CLIENT_API_KEYS=true for development."
            ),
        )

    return {
        "openrouter_api_key": openrouter_key or None,
        "tavily_api_key": tavily_key or None,
        "llm_model": llm_model,
        "llm_base_url": llm_base_url if using_local or payload.get("llm_base_url") else None,
    }