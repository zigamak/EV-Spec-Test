"""Validation schema for the payment_methods reference table (erd.md
§6b). Mirrors migrations/versions/0032_payment_methods.py. Read-only
from the API's perspective, same as currencies.
"""

from pydantic import BaseModel


class PaymentMethod(BaseModel):
    code: str
    name: str
    enabled: bool
