"""Seed script (task H3, added 18 Jul; stages revised same day for the
5-stage pipeline revamp; brief fields standardized same day again — task
D5) — demo enquiries spanning every stage of the pipeline AND every
channel, so the Pipeline Board shows a realistic Open/Awaiting/Won/Lost
spread and the Command Center shows what a standardized, cross-channel
brief actually looks like, without waiting on real client enquiries
(those are gated on a Sprint Board human task — see fixtures/README.md
and CLAUDE.md). Mirrors scripts/seed_demo_venues.py's pattern.

Idempotent — matches by contact email, skips enquiries whose contact
already exists rather than duplicating them.

Uses the service-role client directly (bypasses RLS), same as
seed_demo_venues.py, since this is a one-time dev/staging fixture, not a
staff request through the API.

Run once per environment (after seed_demo_venues.py, order doesn't
actually matter — enquiries don't reference venues). Requires migrations
0007 AND 0008 to already be applied (`alembic upgrade head`) — the old
briefs.event_date column no longer exists after 0008, so these rows will
be rejected otherwise:

    python scripts/seed_demo_enquiries.py

Requires SUPABASE_URL + SUPABASE_SECRET_KEY (api/.env).

What you'll see afterward: a fuller spread across every pipeline stage
(Open/Awaiting/Won/Lost) and every channel — web_form, whatsapp, email,
manual, concierge — so the inbox channel badges, the status pills, and the
Command Center's brief card all have realistic, varied data. WhatsApp and
web-form intake are over-represented on purpose (the two channels most
worth exercising: casual free text vs. structured form). "lost" is
collapsed out of the main kanban by design (per H2), visible via its pill.

And on the Command Center for the Luxe & Co. entry specifically: a full
standardized brief — client tier + rate card, a date window with two
suggested dates, a TBC budget with an AI-estimated range, mood/format/
tech needs, and flagged_fields/fields_to_confirm populated — the same
shape observed live on the reference prototype's Dior enquiry.

`assigned_to` is left null on every row — this script doesn't know which
staff user id exists in your Supabase project. Assign them from the
Pipeline Board / Command Center after seeding if you want to see the
assignee avatar.
"""

import os
import sys
from datetime import date, timedelta

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "api", ".env"))

TODAY = date.today()


def _single_date(days_from_today: int) -> dict:
    """A brief whose date is effectively locked — window start == end."""
    d = str(TODAY + timedelta(days=days_from_today))
    return {"date_window_start": d, "date_window_end": d}


DEMO_ENQUIRIES = [
    {
        "organisation": {
            "name": "Meridian Capital Partners",
            "kind": "corporate",
            "tier": "tier-2",
            "region": "Hong Kong",
        },
        "contact": {
            "full_name": "Rachel Tang",
            "email": "demo.rachel.tang@exclusivevenue.demo",
            "phone": "+852 9123 4561",
            "source": "web_form",
        },
        "enquiry": {
            "channel": "web_form",
            "raw_content": (
                "Hi, we're looking for a venue for our Q3 product launch. "
                "Around 150 guests, cocktail-style, budget roughly HKD 400/head. "
                "Ideally mid-September, harbour view would be a big plus."
            ),
            "stage": "enquiry",
        },
        "brief": {
            "event_type": "Product launch",
            "guest_count": 150,
            **_single_date(45),
            "event_date_flexible": False,
            "budget_amount": 400,
            "budget_basis": "per_head",
            "budget_status": "confirmed",
            "duration_hours": 4,
            "time_of_day": "evening",
            "location_preference": "Harbour view",
            "requirements": {"format_needs": ["product reveal", "press wall"]},
            "confidence": 0.91,
            "review_status": "auto_accepted",
        },
    },
    {
        "organisation": None,
        "contact": {
            "full_name": "David Ho",
            "email": "demo.david.ho@exclusivevenue.demo",
            "phone": "+852 9123 4562",
            "source": "whatsapp",
        },
        "enquiry": {
            # WhatsApp demo — same target brief shape as email/web_form,
            # proving the standardization is genuinely channel-agnostic
            # (task D5). raw_content reads like a WhatsApp message on
            # purpose: shorter, no greeting/sign-off formality.
            "channel": "whatsapp",
            "raw_content": (
                "hi sammi! my wife's turning 40 and i want to throw her a surprise "
                "dinner. maybe 30-40 people, somewhere with a nice garden or outdoor "
                "space. budget flexible, sometime in november"
            ),
            "stage": "enquiry",
        },
        "brief": {
            "event_type": "Birthday celebration",
            "guest_count": 35,
            "date_window_start": str(TODAY + timedelta(days=65)),
            "date_window_end": str(TODAY + timedelta(days=80)),
            "event_date_flexible": True,
            "budget_amount": None,
            "budget_status": "unspecified",
            "duration_hours": 3,
            "time_of_day": "evening",
            "location_preference": "Garden / outdoor",
            "requirements": {"mood": ["intimate", "surprise"]},
            "confidence": 0.62,
            "flagged_fields": ["date_window_end", "budget_status"],
            "fields_to_confirm": ["date_window_end"],
            "review_status": "needs_review",
        },
    },
    {
        "organisation": None,
        "contact": {
            "full_name": "Priya & Arjun Nair",
            "email": "demo.priya.nair@exclusivevenue.demo",
            "phone": "+852 9123 4563",
            "source": "manual",
        },
        "enquiry": {
            "channel": "manual",
            "raw_content": (
                "Walked in / called about a wedding reception, ~120 guests, "
                "seated banquet, looking at next spring. Reviewed and confirmed "
                "the brief details with the couple directly."
            ),
            "stage": "briefed",
        },
        "brief": {
            "event_type": "Wedding reception",
            "guest_count": 120,
            **_single_date(200),
            "event_date_flexible": False,
            "budget_amount": 90000,
            "budget_basis": "total",
            "budget_status": "confirmed",
            "duration_hours": 6,
            "time_of_day": "evening",
            "confidence": 0.88,
            "review_status": "human_approved",
        },
    },
    {
        # Flagship example of the standardized brief (task D5) — mirrors
        # the field set observed live on the reference prototype's Dior
        # enquiry: client tier + rate card, a date window with suggested
        # dates, a TBC budget with an AI-estimated range, mood/format/
        # tech needs, and per-field flags.
        "organisation": {
            "name": "Luxe & Co. Brand Agency",
            "kind": "agency",
            "tier": "tier-1",
            "rate_card_on_file": True,
            "rate_card_terms": "Standard Tier-1 agency terms, 12% service",
            "region": "Asia-Pacific · Hong Kong office",
        },
        "contact": {
            "full_name": "Michelle Wong",
            "email": "demo.michelle.wong@exclusivevenue.demo",
            "phone": "+852 9123 4564",
            "source": "web_form",
        },
        "enquiry": {
            "channel": "web_form",
            "raw_content": (
                "Client brand activation for a fashion label, industrial/loft "
                "aesthetic preferred, 250 guests, white party theme. Looking at "
                "late September or early October, budget still being finalized "
                "internally with the client."
            ),
            "stage": "proposed",
        },
        "brief": {
            "event_type": "Brand activation · white party",
            "guest_count": 250,
            "date_window_start": str(TODAY + timedelta(days=68)),
            "date_window_end": str(TODAY + timedelta(days=82)),
            "date_suggestions": [
                str(TODAY + timedelta(days=70)),
                str(TODAY + timedelta(days=77)),
            ],
            "event_date_flexible": True,
            "budget_amount": None,
            "budget_status": "tbc",
            "budget_estimate_low": 280000,
            "budget_estimate_high": 400000,
            "duration_hours": 5,
            "time_of_day": "evening",
            "requirements": {
                "format_needs": ["step and repeat", "DJ set", "press check-in"],
                "tech_needs": ["branded backdrop", "AV", "lighting rig"],
                "mood": ["industrial", "loft", "high-energy"],
            },
            "confidence": 0.94,
            "flagged_fields": ["budget_status"],
            "fields_to_confirm": ["date_window_end", "budget_status"],
            "review_status": "auto_accepted",
        },
    },
    {
        "organisation": {"name": "Harborview Productions", "kind": "production_house"},
        "contact": {
            "full_name": "Jonathan Lee",
            "email": "demo.jonathan.lee@exclusivevenue.demo",
            "phone": "+852 9123 4565",
            "source": "email",
        },
        "enquiry": {
            "channel": "email",
            "raw_content": (
                "Gala dinner for 180, black-tie, currently going back and forth "
                "on venue configuration and a couple of add-ons before they sign off."
            ),
            "stage": "held",
        },
        "brief": {
            "event_type": "Gala dinner",
            "guest_count": 180,
            **_single_date(55),
            "event_date_flexible": False,
            "budget_amount": 130000,
            "budget_basis": "total",
            "budget_status": "confirmed",
            "duration_hours": 5,
            "time_of_day": "evening",
            "confidence": 0.9,
            "review_status": "human_approved",
        },
    },
    {
        "organisation": {
            "name": "Stellar Holdings Group",
            "kind": "corporate",
            "tier": "tier-1",
            "rate_card_on_file": True,
        },
        "contact": {
            "full_name": "Angela Chan",
            "email": "demo.angela.chan@exclusivevenue.demo",
            "phone": "+852 9123 4566",
            "source": "concierge",
        },
        "enquiry": {
            "channel": "concierge",
            "raw_content": (
                "Annual company party, 100 guests, confirmed and deposit paid "
                "via the AI Concierge flow."
            ),
            "stage": "signed",
        },
        "brief": {
            "event_type": "Annual company party",
            "guest_count": 100,
            **_single_date(20),
            "event_date_flexible": False,
            "budget_amount": 220,
            "budget_basis": "per_head",
            "budget_status": "confirmed",
            "duration_hours": 4,
            "time_of_day": "evening",
            "confidence": 0.95,
            "review_status": "human_approved",
        },
    },
    {
        "organisation": None,
        "contact": {
            "full_name": "Kevin Yeung",
            "email": "demo.kevin.yeung@exclusivevenue.demo",
            "phone": "+852 9123 4567",
            "source": "web_form",
        },
        "enquiry": {
            "channel": "web_form",
            "raw_content": "Product photoshoot, needed a studio space for half a day.",
            "stage": "lost",
            "lost_reason": "Budget (HKD 8,000) below our minimum spend for any active venue.",
        },
        "brief": {
            "event_type": "Product photoshoot",
            "guest_count": 8,
            "budget_amount": 8000,
            "budget_basis": "total",
            "budget_status": "confirmed",
            "duration_hours": 4,
            "confidence": 0.85,
            "review_status": "auto_accepted",
        },
    },
    # --- additional WEB-FORM intake (structured; in production the AI is
    #     skipped for this channel, so confidence sits at 1.0) -------------
    {
        "organisation": {
            "name": "Aurora Tech Labs",
            "kind": "corporate",
            "tier": "tier-2",
            "region": "Hong Kong",
        },
        "contact": {
            "full_name": "Marcus Yip",
            "email": "demo.marcus.yip@exclusivevenue.demo",
            "phone": "+852 9123 4570",
            "source": "web_form",
        },
        "enquiry": {
            "channel": "web_form",
            "raw_content": (
                "Annual developer conference, roughly 300 attendees over a full "
                "day with breakout rooms and a networking reception in the evening. "
                "Need strong AV and reliable wifi. Budget approx HKD 500,000 total."
            ),
            "stage": "briefed",
        },
        "brief": {
            "event_type": "Developer conference",
            "guest_count": 300,
            **_single_date(90),
            "event_date_flexible": False,
            "budget_amount": 500000,
            "budget_basis": "total",
            "budget_status": "confirmed",
            "duration_hours": 9,
            "time_of_day": "full_day",
            "location_preference": "Central / Wan Chai",
            "requirements": {
                "format_needs": ["breakout rooms", "networking reception", "registration desk"],
                "tech_needs": ["AV", "high-capacity wifi", "stage & lighting"],
            },
            "confidence": 1.0,
            "review_status": "human_approved",
        },
    },
    {
        "organisation": None,
        "contact": {
            "full_name": "Sophie Leung",
            "email": "demo.sophie.leung@exclusivevenue.demo",
            "phone": "+852 9123 4571",
            "source": "web_form",
        },
        "enquiry": {
            "channel": "web_form",
            "raw_content": (
                "Enquiring about an intimate wedding reception for 60 guests, "
                "garden or rooftop with a view, seated dinner. Flexible on the "
                "exact date in spring next year. Budget around HKD 180,000."
            ),
            "stage": "proposed",
        },
        "brief": {
            "event_type": "Wedding reception",
            "guest_count": 60,
            "date_window_start": str(TODAY + timedelta(days=210)),
            "date_window_end": str(TODAY + timedelta(days=240)),
            "date_suggestions": [
                str(TODAY + timedelta(days=217)),
                str(TODAY + timedelta(days=231)),
            ],
            "event_date_flexible": True,
            "budget_amount": 180000,
            "budget_basis": "total",
            "budget_status": "confirmed",
            "duration_hours": 5,
            "time_of_day": "evening",
            "location_preference": "Garden or rooftop with a view",
            "requirements": {"mood": ["romantic", "intimate", "greenery"]},
            "confidence": 1.0,
            "fields_to_confirm": ["date_window_end"],
            "review_status": "human_approved",
        },
    },
    {
        "organisation": {
            "name": "Maison Vireo",
            "kind": "brand",
            "tier": "tier-1",
            "rate_card_on_file": True,
            "rate_card_terms": "Tier-1 brand terms, 15% service",
            "region": "Paris HQ · Hong Kong flagship",
        },
        "contact": {
            "full_name": "Isabelle Fontaine",
            "email": "demo.isabelle.fontaine@exclusivevenue.demo",
            "phone": "+852 9123 4572",
            "source": "web_form",
        },
        "enquiry": {
            "channel": "web_form",
            "raw_content": (
                "Private client viewing and cocktail for our autumn collection, "
                "40 VIP guests, refined and understated. Late October, one evening. "
                "Budget to be confirmed with the maison."
            ),
            "stage": "held",
        },
        "brief": {
            "event_type": "Private client cocktail",
            "guest_count": 40,
            "date_window_start": str(TODAY + timedelta(days=100)),
            "date_window_end": str(TODAY + timedelta(days=115)),
            "date_suggestions": [str(TODAY + timedelta(days=105))],
            "event_date_flexible": True,
            "budget_status": "tbc",
            "budget_estimate_low": 150000,
            "budget_estimate_high": 240000,
            "duration_hours": 3,
            "time_of_day": "evening",
            "location_preference": "Central, discreet arrival",
            "requirements": {
                "format_needs": ["collection display", "champagne service"],
                "tech_needs": ["subtle lighting", "sound"],
                "mood": ["refined", "understated", "sense of arrival"],
            },
            "confidence": 0.92,
            "flagged_fields": ["budget_status"],
            "fields_to_confirm": ["date_window_end", "budget_status"],
            "review_status": "auto_accepted",
        },
    },
    # --- additional WHATSAPP intake (casual free text; this is where the
    #     AI parse earns its keep) -----------------------------------------
    {
        "organisation": None,
        "contact": {
            "full_name": "Nikhil Sharma",
            "email": "demo.nikhil.sharma@exclusivevenue.demo",
            "phone": "+852 9123 4573",
            "source": "whatsapp",
        },
        "enquiry": {
            "channel": "whatsapp",
            "raw_content": (
                "hey! looking to book something for my company offsite, ~25 people, "
                "somewhere with a view for a half day workshop + dinner after. maybe "
                "next month? not sure on budget yet lol"
            ),
            "stage": "enquiry",
        },
        "brief": {
            "event_type": "Corporate offsite",
            "guest_count": 25,
            "date_window_start": str(TODAY + timedelta(days=25)),
            "date_window_end": str(TODAY + timedelta(days=45)),
            "event_date_flexible": True,
            "budget_status": "unspecified",
            "duration_hours": 6,
            "time_of_day": "full_day",
            "location_preference": "Somewhere with a view",
            "requirements": {"format_needs": ["workshop", "dinner"], "mood": ["relaxed"]},
            "confidence": 0.58,
            "flagged_fields": ["date_window_start", "date_window_end", "budget_status"],
            "fields_to_confirm": ["date_window_start", "budget_status"],
            "review_status": "needs_review",
        },
    },
    {
        "organisation": None,
        "contact": {
            "full_name": "Chloe Tam",
            "email": "demo.chloe.tam@exclusivevenue.demo",
            "phone": "+852 9123 4574",
            "source": "whatsapp",
        },
        "enquiry": {
            "channel": "whatsapp",
            "raw_content": (
                "hi! do you have any boats/yachts for a birthday cruise? around 20 "
                "friends, sunset vibes, drinks + light bites. this saturday if possible!!"
            ),
            "stage": "enquiry",
        },
        "brief": {
            "event_type": "Birthday yacht cruise",
            "guest_count": 20,
            **_single_date(4),
            "event_date_flexible": False,
            "budget_status": "unspecified",
            "duration_hours": 4,
            "time_of_day": "evening",
            "location_preference": "Yacht / harbour",
            "requirements": {
                "format_needs": ["drinks", "light bites"],
                "mood": ["sunset", "celebratory"],
            },
            "confidence": 0.70,
            "flagged_fields": ["budget_status"],
            "fields_to_confirm": ["budget_status"],
            "review_status": "needs_review",
        },
    },
    {
        "organisation": None,
        "contact": {
            "full_name": "Daniel Kwok",
            "email": "demo.daniel.kwok@exclusivevenue.demo",
            "phone": "+852 9123 4575",
            "source": "whatsapp",
        },
        "enquiry": {
            "channel": "whatsapp",
            "raw_content": (
                "planning to propose to my gf 💍 want a private rooftop dinner for 2, "
                "super romantic, maybe with flowers and a violinist? end of this month"
            ),
            "stage": "briefed",
        },
        "brief": {
            "event_type": "Proposal dinner",
            "guest_count": 2,
            "date_window_start": str(TODAY + timedelta(days=18)),
            "date_window_end": str(TODAY + timedelta(days=28)),
            "event_date_flexible": True,
            "budget_amount": 15000,
            "budget_basis": "total",
            "budget_status": "confirmed",
            "duration_hours": 3,
            "time_of_day": "evening",
            "location_preference": "Private rooftop",
            "requirements": {
                "format_needs": ["floral styling", "live violinist", "set menu"],
                "mood": ["romantic", "private", "sense of occasion"],
            },
            "confidence": 0.86,
            "fields_to_confirm": ["date_window_start"],
            "review_status": "human_approved",
        },
    },
    # --- a couple more across email / concierge for balance --------------
    {
        "organisation": {
            "name": "Ashworth & Vane LLP",
            "kind": "corporate",
            "tier": "tier-2",
            "region": "Hong Kong",
        },
        "contact": {
            "full_name": "Grace Chow",
            "email": "demo.grace.chow@exclusivevenue.demo",
            "phone": "+852 9123 4576",
            "source": "email",
        },
        "enquiry": {
            "channel": "email",
            "raw_content": (
                "Dear team, we would like to host our firm's annual partners' dinner "
                "for approximately 80 guests, black-tie, in early December. A private "
                "dining room with harbour views would be ideal. Budget in the region "
                "of HKD 250,000."
            ),
            "stage": "proposed",
        },
        "brief": {
            "event_type": "Partners' dinner",
            "guest_count": 80,
            **_single_date(135),
            "event_date_flexible": False,
            "budget_amount": 250000,
            "budget_basis": "total",
            "budget_status": "confirmed",
            "duration_hours": 4,
            "time_of_day": "evening",
            "location_preference": "Private dining room, harbour views",
            "requirements": {
                "format_needs": ["seated dinner", "speeches"],
                "mood": ["formal", "prestigious"],
            },
            "confidence": 0.93,
            "review_status": "auto_accepted",
        },
    },
    {
        "organisation": {
            "name": "Evergreen Foundation",
            "kind": "other",
            "tier": "standard",
            "region": "Hong Kong",
        },
        "contact": {
            "full_name": "Patrick O'Brien",
            "email": "demo.patrick.obrien@exclusivevenue.demo",
            "phone": "+852 9123 4577",
            "source": "concierge",
        },
        "enquiry": {
            "channel": "concierge",
            "raw_content": (
                "Charity fundraising gala, 220 guests, seated dinner with an auction "
                "and a stage programme. Looking at a Saturday in February. Budget "
                "around HKD 600,000 including production."
            ),
            "stage": "briefed",
        },
        "brief": {
            "event_type": "Charity gala",
            "guest_count": 220,
            "date_window_start": str(TODAY + timedelta(days=170)),
            "date_window_end": str(TODAY + timedelta(days=190)),
            "date_suggestions": [
                str(TODAY + timedelta(days=175)),
                str(TODAY + timedelta(days=182)),
            ],
            "event_date_flexible": True,
            "budget_amount": 600000,
            "budget_basis": "total",
            "budget_status": "confirmed",
            "duration_hours": 5,
            "time_of_day": "evening",
            "location_preference": "Ballroom",
            "requirements": {
                "format_needs": ["auction", "stage programme", "seated dinner"],
                "tech_needs": ["stage", "AV", "lighting"],
                "mood": ["elegant", "philanthropic"],
            },
            "confidence": 0.90,
            "fields_to_confirm": ["date_window_end"],
            "review_status": "human_approved",
        },
    },
]


def main() -> None:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SECRET_KEY"]
    client = create_client(url, key)

    for entry in DEMO_ENQUIRIES:
        contact_email = entry["contact"]["email"]
        existing = client.table("contacts").select("id").eq("email", contact_email).execute()
        if existing.data:
            print(f"{contact_email}: already exists, skipping")
            continue

        organisation_id = None
        if entry["organisation"]:
            org = client.table("organisations").insert(entry["organisation"]).execute().data[0]
            organisation_id = org["id"]

        contact = client.table("contacts").insert(
            {**entry["contact"], "organisation_id": organisation_id}
        ).execute().data[0]
        contact_id = contact["id"]

        enquiry_payload = {**entry["enquiry"], "contact_id": contact_id}
        # created_by/assigned_to left null deliberately — see module
        # docstring. lost_reason only present on the one 'lost' entry;
        # everyone else's key is simply absent, matching how the API
        # itself treats an optional column.
        enquiry = client.table("enquiries").insert(enquiry_payload).execute().data[0]
        enquiry_id = enquiry["id"]

        brief_payload = {
            **entry["brief"],
            "enquiry_id": enquiry_id,
            "version": 1,
            "parser_model": "seed-script (not AI-generated)",
        }
        client.table("briefs").insert(brief_payload).execute()

        print(
            f"{contact_email}: created enquiry {enquiry_id} "
            f"(stage={entry['enquiry']['stage']}, channel={entry['enquiry']['channel']}) "
            f"for {entry['contact']['full_name']}"
        )

    print(
        "\nDone. Open the Pipeline Board (/app) — the status pills at the top "
        "(Open/Awaiting/Won/Lost) should now show real counts; the kanban "
        "columns below split those further by exact stage. Open the Luxe & "
        "Co. enquiry's Command Center to see the full standardized brief "
        "(tier, rate card, date window + suggestions, TBC budget with an "
        "estimated range, mood/format/tech needs, flagged fields)."
    )


if __name__ == "__main__":
    sys.exit(main())
