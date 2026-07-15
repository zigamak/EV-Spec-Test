"""Environment-driven settings. Never hardcode secrets — see docs/stack-profile.md."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_secret_key: str = ""
    supabase_jwks_url: str = ""
    openai_api_key: str = ""
    resend_webhook_secret: str = ""
    environment: str = "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
