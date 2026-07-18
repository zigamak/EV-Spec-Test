"""Activity-log schema (task K1). Mirrors migrations/versions/0010_activity_log.py."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel

ActorType = Literal["human", "ai", "system"]
ActivityLevel = Literal["info", "warning", "error"]


class ActivityLog(BaseModel):
    id: UUID
    created_at: datetime
    actor_type: ActorType
    actor_id: UUID | None
    actor_label: str | None
    action: str
    entity_type: str | None
    entity_id: UUID | None
    enquiry_id: UUID | None
    level: ActivityLevel
    summary: str | None
    metadata: dict[str, Any]
