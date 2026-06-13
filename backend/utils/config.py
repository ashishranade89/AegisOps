import os
from pathlib import Path
from dotenv import load_dotenv

ENV_PATH = Path(__file__).parent.parent.parent / ".env"
load_dotenv(dotenv_path=ENV_PATH)


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


class AppConfig:
    @property
    def openrouter_api_key(self) -> str:
        return os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY") or ""

    @property
    def openrouter_base_url(self) -> str:
        return os.getenv("OPENROUTER_BASE_URL") or os.getenv("OPENAI_BASE_URL") or "https://openrouter.ai/api/v1"

    @property
    def model_name(self) -> str:
        return os.getenv("OPENROUTER_MODEL") or "openai/gpt-4o"

    @property
    def tavily_api_key(self) -> str:
        return os.getenv("TAVILY_API_KEY") or ""

    @property
    def model_api_key(self) -> str:
        return os.getenv("MODEL_API_KEY") or os.getenv("OPENAI_API_KEY") or ""

    @property
    def slack_webhook_url(self) -> str:
        return os.getenv("SLACK_WEBHOOK_URL") or ""

    @property
    def jira_base_url(self) -> str:
        return os.getenv("JIRA_BASE_URL") or ""

    @property
    def jira_email(self) -> str:
        return os.getenv("JIRA_EMAIL") or ""

    @property
    def jira_api_token(self) -> str:
        return os.getenv("JIRA_API_TOKEN") or ""

    @property
    def jira_project_key(self) -> str:
        return os.getenv("JIRA_PROJECT_KEY") or "OPS"

    @property
    def jira_dry_run(self) -> bool:
        return _env_bool("JIRA_DRY_RUN", default=False)

    @property
    def slack_bot_token(self) -> str:
        return os.getenv("SLACK_BOT_TOKEN") or ""

    @property
    def slack_channel_id(self) -> str:
        return os.getenv("SLACK_CHANNEL_ID") or ""

    @property
    def slack_signing_secret(self) -> str:
        return os.getenv("SLACK_SIGNING_SECRET") or ""

    @property
    def slack_dry_run(self) -> bool:
        return _env_bool("SLACK_DRY_RUN", default=False)

    def jira_configured(self) -> bool:
        return bool(self.jira_base_url and self.jira_email and self.jira_api_token)

    def slack_bot_configured(self) -> bool:
        return bool(self.slack_bot_token and self.slack_channel_id)

    # INCIDENT_API_KEY header auth is intentionally disabled for the local app.
    # Keep /api/incident routes accessible without Authorization or X-API-Key.

    @property
    def allow_client_api_keys(self) -> bool:
        """Allow API keys in POST body. Default: true (required for hackathon/local dev)."""
        return _env_bool("ALLOW_CLIENT_API_KEYS", default=True)

    @property
    def checkpoint_db_path(self) -> Path:
        raw = os.getenv("CHECKPOINT_DB_PATH") or "data/checkpoints.db"
        path = Path(raw)
        if not path.is_absolute():
            path = Path(__file__).parent.parent.parent / path
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def runs_db_path(self) -> Path:
        raw = os.getenv("RUNS_DB_PATH") or "data/runs.db"
        path = Path(raw)
        if not path.is_absolute():
            path = Path(__file__).parent.parent.parent / path
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def llm_configured(self) -> bool:
        return bool(self.openrouter_api_key) or "localhost" in self.openrouter_base_url or "127.0.0.1" in self.openrouter_base_url


_config = AppConfig()


def get_config() -> AppConfig:
    return _config
