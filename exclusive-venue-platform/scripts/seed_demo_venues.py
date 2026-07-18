"""Seed script (task F5): demo venues with configurations, pricing rules,
AND photo galleries, for local/staging demos and manual QA of the venue,
recommendation, pricing, and proposal-builder surfaces.

Images are stored the way the platform does it in production — as objects
in the private `venue-media` Supabase Storage bucket, with only the
`storage_path` kept in the DB (NOT base64). The API mints short-lived
signed URLs from that path (app/core/storage.py). Placeholder photos are
pulled from picsum.photos (deterministic per venue+index, so re-runs are
stable) and uploaded to the bucket.

Idempotent on both halves:
  - venues are matched by slug; an existing venue's config/pricing is left
    alone;
  - images are seeded only when a venue has no venue_media rows yet, so
    re-running this backfills photos onto venues seeded before galleries
    existed, without duplicating them.

Uses the service-role client directly (bypasses RLS) since this is a
one-time dev/staging fixture, not a staff request through the API. Requires
the `venue-media` bucket to exist (scripts/create_storage_buckets.py) and
SUPABASE_URL + SUPABASE_SECRET_KEY (api/.env). Run:

    python scripts/seed_demo_venues.py
"""

import os
import sys

import httpx
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "api", ".env"))

BUCKET = "venue-media"

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
        "images": [
            "Harbour skyline through floor-to-ceiling glass",
            "The hall set for a gala banquet",
            "Cocktail reception at dusk",
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
        "images": [
            "Raw industrial main floor",
            "The mezzanine overlooking the floor",
            "Brand activation setup under the trusses",
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
        "images": [
            "Beachside garden ceremony setup",
            "The covered pavilion reception",
            "Sunset over Repulse Bay",
        ],
    },
    {
        "venue": {
            "name": "Victoria Harbour Yacht",
            "slug": "victoria-harbour-yacht",
            "description": "A private motor yacht for intimate harbour cruises and sunset receptions.",
            "district": "Aberdeen",
            "status": "active",
        },
        "configurations": [
            {"name": "Sunset cruise", "capacity": 40, "notes": "Standing reception, upper + lower deck"},
            {"name": "Seated dinner", "capacity": 24, "notes": "Formal seated layout"},
        ],
        "restrictions": [
            {"kind": "no_open_flame", "value": None, "hard": True},
            {"kind": "curfew", "value": "22:00", "hard": True},
        ],
        "pricing_rule": {
            "base_rate": 55000,
            "per_head_tiers": [{"min_guests": 0, "max_guests": None, "rate_per_head": 420}],
            "duration_multipliers": {"included_hours": 3, "overtime_rate_per_hour": 12000},
            "day_adjustments": {"friday": 1.15, "saturday": 1.3, "sunday": 1.2},
            "season_adjustments": [
                {"start_date": "2026-06-01", "end_date": "2026-09-30", "multiplier": 1.2}
            ],
            "min_spend": 90000,
            "effective_from": "2026-01-01",
        },
        "addons": [
            {"name": "Champagne package", "pricing_type": "per_head", "amount": 260},
            {"name": "Onboard DJ", "pricing_type": "flat", "amount": 18000},
        ],
        "images": [
            "Sunset over the harbour from the upper deck",
            "The main saloon set for dinner",
            "Approaching Victoria Harbour at dusk",
        ],
    },
    {
        "venue": {
            "name": "Sai Kung Clifftop Villa",
            "slug": "sai-kung-clifftop-villa",
            "description": (
                "A private clifftop villa with infinity pool and sea views, for exclusive gatherings."
            ),
            "district": "Sai Kung",
            "status": "active",
        },
        "configurations": [
            {"name": "Poolside reception", "capacity": 80, "notes": "Outdoor terrace + pool deck"},
            {"name": "Indoor lounge", "capacity": 40, "notes": "Climate-controlled interior"},
        ],
        "restrictions": [
            {"kind": "no_amplified_music", "value": None, "hard": False},
            {"kind": "curfew", "value": "00:00", "hard": True},
            {"kind": "min_age", "value": "18", "hard": False},
        ],
        "pricing_rule": {
            "base_rate": 120000,
            "per_head_tiers": [{"min_guests": 0, "max_guests": None, "rate_per_head": 300}],
            "duration_multipliers": {"included_hours": 6, "overtime_rate_per_hour": 10000},
            "day_adjustments": {"saturday": 1.25},
            "season_adjustments": [],
            "min_spend": 150000,
            "effective_from": "2026-01-01",
        },
        "addons": [
            {"name": "Private chef", "pricing_type": "per_head", "amount": 580},
            {"name": "Overnight stay (up to 12)", "pricing_type": "flat", "amount": 35000},
        ],
        "images": [
            "Infinity pool at golden hour",
            "Sea view from the terrace",
            "The villa lounge opening onto the deck",
        ],
    },
]


def _ensure_venue(client, entry) -> tuple[str, bool]:
    """Get-or-create the venue (+ its config/restrictions/pricing on first
    create). Returns (venue_id, created_now)."""
    slug = entry["venue"]["slug"]
    existing = client.table("venues").select("id").eq("slug", slug).execute()
    if existing.data:
        return existing.data[0]["id"], False

    venue_id = client.table("venues").insert(entry["venue"]).execute().data[0]["id"]
    for config in entry["configurations"]:
        client.table("venue_configurations").insert({**config, "venue_id": venue_id}).execute()
    for restriction in entry["restrictions"]:
        client.table("venue_restrictions").insert({**restriction, "venue_id": venue_id}).execute()
    rule = (
        client.table("pricing_rules")
        .insert({**entry["pricing_rule"], "venue_id": venue_id})
        .execute()
        .data[0]
    )
    for addon in entry["addons"]:
        client.table("pricing_rule_addons").insert(
            {**addon, "pricing_rules_id": rule["id"]}
        ).execute()
    return venue_id, True


def _seed_images(client, venue_id: str, slug: str, captions: list[str]) -> int:
    """Upload a photo gallery to the bucket and record venue_media rows, but
    only if this venue has none yet. Sets the first photo as the hero."""
    if client.table("venue_media").select("id").eq("venue_id", venue_id).execute().data:
        return 0

    first_media_id = None
    for index, caption in enumerate(captions):
        image_url = f"https://picsum.photos/seed/{slug}-{index}/1200/800"
        content = httpx.get(image_url, follow_redirects=True, timeout=30).content
        storage_path = f"{venue_id}/{index}.jpg"
        client.storage.from_(BUCKET).upload(
            storage_path,
            content,
            {"content-type": "image/jpeg", "upsert": "true"},
        )
        media = (
            client.table("venue_media")
            .insert(
                {
                    "venue_id": venue_id,
                    "storage_path": storage_path,
                    "kind": "photo",
                    "sort_order": index,
                    "caption": caption,
                }
            )
            .execute()
            .data[0]
        )
        if first_media_id is None:
            first_media_id = media["id"]

    if first_media_id:
        client.table("venues").update({"hero_media_id": first_media_id}).eq(
            "id", venue_id
        ).execute()
    return len(captions)


def main() -> None:
    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])

    for entry in DEMO_VENUES:
        slug = entry["venue"]["slug"]
        venue_id, created = _ensure_venue(client, entry)
        added = _seed_images(client, venue_id, slug, entry["images"])
        status = "created" if created else "exists"
        img_note = f"+{added} photos" if added else "photos already present"
        print(f"{slug}: {status} ({venue_id}) — {img_note}")

    print("\nDone. Venues now have photo galleries (stored in the venue-media bucket).")


if __name__ == "__main__":
    sys.exit(main())
