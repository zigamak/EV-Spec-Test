"""Public currency reference data (task A2). RLS already allows anon
SELECT (0025_currencies.py's currencies_anon_select policy), but there's
no per-request validation logic here worth a scoped client's auth
round-trip — same admin-client-for-trivial-public-reads pattern as
public_proposals.py, just without any token to validate first.
"""

from fastapi import APIRouter

from app.core.admin_client import get_admin_client
from app.schemas.currency import Currency

router = APIRouter(prefix="/currencies", tags=["currencies"])


@router.get("", response_model=list[Currency])
def list_currencies():
    client = get_admin_client()
    result = client.table("currencies").select("*").order("code").execute()
    return result.data
