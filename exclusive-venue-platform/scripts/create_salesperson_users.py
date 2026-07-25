"""One-time (idempotent) demo salesperson accounts + admin promotion —
workflow overhaul (role-based access, migration 0022).

Creates a real Supabase Auth login + `staff` user_roles row + `profiles`
row (for full_name) for each of the four team members previously only
ever a hardcoded display-name string in web/lib/team.ts (TEAM). Also
promotes the existing test@user.com dev account (scripts/create_test_
staff_user.py) to `admin` in addition to its `staff` row, so every
Playwright verification flow already using it keeps working unchanged
as the "sees everything" manager persona — and promotes Saoud Maherzi to
`admin` too (Dashboard task, 25 Jul): he's the real named manager persona
product-side, test@user.com stays admin purely as a dev/test fixture.

Demo placeholder emails/password — swap in real ones later with zero
code changes, same idempotent create-or-reuse shape as
create_test_staff_user.py. Run once per environment:

    python scripts/create_salesperson_users.py

Requires SUPABASE_URL + SUPABASE_SECRET_KEY (api/.env).
"""

import os
import sys

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "api", ".env"))

ADMIN_EMAIL = "test@user.com"
SAOUD_EMAIL = "saoud.maherzi@exclusivevenue.demo"

# Same four names as web/lib/team.ts's TEAM — this script is what finally
# backs those display-name strings with a real login apiece.
SALESPEOPLE = [
    {"full_name": "Crystal Lam", "email": "crystal.lam@exclusivevenue.demo"},
    {"full_name": "Henry Wong", "email": "henry.wong@exclusivevenue.demo"},
    {"full_name": "Sammi Chiu", "email": "sammi.chiu@exclusivevenue.demo"},
    {"full_name": "Saoud Maherzi", "email": "saoud.maherzi@exclusivevenue.demo"},
]
DEMO_PASSWORD = "TestUser"  # same convention as create_test_staff_user.py


def _find_user_by_email(client, email: str):
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


def _ensure_role(client, user_id: str, role: str) -> None:
    existing = (
        client.table("user_roles").select("id").eq("user_id", user_id).eq("role", role).execute()
    )
    if existing.data:
        print(f"  user_roles: already has '{role}', skipping")
    else:
        client.table("user_roles").insert({"user_id": user_id, "role": role}).execute()
        print(f"  user_roles: inserted role '{role}'")


def _ensure_profile(client, user_id: str, full_name: str) -> None:
    existing = client.table("profiles").select("id").eq("id", user_id).execute()
    if existing.data:
        client.table("profiles").update({"full_name": full_name}).eq("id", user_id).execute()
        print(f"  profiles: updated full_name -> {full_name}")
    else:
        client.table("profiles").insert({"id": user_id, "full_name": full_name}).execute()
        print(f"  profiles: inserted full_name -> {full_name}")


def main() -> None:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SECRET_KEY"]
    client = create_client(url, key)

    for person in SALESPEOPLE:
        email, full_name = person["email"], person["full_name"]
        print(f"{full_name} <{email}>")
        existing = _find_user_by_email(client, email)
        if existing:
            user_id = existing.id
            # Demo account — always re-set the known password rather than
            # skipping, so this stays a reliable "log in as X" fixture even
            # if the account pre-existed with an unknown one.
            client.auth.admin.update_user_by_id(user_id, {"password": DEMO_PASSWORD})
            print(f"  auth user: already exists ({user_id}), password reset to demo default")
        else:
            created = client.auth.admin.create_user(
                {"email": email, "password": DEMO_PASSWORD, "email_confirm": True}
            )
            user_id = created.user.id
            print(f"  auth user: created ({user_id})")

        _ensure_role(client, user_id, "staff")
        _ensure_profile(client, user_id, full_name)

    print(f"\n{ADMIN_EMAIL} (promoting to admin)")
    admin_user = _find_user_by_email(client, ADMIN_EMAIL)
    if not admin_user:
        print(f"  {ADMIN_EMAIL} does not exist yet — run scripts/create_test_staff_user.py first, skipping")  # noqa: E501
    else:
        _ensure_role(client, admin_user.id, "admin")
        _ensure_profile(client, admin_user.id, "Operator Admin")

    print(f"\n{SAOUD_EMAIL} (promoting to admin)")
    saoud_user = _find_user_by_email(client, SAOUD_EMAIL)
    if not saoud_user:
        print(f"  {SAOUD_EMAIL} does not exist yet — run this script's salesperson loop first, skipping")
    else:
        _ensure_role(client, saoud_user.id, "admin")


if __name__ == "__main__":
    sys.exit(main())
