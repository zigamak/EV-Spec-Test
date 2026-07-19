"""Backfill the proposal-detail fields added in migration 0012 with demo
data — venue amenities, and per-brief catering + decision_by — so the
detailed proposal document has comprehensive content to render.

Idempotent-ish: sets amenities on the known demo venues (by slug) and fills
catering/decision_by only where they're currently empty. Safe to re-run.

Requires SUPABASE_URL + SUPABASE_SECRET_KEY (api/.env). Run after
`alembic upgrade head`:

    python scripts/backfill_proposal_detail_fields.py
"""

import os
import sys
from datetime import date, datetime, timedelta

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "api", ".env"))

VENUE_AMENITIES = {
    "peak-skyline-hall": ["Floor-to-ceiling glass", "Catering kitchen", "AV & staging", "Private lift lobby"],
    "wan-chai-warehouse-loft": ["Loading bay", "5m ceilings", "Blackout capable", "Freight lift"],
    "repulse-bay-garden-pavilion": ["Garden & lawn", "Covered pavilion", "Beach access", "On-site parking"],
    "victoria-harbour-yacht": ["Open sun deck", "Full bar", "Crew & captain", "Sound system"],
    "sai-kung-clifftop-villa": ["Infinity pool", "Full kitchen", "Overnight suites", "Private jetty"],
}


def _catering_for(event_type: str | None) -> str:
    e = (event_type or "").lower()
    if any(k in e for k in ("cocktail", "launch", "activation", "party", "reception")):
        return "Canapés & premium bar"
    if any(k in e for k in ("gala", "dinner", "wedding", "banquet", "partners")):
        return "Seated dinner · sommelier pairing"
    if any(k in e for k in ("conference", "offsite", "workshop", "developer")):
        return "Working lunch · all-day refreshments"
    if "cruise" in e or "yacht" in e:
        return "Light bites & champagne"
    return "Bespoke menu · to be confirmed"


def main() -> None:
    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])

    venues_set = 0
    for slug, amenities in VENUE_AMENITIES.items():
        res = client.table("venues").update({"amenities": amenities}).eq("slug", slug).execute()
        venues_set += len(res.data or [])
    print(f"amenities set on {venues_set} venues")

    briefs = (
        client.table("briefs")
        .select("id, event_type, catering, decision_by, date_window_start")
        .execute()
        .data
    )
    filled = 0
    for brief in briefs:
        patch: dict = {}
        if not brief.get("catering"):
            patch["catering"] = _catering_for(brief.get("event_type"))
        if not brief.get("decision_by") and brief.get("date_window_start"):
            event_date = datetime.fromisoformat(brief["date_window_start"]).date()
            # Decide ~3 weeks before the event, never in the past.
            decide = max(event_date - timedelta(days=21), date.today() + timedelta(days=3))
            patch["decision_by"] = decide.isoformat()
        if patch:
            client.table("briefs").update(patch).eq("id", brief["id"]).execute()
            filled += 1
    print(f"catering/decision_by filled on {filled} briefs")


if __name__ == "__main__":
    sys.exit(main())
