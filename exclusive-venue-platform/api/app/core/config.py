"""Environment-driven settings. Never hardcode secrets — see docs/stack-profile.md."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_secret_key: str = ""
    supabase_jwks_url: str = ""
    # AI provider selection (app/core/llm.py) — switching providers is a
    # config change only: set ai_provider + that provider's key. No code
    # in brief_parser.py/recommendation_engine.py/copy_generator.py knows
    # or cares which provider is behind get_llm_client().
    ai_provider: str = "openai"
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    resend_webhook_secret: str = ""
    environment: str = "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
