"""One-time (idempotent) persistent dev/test staff account — not a Sprint
Board task, just a standing fixture so local browser verification doesn't
need a fresh throwaway account created and deleted every session.

Creates (or reuses) a Supabase Auth user + a `staff` row in `user_roles`.
Run once per environment:

    python scripts/create_test_staff_user.py

Requires SUPABASE_URL + SUPABASE_SECRET_KEY (api/.env).
"""

import os
import sys

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "api", ".env"))

TEST_EMAIL = "test@user.com"
TEST_PASSWORD = "TestUser"


def main() -> None:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SECRET_KEY"]
    client = create_client(url, key)

    existing = None
    page = 1
    while True:
        result = client.auth.admin.list_users(page=page, per_page=200)
        users = result if isinstance(result, list) else result.users
        if not users:
            break
        existing = next((u for u in users if u.email == TEST_EMAIL), None)
        if existing:
            break
        page += 1

    if existing:
        user_id = existing.id
        print(f"auth user {TEST_EMAIL}: already exists ({user_id}), skipping create")
    else:
        created = client.auth.admin.create_user(
            {
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD,
                "email_confirm": True,
            }
        )
        user_id = created.user.id
        print(f"auth user {TEST_EMAIL}: created ({user_id})")

    role_row = client.table("user_roles").select("*").eq("user_id", user_id).execute()
    if role_row.data:
        print(f"user_roles: already has role '{role_row.data[0]['role']}', skipping")
    else:
        client.table("user_roles").insert({"user_id": user_id, "role": "staff"}).execute()
        print("user_roles: inserted role 'staff'")


if __name__ == "__main__":
    sys.exit(main())
