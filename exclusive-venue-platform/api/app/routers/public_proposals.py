"""Public, unauthenticated proposal read (backs G5's shareable link page).

anon has no RLS policy on proposals/proposal_venues at all (rls-matrix.md
hard line) — this endpoint is the only sanctioned way in, playing the
role a Supabase edge function would in a pure-Supabase stack: it uses the
service-role client (bypasses RLS), but only after validating the token
itself (exists, not expired, not revoked) in code. It returns a narrowed
view (PublicProposal) — no internal ids, no pricing_rules_id, nothing
beyond what a client should see of their own proposal.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, status

from app.core.admin_client import get_admin_client
from app.core.rate_limit import enforce_public_rate_limit
from app.schemas.proposal import PublicProposal, PublicProposalVenue, ProposalEventCreate

router = APIRouter(prefix="/public/proposals", tags=["public-proposals"])


def _validate_token(client, token: str) -> dict:
    token_result = client.table("proposal_link_tokens").select("*").eq("token", token).execute()
    if not token_result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Link not found")

    token_row = token_result.data[0]
    if token_row["revoked"]:
        raise HTTPException(status.HTTP_410_GONE, "This link has been revoked")
    if datetime.fromisoformat(token_row["expires_at"]) < datetime.now(UTC):
        raise HTTPException(status.HTTP_410_GONE, "This link has expired")
    return token_row


@router.get("/{token}", response_model=PublicProposal)
def get_public_proposal(token: str, request: Request):
    enforce_public_rate_limit(request, token)
    client = get_admin_client()
    token_row = _validate_token(client, token)

    proposal_row = (
        client.table("proposals").select("*").eq("id", token_row["proposal_id"]).execute().data[0]
    )
    venue_rows = (
        client.table("proposal_venues")
        .select("*")
        .eq("proposal_id", proposal_row["id"])
        .order("sort_order")
        .execute()
        .data
    )

    venues = []
    for row in venue_rows:
        venue = client.table("venues").select("name").eq("id", row["venue_id"]).execute().data[0]
        configuration = (
            client.table("venue_configurations")
            .select("name")
            .eq("id", row["configuration_id"])
            .execute()
            .data[0]
        )
        venues.append(
            PublicProposalVenue(
                venue_id=row["venue_id"],
                venue_name=venue["name"],
                configuration_name=configuration["name"],
                quote_total=row["quote_total"],
                venue_copy=row["venue_copy"],
                sort_order=row["sort_order"],
                recommended=row["recommended"],
            )
        )

    return PublicProposal(
        title=proposal_row["title"],
        intro_copy=proposal_row["intro_copy"],
        legal_boilerplate=proposal_row["legal_boilerplate"],
        currency=proposal_row["currency"],
        status=proposal_row["status"],
        venues=venues,
    )


@router.post("/{token}/events", status_code=status.HTTP_204_NO_CONTENT)
def record_proposal_event(token: str, payload: ProposalEventCreate, request: Request):
    """Written by the public link page itself (open on load, venue_seen
    per venue card scrolled into view — see web/app/p/[token]/page.tsx).
    Same trust model as the GET above: token validated before anything
    is trusted, service-role client, no staff session involved."""
    enforce_public_rate_limit(request, token)
    client = get_admin_client()
    token_row = _validate_token(client, token)
    proposal_id = token_row["proposal_id"]

    if payload.event_type == "venue_seen" and payload.venue_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "venue_id is required for venue_seen events")

    client.table("proposal_analytics_events").insert(
        {
            "proposal_id": proposal_id,
            "venue_id": str(payload.venue_id) if payload.venue_id else None,
            "event_type": payload.event_type,
        }
    ).execute()

    if payload.event_type == "open":
        # Only ever moves status forward from 'sent' — never overwrites a
        # later real state (accepted/declined) or a still-draft proposal
        # a client shouldn't have a link to in the first place.
        proposal_row = client.table("proposals").select("status").eq("id", proposal_id).execute().data
        if proposal_row and proposal_row[0]["status"] == "sent":
            client.table("proposals").update({"status": "viewed"}).eq("id", proposal_id).execute()
