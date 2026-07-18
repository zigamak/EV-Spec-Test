"""Provider-agnostic LLM client (constitution #1 — AI handles brief
parsing, venue re-ranking, proposal copy; never pricing/availability/
permissions). Swapping providers (OpenAI/Anthropic/Gemini) is a config
change only — set `AI_PROVIDER` + that provider's API key in `api/.env`.
No call site (brief_parser.py, recommendation_engine.py, copy_generator.py)
imports a provider SDK directly or knows which one is behind
`get_llm_client()`; they only see `ToolSchema` / `call_tool` /
`generate_text` / `LLMUnavailableError` / `LLMCallError`, all defined here.

Adding a fourth provider later means one new adapter class in this file
implementing `LLMClient`, registered in `get_llm_client()` — nothing
outside this module changes.
"""

import json
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Protocol

from app.core.config import get_settings


class LLMUnavailableError(RuntimeError):
    """The configured provider has no API key set."""


class LLMCallError(RuntimeError):
    """The provider's API call itself failed (network, rate limit, etc.)."""


@dataclass
class ToolSchema:
    """Provider-neutral tool/function-calling schema. `parameters` is a
    plain JSON Schema object — each adapter translates it into whatever
    wire shape its SDK expects."""

    name: str
    description: str
    parameters: dict[str, Any]


class LLMClient(Protocol):
    def call_tool(self, prompt: str, tool: ToolSchema) -> dict[str, Any]:
        """Force a single tool call and return its parsed arguments."""
        ...

    def generate_text(self, prompt: str) -> str:
        """Plain text completion (proposal copy, not extraction)."""
        ...


class OpenAIClient:
    MODEL = "gpt-4o-mini"

    def __init__(self, api_key: str):
        import openai

        self._openai = openai
        self._client = openai.OpenAI(api_key=api_key)

    def call_tool(self, prompt: str, tool: ToolSchema) -> dict[str, Any]:
        try:
            response = self._client.chat.completions.create(
                model=self.MODEL,
                messages=[{"role": "user", "content": prompt}],
                tools=[
                    {
                        "type": "function",
                        "function": {
                            "name": tool.name,
                            "description": tool.description,
                            "parameters": tool.parameters,
                        },
                    }
                ],
                tool_choice={"type": "function", "function": {"name": tool.name}},
            )
        except self._openai.APIError as exc:
            raise LLMCallError(str(exc)) from exc
        tool_call = response.choices[0].message.tool_calls[0]
        return json.loads(tool_call.function.arguments)

    def generate_text(self, prompt: str) -> str:
        try:
            response = self._client.chat.completions.create(
                model=self.MODEL,
                messages=[{"role": "user", "content": prompt}],
            )
        except self._openai.APIError as exc:
            raise LLMCallError(str(exc)) from exc
        return response.choices[0].message.content or ""


class AnthropicClient:
    MODEL = "claude-haiku-4-5-20251001"

    def __init__(self, api_key: str):
        import anthropic

        self._anthropic = anthropic
        self._client = anthropic.Anthropic(api_key=api_key)

    def call_tool(self, prompt: str, tool: ToolSchema) -> dict[str, Any]:
        try:
            response = self._client.messages.create(
                model=self.MODEL,
                max_tokens=1024,
                tools=[
                    {
                        "name": tool.name,
                        "description": tool.description,
                        "input_schema": tool.parameters,
                    }
                ],
                tool_choice={"type": "tool", "name": tool.name},
                messages=[{"role": "user", "content": prompt}],
            )
        except self._anthropic.APIError as exc:
            raise LLMCallError(str(exc)) from exc
        tool_use = next(block for block in response.content if block.type == "tool_use")
        return tool_use.input

    def generate_text(self, prompt: str) -> str:
        try:
            response = self._client.messages.create(
                model=self.MODEL,
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}],
            )
        except self._anthropic.APIError as exc:
            raise LLMCallError(str(exc)) from exc
        return "".join(block.text for block in response.content if block.type == "text")


def _sanitize_schema_for_gemini(node: Any) -> Any:
    """Translate the provider-neutral JSON Schema (ToolSchema.parameters)
    into Gemini's stricter OpenAPI-subset shape. OpenAI/Anthropic accept
    JSON Schema as-is; Gemini does not:
      - `type` must be a single string, not a `["string", "null"]` union —
        the union becomes `type: "string"` + `nullable: true`.
      - `enum` may not contain null — a null member becomes `nullable: true`.
      - constraint keywords it doesn't model (minimum, exclusiveMinimum,
        maximum, …) are dropped rather than sent and rejected.
    Without this the SDK raises `'list' object has no attribute 'upper'`
    the moment it sees a union `type`."""
    if not isinstance(node, dict):
        return node
    out: dict[str, Any] = {}
    for key, val in node.items():
        if key == "type":
            if isinstance(val, list):
                non_null = [t for t in val if t != "null"]
                out["type"] = non_null[0] if non_null else "string"
                if "null" in val:
                    out["nullable"] = True
            else:
                out["type"] = val
        elif key == "enum":
            out["enum"] = [member for member in val if member is not None]
            if any(member is None for member in val):
                out["nullable"] = True
        elif key == "properties":
            out["properties"] = {k: _sanitize_schema_for_gemini(v) for k, v in val.items()}
        elif key == "items":
            out["items"] = _sanitize_schema_for_gemini(val)
        elif key in ("description", "required", "nullable"):
            out[key] = val
        # everything else (minimum/maximum/exclusiveMinimum/…) is intentionally dropped
    return out


def _proto_to_native(value: Any) -> Any:
    """Recursively convert google-generativeai's proto-plus wrappers
    (MapComposite / RepeatedComposite, returned inside a function call's
    `args`) into plain dict/list/scalars. `dict(args)` only unwraps the top
    level, leaving nested arrays/objects as proto types that pydantic then
    mis-handles (e.g. 'list object has no attribute upper'). Duck-typed
    rather than importing proto internals, so it survives SDK version bumps."""
    if hasattr(value, "items"):
        return {key: _proto_to_native(val) for key, val in value.items()}
    if not isinstance(value, str | bytes) and hasattr(value, "__iter__"):
        return [_proto_to_native(item) for item in value]
    return value


class GeminiClient:
    MODEL = "gemini-2.5-flash"

    def __init__(self, api_key: str):
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        self._genai = genai
        self._model = genai.GenerativeModel(self.MODEL)

    def call_tool(self, prompt: str, tool: ToolSchema) -> dict[str, Any]:
        function_declaration = {
            "name": tool.name,
            "description": tool.description,
            "parameters": _sanitize_schema_for_gemini(tool.parameters),
        }
        model = self._genai.GenerativeModel(
            self.MODEL, tools=[{"function_declarations": [function_declaration]}]
        )
        try:
            response = model.generate_content(
                prompt,
                tool_config={"function_calling_config": {"mode": "ANY"}},
            )
        except Exception as exc:  # google-generativeai raises its own exception hierarchy
            raise LLMCallError(str(exc)) from exc
        # With mode=ANY the model must call the tool, but the call needn't be
        # the first part — find the part that actually carries one.
        try:
            parts = response.candidates[0].content.parts
            call = next(
                part.function_call
                for part in parts
                if getattr(part, "function_call", None) and part.function_call.name
            )
        except (StopIteration, IndexError, AttributeError) as exc:
            raise LLMCallError(f"Gemini returned no usable function call: {exc}") from exc
        return _proto_to_native(call.args)

    def generate_text(self, prompt: str) -> str:
        try:
            response = self._model.generate_content(prompt)
        except Exception as exc:
            raise LLMCallError(str(exc)) from exc
        return response.text or ""


@lru_cache
def get_llm_client() -> LLMClient:
    settings = get_settings()
    provider = settings.ai_provider.lower()

    if provider == "openai":
        if not settings.openai_api_key:
            raise LLMUnavailableError("OPENAI_API_KEY is not configured (api/.env)")
        return OpenAIClient(settings.openai_api_key)

    if provider == "anthropic":
        if not settings.anthropic_api_key:
            raise LLMUnavailableError("ANTHROPIC_API_KEY is not configured (api/.env)")
        return AnthropicClient(settings.anthropic_api_key)

    if provider == "gemini":
        if not settings.gemini_api_key:
            raise LLMUnavailableError("GEMINI_API_KEY is not configured (api/.env)")
        return GeminiClient(settings.gemini_api_key)

    raise LLMUnavailableError(
        f"Unknown AI_PROVIDER '{settings.ai_provider}' — expected openai/anthropic/gemini"
    )
