"""Validation schema for the currencies reference table (erd.md §6a, task A1).
Mirrors migrations/versions/0025_currencies.py. Read-only from the API's
perspective in this build — no create/update endpoints, staff manage rows
directly if a new currency is ever needed.
"""

from datetime import datetime

from pydantic import BaseModel


class Currency(BaseModel):
    code: str
    symbol: str
    name: str
    created_at: datetime
    updated_at: datetime
