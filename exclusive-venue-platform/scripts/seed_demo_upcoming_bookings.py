"""One-time (idempotent) demo data — turns 3 existing draft/sent proposals
into "accepted, event happening soon" bookings, so the Dashboard's
Upcoming Bookings card, revenue trend, leaderboard, and venue
performance all have something real to render (they're empty on a
freshly-seeded DB since seed_demo_enquiries.py only creates enquiries/
briefs, no proposals).

Picks 3 already-seeded proposals that each resolve to exactly one
attributable venue (single proposal_venue, or exactly one marked
recommended — same rule app/routers/dashboard.py uses for revenue
attribution) and spreads their event_date across the next ~14 days.
Also moves each proposal's parent enquiry to stage='signed' directly via
the service-role client (bypassing the stage_machine transition check
that api/app/routers/enquiries.py enforces on real staff actions) — this
is seed data, not a staff workflow action, same shortcut
seed_demo_enquiries.py already takes to seed a "signed" row directly.

Idempotent: re-running just re-applies the same status/dates, no
duplication risk (nothing here inserts new rows).

Requires SUPABASE_URL + SUPABASE_SECRET_KEY (api/.env). Run:

    python scripts/seed_demo_upcoming_bookings.py
"""

import os
import sys
from datetime import date, timedelta

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "api", ".env"))

TODAY = date.today()

# (proposal_id, enquiry_id, days_from_today, venue_row_id_to_mark_recommended_or_None)
BOOKINGS = [
    ("de1d771e-9f22-43ec-abf3-1b2177e9fd60", "f20cc13f-d35e-4e3d-8528-0b53531f1f17", 3, None),
    ("7a05d8d7-ebd5-4c49-afe9-86279f022300", None, 8, None),
    ("2a57fb19-60db-4908-aa84-b58e9b24ce10", None, 13, "1595da9e-55a0-41f6-9fbe-94eecb76297c"),
]


def main() -> None:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SECRET_KEY"]
    client = create_client(url, key)

    for proposal_id, known_enquiry_id, days_out, recommend_venue_row_id in BOOKINGS:
        proposal = client.table("proposals").select("id, enquiry_id, title").eq("id", proposal_id).execute().data
        if not proposal:
            print(f"{proposal_id}: not found, skipping")
            continue
        proposal = proposal[0]
        enquiry_id = known_enquiry_id or proposal["enquiry_id"]
        event_date = (TODAY + timedelta(days=days_out)).isoformat()

        if recommend_venue_row_id:
            client.table("proposal_venues").update({"recommended": True}).eq("id", recommend_venue_row_id).execute()

        client.table("proposals").update({"status": "accepted", "event_date": event_date}).eq("id", proposal_id).execute()
        client.table("enquiries").update({"stage": "signed"}).eq("id", enquiry_id).execute()
        print(f"{proposal['title']!r}: accepted, event_date={event_date}, enquiry -> signed")

    print("\nDone. Refresh the Dashboard to see Upcoming Bookings + revenue populated.")


if __name__ == "__main__":
    sys.exit(main())
