"""Auto-parse an inbound enquiry into a structured brief at intake time
(task D6). For free-text channels (email, WhatsApp) the brief should be
waiting the moment staff open the enquiry, not gated on a manual click.

**Fail-soft by design:** the raw enquiry is already persisted before this
runs, so a parser outage (no API key, provider error, malformed output)
must never lose or block the enquiry — it just means no brief yet, which a
human can trigger later via POST /enquiries/{id}/briefs/parse. This mirrors
the AI-paths' fail-soft stance (constitution #1: AI is a suggestion, never
load-bearing), unlike the webhook's own signature check which fails closed.

The structured *website form* channel deliberately does NOT use this — a
client's structured answers aren't a parsing problem; that path should
construct a ParsedBrief directly (confidence=1.0). See brief_parser.py.

Stage is intentionally left at 'enquiry': an auto-parsed brief is a
suggestion, so a human still moves it to 'briefed' after reviewing.
"""

import logging
from typing import Any

from app.core.llm import LLMCallError, LLMUnavailableError
from app.services.activity_log import log_activity
from app.services.brief_parser import current_parser_model, parse_enquiry, score_review_status

logger = logging.getLogger("app")


def auto_parse_enquiry(admin_client: Any, enquiry_id: str, raw_content: str) -> dict | None:
    """Parse `raw_content` and store a v1 brief for `enquiry_id` via the
    service-role client. Returns the brief row, or None if parsing/storing
    failed (already logged) — callers should treat None as "no brief yet",
    never as an error to surface to the sender."""
    try:
        parsed = parse_enquiry(raw_content)
    except (LLMUnavailableError, LLMCallError) as exc:
        logger.warning("Auto-parse skipped for enquiry %s: %s", enquiry_id, exc)
        log_activity(
            admin_client,
            action="brief.parse_failed",
            actor_type="ai",
            entity_type="enquiry",
            entity_id=enquiry_id,
            enquiry_id=enquiry_id,
            level="error",
            summary="Auto-parse at intake failed — enquiry saved without a brief",
            metadata={"error": str(exc)},
        )
        return None
    except Exception as exc:
        logger.exception("Auto-parse errored unexpectedly for enquiry %s", enquiry_id)
        log_activity(
            admin_client,
            action="brief.parse_failed",
            actor_type="ai",
            entity_type="enquiry",
            entity_id=enquiry_id,
            enquiry_id=enquiry_id,
            level="error",
            summary="Auto-parse at intake errored unexpectedly",
            metadata={"error": repr(exc)},
        )
        return None

    body = {
        **parsed.model_dump(mode="json", exclude={"contact_hint"}),
        "enquiry_id": enquiry_id,
        "version": 1,
        "review_status": score_review_status(parsed.confidence),
        "parser_model": current_parser_model(),
    }
    try:
        result = admin_client.table("briefs").insert(body).execute()
    except Exception:
        logger.exception("Failed to store auto-parsed brief for enquiry %s", enquiry_id)
        return None

    brief = result.data[0] if result.data else None
    if brief:
        log_activity(
            admin_client,
            action="brief.parsed",
            actor_type="ai",
            actor_label=current_parser_model(),
            entity_type="brief",
            entity_id=brief["id"],
            enquiry_id=enquiry_id,
            summary=(
                f"AI auto-parsed brief at intake "
                f"(confidence {parsed.confidence:.0%}, {body['review_status']})"
            ),
            metadata={"confidence": parsed.confidence, "trigger": "intake"},
        )
    return brief
