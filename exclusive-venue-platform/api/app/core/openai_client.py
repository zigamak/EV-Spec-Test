"""Shared OpenAI client (constitution #1 — AI handles brief parsing,
venue re-ranking, proposal copy; never pricing/availability/permissions).
"""

from functools import lru_cache

import openai

from app.core.config import get_settings

# Fast, cheap model for structured-extraction and re-rank tasks — this is
# a tool-calling call, not a generative copy task (that's G2's model choice).
PARSER_MODEL = "gpt-4o-mini"


@lru_cache
def get_openai_client() -> openai.OpenAI:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured (api/.env)")
    return openai.OpenAI(api_key=settings.openai_api_key)
