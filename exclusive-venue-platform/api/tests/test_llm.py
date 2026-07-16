"""Unit tests for the provider-agnostic LLM dispatch (app/core/llm.py).
No network calls, no real API keys — only tests that get_llm_client()
picks the right adapter (or fails clearly) based on AI_PROVIDER, which
is the whole point of this module: swapping providers is a config
change, and that dispatch logic needs to actually be correct."""

import pytest

from app.core.llm import (
    AnthropicClient,
    GeminiClient,
    LLMUnavailableError,
    OpenAIClient,
    get_llm_client,
)


class FakeSettings:
    def __init__(self, ai_provider="openai", openai_api_key="", anthropic_api_key="", gemini_api_key=""):
        self.ai_provider = ai_provider
        self.openai_api_key = openai_api_key
        self.anthropic_api_key = anthropic_api_key
        self.gemini_api_key = gemini_api_key


@pytest.fixture(autouse=True)
def _clear_cache():
    get_llm_client.cache_clear()
    yield
    get_llm_client.cache_clear()


def test_openai_selected_by_default_with_key(monkeypatch):
    monkeypatch.setattr(
        "app.core.llm.get_settings", lambda: FakeSettings(ai_provider="openai", openai_api_key="sk-test")
    )
    assert isinstance(get_llm_client(), OpenAIClient)


def test_openai_without_key_raises_unavailable(monkeypatch):
    monkeypatch.setattr("app.core.llm.get_settings", lambda: FakeSettings(ai_provider="openai"))
    with pytest.raises(LLMUnavailableError, match="OPENAI_API_KEY"):
        get_llm_client()


def test_anthropic_selected_when_configured(monkeypatch):
    monkeypatch.setattr(
        "app.core.llm.get_settings",
        lambda: FakeSettings(ai_provider="anthropic", anthropic_api_key="ak-test"),
    )
    assert isinstance(get_llm_client(), AnthropicClient)


def test_anthropic_without_key_raises_unavailable(monkeypatch):
    monkeypatch.setattr("app.core.llm.get_settings", lambda: FakeSettings(ai_provider="anthropic"))
    with pytest.raises(LLMUnavailableError, match="ANTHROPIC_API_KEY"):
        get_llm_client()


def test_gemini_selected_when_configured(monkeypatch):
    monkeypatch.setattr(
        "app.core.llm.get_settings", lambda: FakeSettings(ai_provider="gemini", gemini_api_key="gk-test")
    )
    assert isinstance(get_llm_client(), GeminiClient)


def test_gemini_without_key_raises_unavailable(monkeypatch):
    monkeypatch.setattr("app.core.llm.get_settings", lambda: FakeSettings(ai_provider="gemini"))
    with pytest.raises(LLMUnavailableError, match="GEMINI_API_KEY"):
        get_llm_client()


def test_unknown_provider_raises_unavailable(monkeypatch):
    monkeypatch.setattr(
        "app.core.llm.get_settings", lambda: FakeSettings(ai_provider="not-a-real-provider")
    )
    with pytest.raises(LLMUnavailableError, match="Unknown AI_PROVIDER"):
        get_llm_client()


def test_provider_selection_is_case_insensitive(monkeypatch):
    monkeypatch.setattr(
        "app.core.llm.get_settings", lambda: FakeSettings(ai_provider="OpenAI", openai_api_key="sk-test")
    )
    assert isinstance(get_llm_client(), OpenAIClient)
