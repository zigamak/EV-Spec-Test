"""One-time (idempotent) Supabase Storage bucket setup — task B2.

Not an Alembic migration: bucket creation is a Storage API call, not a
Postgres schema change. Run once per environment:

    python scripts/create_storage_buckets.py

Requires SUPABASE_URL + SUPABASE_SECRET_KEY (api/.env).
"""

import os
import sys

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "api", ".env"))

BUCKETS = [
    # (id, public) — private: access only via signed URLs from the API,
    # which gates on venue_media row RLS before ever minting one.
    ("venue-media", False),
]


def main() -> None:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SECRET_KEY"]
    client = create_client(url, key)

    existing = {b.id for b in client.storage.list_buckets()}

    for bucket_id, public in BUCKETS:
        if bucket_id in existing:
            print(f"{bucket_id}: already exists, skipping")
            continue
        client.storage.create_bucket(bucket_id, options={"public": public})
        print(f"{bucket_id}: created (public={public})")


if __name__ == "__main__":
    sys.exit(main())
