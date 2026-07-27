"""Order payments via Stripe PaymentIntents (erd.md §6b, plan.md §3).

Payments are fully decoupled from orders — creating one is a separate,
optional step (an order can sit at status='pending' with none at all, the
pay-later/quote path explicitly requested). The Stripe SDK import is
lazy (matches app/core/llm.py's pattern for AI providers) so this module
stays importable without the `stripe` package installed.

**Untested against a live Stripe account** — no keys configured in this
environment, same caveat as every other external-service integration in
this codebase (D1's GPT parser, B2's Supabase invite call).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from postgrest.exceptions import APIError
from supabase import Client

from app.core.admin_client import get_admin_client
from app.core.auth import StaffUser, require_staff_session
from app.core.config import get_settings
from app.core.scoped_client import get_scoped_client
from app.schemas.payment import Payment, PaymentCreate

router = APIRouter(prefix="/payments", tags=["payments"])

ScopedClient = Annotated[Client, Depends(get_scoped_client)]
Caller = Annotated[StaffUser, Depends(require_staff_session)]


@router.post("", response_model=Payment, status_code=status.HTTP_201_CREATED)
def create_payment(payload: PaymentCreate):
    """Public — a guest completing checkout has no session. Creates a
    Stripe PaymentIntent for the order's amount and records a 'pending'
    payments row; the webhook below is what actually marks it succeeded."""
    settings = get_settings()
    if not settings.stripe_secret_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Stripe is not configured")

    import stripe

    stripe.api_key = settings.stripe_secret_key
    try:
        intent = stripe.PaymentIntent.create(
            amount=int(round(payload.amount * 100)),  # Stripe expects the smallest currency unit
            currency=payload.currency.lower(),
            metadata={"order_id": str(payload.order_id)},
        )
    except Exception as exc:  # stripe.error.StripeError et al — SDK is a lazy import
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Stripe error: {exc}") from exc

    admin = get_admin_client()
    result = (
        admin.table("payments")
        .insert(
            {
                "order_id": str(payload.order_id),
                "payment_method": payload.payment_method,
                "stripe_payment_intent_id": intent.id,
                "amount": payload.amount,
                "currency": payload.currency,
            }
        )
        .execute()
    )
    return result.data[0]


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(request: Request):
    """Stripe's own signature scheme (distinct from the Svix one
    webhooks.py's Resend handler uses) — verified before anything is
    trusted. Fails closed (503) if the webhook secret isn't configured,
    same as the Resend handler, rather than silently accepting unverified
    input on an unauthenticated public endpoint."""
    settings = get_settings()
    if not settings.stripe_webhook_secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "STRIPE_WEBHOOK_SECRET is not configured")

    import stripe

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
    except (ValueError, stripe.error.SignatureVerificationError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Stripe signature") from exc

    admin = get_admin_client()
    intent = event["data"]["object"]
    intent_id = intent.get("id")

    if event["type"] == "payment_intent.succeeded":
        from datetime import UTC, datetime

        admin.table("payments").update(
            {"status": "succeeded", "paid_at": datetime.now(UTC).isoformat()}
        ).eq("stripe_payment_intent_id", intent_id).execute()
    elif event["type"] == "payment_intent.payment_failed":
        admin.table("payments").update({"status": "failed"}).eq(
            "stripe_payment_intent_id", intent_id
        ).execute()

    return {"status": "received"}


@router.get("/{order_id}", response_model=list[Payment])
def list_payments_for_order(order_id: str, client: ScopedClient, _: Caller):
    try:
        result = client.table("payments").select("*").eq("order_id", order_id).execute()
    except APIError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.message) from exc
    return result.data
