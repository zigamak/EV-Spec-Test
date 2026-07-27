"""Public payment method reference data. Same trivial-public-read
pattern as app/routers/currencies.py.
"""

from fastapi import APIRouter

from app.core.admin_client import get_admin_client
from app.schemas.payment_method import PaymentMethod

router = APIRouter(prefix="/payment-methods", tags=["payment-methods"])


@router.get("", response_model=list[PaymentMethod])
def list_payment_methods():
    client = get_admin_client()
    result = client.table("payment_methods").select("*").eq("enabled", True).execute()
    return result.data
