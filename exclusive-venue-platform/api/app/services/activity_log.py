"""Activity-log writer (task K1) — the one place that appends audit rows.

**How production systems do audit logging**, and why it's shaped this way:

  1. Append-only. Rows are never updated or deleted — an audit trail you can
     rewrite is worthless. Corrections are new rows (0010 grants no
     UPDATE/DELETE policy, so even a staff session can't rewrite history).
  2. Structured, not just text. `action` is a stable dotted verb and
     `metadata` is jsonb, so you can query ("every brief.parse_failed
     today") rather than grep prose. `level` makes errors first-class.
  3. Actor attribution. Every row says whether a human (with their user id),
     an AI step (with the model), or the system did it — the core question
     an audit answers.
  4. Fail-soft. Writing an audit row must NEVER break or roll back the
     action being audited. Every call here swallows its own errors (logging
     them to the app log instead), so a logging outage degrades the audit
     trail, never the feature. This is why it's a best-effort side call, not
     part of the same transaction.

Bigger deployments layer more on top (an append-only store or WORM bucket,
log shipping to a SIEM, tamper-evident hash chaining, retention policies) —
this table is the application-level trail those would ingest.
"""

import logging
from typing import Any

from app.schemas.activity import ActivityLevel, ActorType

logger = logging.getLogger("app")


def log_activity(
    client: Any,
    *,
    action: str,
    actor_type: ActorType = "system",
    actor_id: str | None = None,
    actor_label: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    enquiry_id: str | None = None,
    level: ActivityLevel = "info",
    summary: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Append one audit row via `client` (scoped for human actions, admin/
    service-role for AI/system/webhook writes). Best-effort: any failure is
    logged to the app log and swallowed, never raised — auditing must not
    take down the thing it audits."""
    body = {
        "action": action,
        "actor_type": actor_type,
        "actor_id": actor_id,
        "actor_label": actor_label,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "enquiry_id": enquiry_id,
        "level": level,
        "summary": summary,
        "metadata": metadata or {},
    }
    try:
        client.table("activity_log").insert(body).execute()
    except Exception:
        logger.exception(
            "activity_log write failed for action %s (audit gap, action itself unaffected)", action
        )
