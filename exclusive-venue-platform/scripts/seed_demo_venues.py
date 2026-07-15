"""Seed script (task F5): 3 demo venues with configurations + pricing
rules, for local/staging demos and manual QA of the recommendation and
pricing engines. Idempotent — matches by slug, skips venues that already
exist rather than duplicating them.

Uses the service-role client directly (bypasses RLS) since this is a
one-time dev/staging fixture, not a staff request through the API.

Run once per environment:

    python scripts/seed_demo_venues.py

Requires SUPABASE_URL + SUPABASE_SECRET_KEY (api/.env).
"""

import os
import sys
from datetime import date

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "api", ".env"))

DEMO_VENUES = [
    {
        "venue": {
            "name": "The Peak Skyline Hall",
            "slug": "peak-skyline-hall",
            "description": "Floor-to-ceiling harbour views, ideal for galas and product launches.",
            "district": "The Peak",
            "status": "active",
        },
        "configurations": [
            {"name": "Cocktail", "capacity": 200, "notes": "Standing reception layout"},
            {"name": "Banquet", "capacity": 120, "notes": "Seated rounds"},
        ],
        "restrictions": [
            {"kind": "no_amplified_music", "value": None, "hard": False},
            {"kind": "curfew", "value": "23:00", "hard": True},
        ],
        "pricing_rule": {
            "base_rate": 80000,
            "per_head_tiers": [{"min_guests": 0, "max_guests": None, "rate_per_head": 350}],
            "duration_multipliers": {"included_hours": 4, "overtime_rate_per_hour": 8000},
            "day_adjustments": {"friday": 1.1, "saturday": 1.25},
            "season_adjustments": [
                {"start_date": "2026-12-01", "end_date": "2026-12-31", "multiplier": 1.15}
            ],
            "min_spend": 100000,
            "effective_from": "2026-01-01",
        },
        "addons": [
            {"name": "Live band", "pricing_type": "flat", "amount": 15000},
            {"name": "Premium bar package", "pricing_type": "per_head", "amount": 180},
        ],
    },
    {
        "venue": {
            "name": "Wan Chai Warehouse Loft",
            "slug": "wan-chai-warehouse-loft",
            "description": "Industrial-chic loft space, popular for brand activations.",
            "district": "Wan Chai",
            "status": "active",
        },
        "configurations": [
            {"name": "Open floor", "capacity": 300, "notes": "Full warehouse floor"},
            {"name": "Mezzanine", "capacity": 80, "notes": "Upper level, intimate events"},
        ],
        "restrictions": [
            {"kind": "no_open_flame", "value": None, "hard": True},
        ],
        "pricing_rule": {
            "base_rate": 45000,
            "per_head_tiers": [
                {"min_guests": 0, "max_guests": 150, "rate_per_head": 200},
                {"min_guests": 151, "max_guests": None, "rate_per_head": 160},
            ],
            "duration_multipliers": {"included_hours": 5, "overtime_rate_per_hour": 5000},
            "day_adjustments": {"saturday": 1.2},
            "season_adjustments": [],
            "min_spend": 60000,
            "effective_from": "2026-01-01",
        },
        "addons": [
            {"name": "AV package", "pricing_type": "flat", "amount": 12000},
            {"name": "Security staff", "pricing_type": "per_hour", "amount": 800},
        ],
    },
    {
        "venue": {
            "name": "Repulse Bay Garden Pavilion",
            "slug": "repulse-bay-garden-pavilion",
            "description": "Beachside garden pavilion, popular for weddings and daytime events.",
            "district": "Repulse Bay",
            "status": "active",
        },
        "configurations": [
            {"name": "Garden ceremony", "capacity": 100, "notes": "Outdoor seating"},
            {"name": "Pavilion reception", "capacity": 150, "notes": "Covered reception area"},
        ],
        "restrictions": [
            {"kind": "no_red_wine", "value": None, "hard": False},
            {"kind": "min_age", "value": "18", "hard": False},
        ],
        "pricing_rule": {
            "base_rate": 60000,
            "per_head_tiers": [{"min_guests": 0, "max_guests": None, "rate_per_head": 280}],
            "duration_multipliers": {"included_hours": 4, "overtime_rate_per_hour": 6000},
            "day_adjustments": {"saturday": 1.3, "sunday": 1.2},
            "season_adjustments": [
                {"start_date": "2026-06-01", "end_date": "2026-08-31", "multiplier": 1.1}
            ],
            "min_spend": 80000,
            "effective_from": "2026-01-01",
        },
        "addons": [
            {"name": "Floral arch", "pricing_type": "flat", "amount": 8000},
        ],
    },
]


def main() -> None:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SECRET_KEY"]
    client = create_client(url, key)

    for entry in DEMO_VENUES:
        slug = entry["venue"]["slug"]
        existing = client.table("venues").select("id").eq("slug", slug).execute()
        if existing.data:
            print(f"{slug}: already exists, skipping")
            continue

        venue = client.table("venues").insert(entry["venue"]).execute().data[0]
        venue_id = venue["id"]
        print(f"{slug}: created venue {venue_id}")

        for config in entry["configurations"]:
            client.table("venue_configurations").insert(
                {**config, "venue_id": venue_id}
            ).execute()

        for restriction in entry["restrictions"]:
            client.table("venue_restrictions").insert(
                {**restriction, "venue_id": venue_id}
            ).execute()

        rule = client.table("pricing_rules").insert(
            {**entry["pricing_rule"], "venue_id": venue_id}
        ).execute().data[0]

        for addon in entry["addons"]:
            client.table("pricing_rule_addons").insert(
                {**addon, "pricing_rules_id": rule["id"]}
            ).execute()

        print(
            f"{slug}: seeded {len(entry['configurations'])} configurations, "
            f"{len(entry['restrictions'])} restrictions, 1 pricing rule, "
            f"{len(entry['addons'])} add-ons"
        )


if __name__ == "__main__":
    sys.exit(main())
