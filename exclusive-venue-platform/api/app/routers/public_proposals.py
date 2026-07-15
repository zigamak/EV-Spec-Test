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

from fastapi import APIRouter, HTTPException, status

from app.core.admin_client import get_admin_client
from app.schemas.proposal import PublicProposal, PublicProposalVenue

router = APIRouter(prefix="/public/proposals", tags=["public-proposals"])


@router.get("/{token}", response_model=PublicProposal)
def get_public_proposal(token: str):
    client = get_admin_client()

    token_result = (
        client.table("proposal_link_tokens").select("*").eq("token", token).execute()
    )
    if not token_result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Link not found")

    token_row = token_result.data[0]
    if token_row["revoked"]:
        raise HTTPException(status.HTTP_410_GONE, "This link has been revoked")
    if datetime.fromisoformat(token_row["expires_at"]) < datetime.now(UTC):
        raise HTTPException(status.HTTP_410_GONE, "This link has expired")

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
