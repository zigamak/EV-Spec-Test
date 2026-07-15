"""AI Brief Parser (tasks D1/D2) — enquiry text -> structured brief JSON.

GPT tool-calling only produces a *candidate* brief; nothing here is
authoritative until it passes ParsedBrief validation (constitution #1) and,
below AUTO_ACCEPT_THRESHOLD, a human review (D4). budget_basis is the one
field most likely to silently corrupt every downstream quote if parsed
wrong, so the tool schema forces the model to be explicit about it (no
default) rather than guessing.
"""

import json

from app.core.openai_client import PARSER_MODEL, get_openai_client
from app.schemas.brief import ParsedBrief, ReviewStatus

# D2: deterministic thresholding of the AI's own confidence score. Below
# this, a brief is flagged needs_review regardless of what the model
# claims to believe — the threshold is deterministic code, the score
# behind it is not.
AUTO_ACCEPT_THRESHOLD = 0.75

EXTRACT_BRIEF_TOOL = {
    "type": "function",
    "function": {
        "name": "extract_brief",
        "description": (
            "Extract a structured event brief from a raw client enquiry (email, web "
            "form, or manual note). Only extract what the text actually supports — "
            "leave a field null rather than guessing, and lower confidence for "
            "anything inferred rather than stated outright."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "event_date": {
                    "type": ["string", "null"],
                    "description": "ISO 8601 date (YYYY-MM-DD) if a specific date is given, else null.",
                },
                "event_date_flexible": {
                    "type": "boolean",
                    "description": "True if the client indicated the date is flexible/negotiable.",
                },
                "guest_count": {"type": ["integer", "null"], "minimum": 1},
                "event_type": {
                    "type": ["string", "null"],
                    "description": "e.g. 'corporate gala', 'product launch', 'wedding reception'.",
                },
                "budget_amount": {"type": ["number", "null"], "minimum": 0},
                "budget_basis": {
                    "type": ["string", "null"],
                    "enum": ["total", "per_head", None],
                    "description": (
                        "Whether budget_amount is a total budget or a per-head figure. "
                        "MUST be set whenever budget_amount is set — never leave this "
                        "ambiguous; if genuinely unclear from the text, set budget_amount "
                        "to null instead of guessing the basis."
                    ),
                },
                "duration_hours": {"type": ["number", "null"], "exclusiveMinimum": 0},
                "location_preference": {"type": ["string", "null"]},
                "requirements": {
                    "type": "object",
                    "description": (
                        "Soft criteria for the recommendation engine's re-rank step (E2) — "
                        "free-form key/value, e.g. {'style': 'rooftop', 'catering': 'halal'}."
                    ),
                },
                "contact_hint": {
                    "type": "object",
                    "description": (
                        "Contact details found in the text, for staff to match/create a "
                        "contact record with. Not persisted on the brief itself."
                    ),
                    "properties": {
                        "full_name": {"type": ["string", "null"]},
                        "email": {"type": ["string", "null"]},
                        "phone": {"type": ["string", "null"]},
                    },
                },
                "confidence": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1,
                    "description": "Overall confidence (0-1) that this extraction is complete and correct.",
                },
            },
            "required": ["event_date_flexible", "requirements", "confidence"],
        },
    },
}


def score_review_status(confidence: float) -> ReviewStatus:
    return "auto_accepted" if confidence >= AUTO_ACCEPT_THRESHOLD else "needs_review"


def _call_extract_brief(raw_content: str) -> dict:
    client = get_openai_client()
    response = client.chat.completions.create(
        model=PARSER_MODEL,
        messages=[{"role": "user", "content": raw_content}],
        tools=[EXTRACT_BRIEF_TOOL],
        tool_choice={"type": "function", "function": {"name": "extract_brief"}},
    )
    tool_call = response.choices[0].message.tool_calls[0]
    return json.loads(tool_call.function.arguments)


def parse_enquiry(raw_content: str) -> ParsedBrief:
    return ParsedBrief(**_call_extract_brief(raw_content))


def parse_enquiry_raw(raw_content: str) -> dict:
    """Same as parse_enquiry but returns the unvalidated dict — useful for
    the golden test harness (D3) to diff raw model output against fixtures
    independent of our own schema's defaults."""
    return _call_extract_brief(raw_content)
