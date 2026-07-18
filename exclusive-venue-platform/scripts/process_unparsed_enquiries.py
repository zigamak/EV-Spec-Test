"""Scheduled job — structure any free-text enquiry that has no brief yet.

This is the polling half of a decoupled intake: an inbox automation
(Power Automate, n8n, a Microsoft Graph subscription, the Resend webhook,
or anything that can write a row) just inserts a *raw* enquiry — channel +
raw_content, no brief. This job, run on a schedule, finds the un-briefed
free-text ones and parses them with the configured LLM.

Why a job instead of only a webhook: it decouples "an email arrived" from
"the AI structured it". The source only needs DB write access (which
Power Automate/n8n have via their Postgres/Supabase connectors) — no public
webhook endpoint, no signature handling, no Graph webhook renewal. If the
parser is down, the enquiry still lands; the next run picks it up.

Idempotent: an enquiry that already has a brief is skipped, so overlapping
or frequent runs (every minute is fine) are harmless. Only free-text
channels are parsed — the website form is structured and should build its
brief directly (confidence=1.0), never round-trip through the AI.

Run: python scripts/process_unparsed_enquiries.py
Schedule with Render Cron, Supabase pg_cron, cron, or Task Scheduler.
Requires SUPABASE_URL + SUPABASE_SECRET_KEY (api/.env).
"""

import os
import sys

from dotenv import load_dotenv

_API_DIR = os.path.join(os.path.dirname(__file__), "..", "api")
sys.path.insert(0, os.path.abspath(_API_DIR))
load_dotenv(os.path.join(_API_DIR, ".env"))

from app.core.admin_client import get_admin_client  # noqa: E402
from app.services.brief_intake import auto_parse_enquiry  # noqa: E402

# Channels whose raw_content is free text a human wrote — these need parsing.
# web_form is deliberately excluded (structured input, build the brief
# directly); concierge is staff-mediated and parsed on demand.
FREE_TEXT_CHANNELS = ["email", "whatsapp"]


def main() -> None:
    admin = get_admin_client()

    briefed_ids = {
        row["enquiry_id"] for row in admin.table("briefs").select("enquiry_id").execute().data
    }
    enquiries = (
        admin.table("enquiries")
        .select("id, raw_content, channel")
        .in_("channel", FREE_TEXT_CHANNELS)
        .execute()
        .data
    )
    todo = [e for e in enquiries if e["id"] not in briefed_ids]

    print(f"{len(todo)} un-briefed free-text enquiries to process")
    for enquiry in todo:
        brief = auto_parse_enquiry(admin, enquiry["id"], enquiry["raw_content"])
        print(f"  {enquiry['id']} [{enquiry['channel']}]: {'parsed' if brief else 'skipped/failed'}")


if __name__ == "__main__":
    main()
