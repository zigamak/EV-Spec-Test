"""Remove duplicate proposals — the "one draft per enquiry" cleanup.

A draft is a *duplicate* only when an enquiry has more than one draft-status
proposal. This keeps the newest draft (highest version) per enquiry and
deletes the older draft duplicates. SAFE by default:

  - only `status = 'draft'` proposals are ever deleted (sent/accepted/etc.
    are real versions and always kept);
  - a duplicate draft that has venues attached is kept unless --force
    (don't silently destroy someone's in-progress work);
  - proposal_venues / link tokens cascade-delete with the proposal (0006).

Idempotent: run it anytime. Requires SUPABASE_URL + SUPABASE_SECRET_KEY
(api/.env). Uses the service-role client (bypasses RLS), like the seeders.

    python scripts/dedupe_proposals.py            # safe: skip drafts w/ venues
    python scripts/dedupe_proposals.py --force     # also delete dup drafts w/ venues
"""

import os
import sys

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "api", ".env"))


def main() -> None:
    force = "--force" in sys.argv
    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])

    drafts = (
        client.table("proposals")
        .select("id, enquiry_id, version, title")
        .eq("status", "draft")
        .order("version", desc=True)
        .execute()
        .data
    )

    by_enquiry: dict[str, list[dict]] = {}
    for proposal in drafts:
        by_enquiry.setdefault(proposal["enquiry_id"], []).append(proposal)

    deleted = 0
    skipped = 0
    dup_enquiries = 0
    for proposals in by_enquiry.values():
        if len(proposals) <= 1:
            continue
        dup_enquiries += 1
        keep, extras = proposals[0], proposals[1:]  # newest version kept
        print(f"enquiry: keeping draft v{keep['version']} ({keep['id'][:8]}), reviewing {len(extras)} dup(s)")
        for extra in extras:
            venues = (
                client.table("proposal_venues").select("id").eq("proposal_id", extra["id"]).execute().data
            )
            if venues and not force:
                skipped += 1
                print(
                    f"  skip v{extra['version']} ({extra['id'][:8]}) — "
                    f"has {len(venues)} venue(s); use --force to delete"
                )
                continue
            client.table("proposals").delete().eq("id", extra["id"]).execute()
            deleted += 1
            print(f"  deleted v{extra['version']} ({extra['id'][:8]})")

    remaining = len(client.table("proposals").select("id").eq("status", "draft").execute().data)
    print(
        f"\nDone. {dup_enquiries} enquiries had duplicate drafts · deleted {deleted}"
        f"{f' · skipped {skipped} (had venues)' if skipped else ''} · {remaining} drafts remain."
    )


if __name__ == "__main__":
    sys.exit(main())
