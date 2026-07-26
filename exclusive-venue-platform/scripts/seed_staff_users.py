"""Seed the operator team as REAL users: Supabase Auth accounts + profiles +
user_roles, replacing the demo names in lib/team.ts.

Everyone is seeded as `staff` for now — no new roles (multi-role /
permissions come later). Names match web/lib/team.ts exactly so the pipeline
owner filter (which keys off enquiries.forwarded_to = the staff name) keeps
working. Idempotent — reuses existing auth users / role rows.

Run: python scripts/seed_staff_users.py
Requires SUPABASE_URL + SUPABASE_SECRET_KEY (api/.env).
"""

import os
import sys

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "api", ".env"))

DEFAULT_PASSWORD = "ExclusiveVenue1"

STAFF = [
    {"email": "sammi.chiu@exclusivevenue.demo", "name": "Sammi Chiu", "role": "staff"},
    {"email": "saoud.maherzi@exclusivevenue.demo", "name": "Saoud Maherzi", "role": "staff"},
    {"email": "crystal.lam@exclusivevenue.demo", "name": "Crystal Lam", "role": "staff"},
    {"email": "henry.wong@exclusivevenue.demo", "name": "Henry Wong", "role": "staff"},
]


def _find_user(client, email):
    page = 1
    while True:
        result = client.auth.admin.list_users(page=page, per_page=200)
        users = result if isinstance(result, list) else result.users
        if not users:
            return None
        match = next((u for u in users if u.email == email), None)
        if match:
            return match
        page += 1


def _ensure_role(client, user_id, role):
    existing = (
        client.table("user_roles").select("id").eq("user_id", user_id).eq("role", role).execute().data
    )
    if not existing:
        client.table("user_roles").insert({"user_id": user_id, "role": role}).execute()


def _ensure_profile(client, user_id, full_name):
    existing = client.table("profiles").select("id").eq("id", user_id).execute().data
    if existing:
        client.table("profiles").update({"full_name": full_name}).eq("id", user_id).execute()
    else:
        client.table("profiles").insert({"id": user_id, "full_name": full_name}).execute()


def _upsert_user(client, email, name, role):
    user = _find_user(client, email)
    if user:
        user_id = user.id
        action = "exists"
    else:
        created = client.auth.admin.create_user(
            {"email": email, "password": DEFAULT_PASSWORD, "email_confirm": True}
        )
        user_id = created.user.id
        action = "created"
    _ensure_profile(client, user_id, name)
    _ensure_role(client, user_id, role)
    print(f"  {name} <{email}>: {action}, role={role}")


def main() -> None:
    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])

    for member in STAFF:
        _upsert_user(client, member["email"], member["name"], member["role"])

    print(f"\nDone. Default password for the seeded staff: {DEFAULT_PASSWORD}")


if __name__ == "__main__":
    sys.exit(main())
