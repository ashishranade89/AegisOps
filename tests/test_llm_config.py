from backend.tools import llm_config


def test_get_llm_forwards_api_key_and_base_url(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test-openrouter")
    monkeypatch.setenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    monkeypatch.setenv("OPENROUTER_MODEL", "openai/gpt-4o")

    captured = {}

    class DummyChatOpenAI:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(llm_config, "ChatOpenAI", DummyChatOpenAI)

    llm_config.get_llm()

    assert captured["api_key"] == "sk-test-openrouter"
    assert captured["base_url"] == "https://openrouter.ai/api/v1"
    assert captured["model"] == "openai/gpt-4o"
