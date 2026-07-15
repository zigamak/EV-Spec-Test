"""Inbound webhooks (task C4): Resend's enquiries@ inbound-parse webhook
-> a raw enquiry record. Unauthenticated by necessity (Resend's servers
call this, not a staff session) — the Svix signature is the only thing
standing between this endpoint and arbitrary internet input, so it's
verified before a single byte of the payload is trusted (constitution's
spirit: deterministic code, not a session, gates a write here). Uses the
service-role client, the same "plays the edge-function role" pattern as
routers/public_proposals.py — anon has no RLS policy on contacts/
enquiries at all (rls-matrix.md).

**Untested against a live Resend account** — no inbound-email domain is
configured in this environment. See app/schemas/webhook.py for the same
caveat on the payload shape itself.
"""

import json
from email.utils import parseaddr

from fastapi import APIRouter, HTTPException, Request, status

from app.core.admin_client import get_admin_client
from app.core.config import get_settings
from app.schemas.webhook import ResendInboundEmailData, ResendInboundEmailEvent
from app.services.webhook_verification import WebhookVerificationError, verify_svix_signature

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/resend/inbound-email", status_code=status.HTTP_200_OK)
async def resend_inbound_email(request: Request):
    settings = get_settings()
    if not settings.resend_webhook_secret:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "RESEND_WEBHOOK_SECRET is not configured"
        )

    svix_id = request.headers.get("svix-id")
    svix_timestamp = request.headers.get("svix-timestamp")
    svix_signature = request.headers.get("svix-signature")
    if not (svix_id and svix_timestamp and svix_signature):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing webhook signature headers")

    body = await request.body()
    try:
        verify_svix_signature(
            settings.resend_webhook_secret, svix_id, svix_timestamp, svix_signature, body
        )
    except WebhookVerificationError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc

    try:
        payload = json.loads(body)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid JSON body") from exc

    event = ResendInboundEmailEvent(
        type=payload.get("type", ""),
        data=ResendInboundEmailData(**(payload.get("data") or {})),
        raw_payload=payload,
    )

    # Always ack with 2xx once the signature checks out, even for an event
    # type this endpoint doesn't act on — the alternative is Resend
    # retrying a webhook we deliberately ignore, which just wastes calls.
    if not event.type.startswith("email."):
        return {"status": "ignored", "type": event.type}

    sender_name, sender_email = parseaddr(event.data.from_ or "")
    display_name = sender_name or sender_email or "Unknown sender"
    raw_content = event.data.text or event.data.html or "(no body captured in webhook payload)"
    if event.data.subject:
        raw_content = f"Subject: {event.data.subject}\n\n{raw_content}"

    admin = get_admin_client()

    contact_id = None
    if sender_email:
        existing = (
            admin.table("contacts").select("id").eq("email", sender_email).limit(1).execute()
        )
        if existing.data:
            contact_id = existing.data[0]["id"]
        else:
            created = (
                admin.table("contacts")
                .insert({"full_name": display_name, "email": sender_email, "source": "email"})
                .execute()
            )
            contact_id = created.data[0]["id"]

    enquiry = (
        admin.table("enquiries")
        .insert({"contact_id": contact_id, "channel": "email", "raw_content": raw_content})
        .execute()
    )

    return {"status": "received", "enquiry_id": enquiry.data[0]["id"]}
