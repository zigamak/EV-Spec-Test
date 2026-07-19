"""AI Brief Parser (tasks D1/D2, standardized 18 Jul — task D5) — enquiry
text -> structured brief JSON.

GPT tool-calling only produces a *candidate* brief; nothing here is
authoritative until it passes ParsedBrief validation (constitution #1) and,
below AUTO_ACCEPT_THRESHOLD, a human review (D4). budget_basis is the one
field most likely to silently corrupt every downstream quote if parsed
wrong, so the tool schema forces the model to be explicit about it (no
default) rather than guessing.

**Standardized 18 Jul (task D5):** this is the one brief contract every
channel targets — email, WhatsApp, or a manual staff note all go through
`parse_enquiry()` below and land on the same fields. The *public web form*
(C2, not yet built) is the deliberate exception: a client filling
structured form inputs isn't a parsing problem at all, so that path should
construct a `ParsedBrief` directly from the submitted fields (confidence=
1.0, skip this module entirely) rather than round-tripping through the AI
on its own answers. See erd.md §5.1.
"""

from app.core.llm import ToolSchema, get_llm_client
from app.schemas.brief import ParsedBrief, ReviewStatus

# D2: deterministic thresholding of the AI's own confidence score. Below
# this, a brief is flagged needs_review regardless of what the model
# claims to believe — the threshold is deterministic code, the score
# behind it is not.
AUTO_ACCEPT_THRESHOLD = 0.75

EXTRACT_BRIEF_TOOL = ToolSchema(
    name="extract_brief",
    description=(
        "Extract a structured event brief from a raw client enquiry (email, "
        "WhatsApp message, web form, or manual note). Only extract what the text "
        "actually supports — leave a field null/empty rather than guessing, and "
        "name any uncertain field in flagged_fields rather than silently lowering "
        "the overall confidence and hoping someone notices."
    ),
    parameters={
        "type": "object",
        "properties": {
            "date_window_start": {
                "type": ["string", "null"],
                "description": (
                    "ISO 8601 date (YYYY-MM-DD) for the earliest acceptable event "
                    "date. If the client gave one specific date, set both "
                    "date_window_start and date_window_end to it."
                ),
            },
            "date_window_end": {
                "type": ["string", "null"],
                "description": "ISO 8601 date for the latest acceptable event date.",
            },
            "date_suggestions": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Candidate specific dates worth proposing back to the client when "
                    "the window isn't narrowed to one day yet, e.g. two Saturdays "
                    "inside the window. Empty array if nothing to suggest."
                ),
            },
            "event_date_flexible": {
                "type": "boolean",
                "description": (
                    "True if the exact date within the window is still unconfirmed with the client."
                ),
            },
            "guest_count": {"type": ["integer", "null"], "minimum": 1},
            "event_type": {
                "type": ["string", "null"],
                "description": (
                    "e.g. 'corporate gala', 'product launch', 'brand cocktail', 'wedding reception'."
                ),
            },
            "duration_hours": {"type": ["number", "null"], "exclusiveMinimum": 0},
            "time_of_day": {
                "type": ["string", "null"],
                "enum": ["morning", "afternoon", "evening", "full_day", None],
            },
            "budget_amount": {
                "type": ["number", "null"],
                "minimum": 0,
                "description": (
                    "Only set when the client gave a firm figure — otherwise use budget_estimate_low/high."
                ),
            },
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
            "budget_status": {
                "type": "string",
                "enum": ["confirmed", "tbc", "unspecified"],
                "description": (
                    "'confirmed' if the client stated a real figure (budget_amount set), "
                    "'tbc' if they raised budget as a topic without a number (e.g. "
                    "'budget TBC' or 'still finalizing'), 'unspecified' if budget wasn't "
                    "mentioned at all."
                ),
            },
            "budget_estimate_low": {
                "type": ["number", "null"],
                "minimum": 0,
                "description": (
                    "Your own rough estimate range when budget_status is 'tbc', based on event "
                    "scale — both bounds or neither."
                ),
            },
            "budget_estimate_high": {"type": ["number", "null"], "minimum": 0},
            "location_preference": {
                "type": ["string", "null"],
            },
            "catering": {
                "type": ["string", "null"],
                "description": "Catering brief if mentioned, e.g. 'light bites and champagne'.",
            },
            "decision_by": {
                "type": ["string", "null"],
                "description": "ISO 8601 date (YYYY-MM-DD) the client needs to decide by, if stated.",
            },
            "requirements": {
                "type": "object",
                "description": (
                    "Soft criteria for the recommendation engine's re-rank step (E2). "
                    "Prefer these conventional keys when the text supports them — "
                    "format_needs (array, e.g. ['panel','certificate','f&b']), "
                    "tech_needs (array, e.g. ['branded_backdrop','av']), "
                    "mood (array of short descriptive words/phrases), "
                    "attachments (array of {name, url} for anything referenced, e.g. a "
                    "moodboard) — plus any other free-form key genuinely useful and not "
                    "covered above."
                ),
            },
            "flagged_fields": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Names of fields above where you're genuinely uncertain about the "
                    "extraction (not just 'unspecified' — actually ambiguous or inferred "
                    "rather than stated). e.g. ['date_window_end']."
                ),
            },
            "fields_to_confirm": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Names of fields worth a staff member explicitly confirming with the "
                    "client before proceeding, even if your extraction confidence is "
                    "fine — e.g. a flexible date window, or a TBC budget."
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
        "required": ["event_date_flexible", "budget_status", "requirements", "confidence"],
    },
)


def score_review_status(confidence: float) -> ReviewStatus:
    return "auto_accepted" if confidence >= AUTO_ACCEPT_THRESHOLD else "needs_review"


def current_parser_model() -> str:
    """Whichever model the active provider uses — recorded on each brief
    (`parser_model` column) for reproducibility, independent of which
    provider was active when a given brief was parsed."""
    return get_llm_client().MODEL


def _call_extract_brief(raw_content: str) -> dict:
    return get_llm_client().call_tool(raw_content, EXTRACT_BRIEF_TOOL)


def parse_enquiry(raw_content: str) -> ParsedBrief:
    return ParsedBrief(**_call_extract_brief(raw_content))


def parse_enquiry_raw(raw_content: str) -> dict:
    """Same as parse_enquiry but returns the unvalidated dict — useful for
    the golden test harness (D3) to diff raw model output against fixtures
    independent of our own schema's defaults."""
    return _call_extract_brief(raw_content)
