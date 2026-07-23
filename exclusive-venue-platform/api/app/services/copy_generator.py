"""Proposal copy generation (task G2) — AI drafts intro/venue copy;
nothing here is authoritative. Output lands in the same plain, editable
`intro_copy`/`venue_copy` columns a human can freely rewrite afterward —
there's no separate "AI-locked" state (constitution #1: AI copy is always
a suggestion). Tone is a generic professional placeholder pending the
real brand kit (design-system/INTAKE.md Tier 2 — not accepted yet); this
is a copy-quality concern, not a trust-boundary one, so it isn't gated
the same way UI work is.
"""

from app.core.llm import get_llm_client

_BRAND_VOICE_PLACEHOLDER = (
    "Write in a polished, warm, professional tone suitable for a luxury "
    "event planning agency. Avoid clichés and overselling — be specific "
    "and concrete about what's on offer."
)


def generate_intro_copy(
    event_type: str | None,
    guest_count: int | None,
    event_date: str | None,
    organisation_name: str | None,
    venue_names: list[str] | None = None,
) -> str:
    """Intro paragraph for the front of the proposal document. Grounded in
    the ACTUAL venues selected (name + count) so it never says "a selection
    of venues" when there's one — the count must match reality."""
    names = venue_names or []
    if len(names) == 0:
        venue_clause = "the enclosed venue"
        count_rule = "Refer to the venue in the singular."
    elif len(names) == 1:
        venue_clause = names[0]
        count_rule = (
            f"There is exactly ONE venue ({names[0]}) — refer to it in the singular, "
            "never 'a selection of venues'."
        )
    else:
        venue_clause = f"{len(names)} venues — {', '.join(names)}"
        count_rule = (
            f"There are exactly {len(names)} venues; refer to them in the plural and you may name them."
        )

    context = ", ".join(
        filter(
            None,
            [
                f"event: {event_type}" if event_type else None,
                f"{guest_count} guests" if guest_count else None,
                f"date: {event_date}" if event_date else None,
                f"client: {organisation_name}" if organisation_name else None,
            ],
        )
    )
    prompt = (
        f"{_BRAND_VOICE_PLACEHOLDER}\n\n"
        "Write a short (2-3 sentence) introductory paragraph for the front of a venue proposal "
        "document, presenting the selected venue(s) for this event. "
        f"Context: {context or 'none provided'}. This proposal presents {venue_clause}. "
        f"{count_rule} Reference the nature of the event. Do not invent amenities, prices, or specifics "
        "not given above. Return only the paragraph."
    )
    return get_llm_client().generate_text(prompt)


def generate_personal_email(
    contact_name: str | None,
    organisation_name: str | None,
    event_type: str | None,
    event_date: str | None,
    venue_names: list[str],
) -> str:
    """The personal note that accompanies a sent proposal (task G7) — lands
    in the editable `personal_email_copy` column, a separate artifact from
    the proposal's own intro_copy. Same non-authoritative stance: a draft a
    human reviews and freely rewrites before anything is sent.

    Deliberately PDF-attachment framing, not a share-link mention: "Open in
    Gmail" (web/app/app/proposals/new/page.tsx) opens a mailto-style compose
    URL, which has no attachment parameter — there was never really a link
    in this note's body, so the copy shouldn't claim there is one. The
    actual PDF still has to be attached by hand (Download PDF, then drag it
    into the open Gmail window) since no URL scheme can do that for you."""
    first_name = contact_name.split()[0] if contact_name else "there"
    venue_clause = (
        f"the {len(venue_names)} options — {', '.join(venue_names)}"
        if venue_names
        else "a curated selection of venues"
    )
    prompt = "\n".join(
        [
            _BRAND_VOICE_PLACEHOLDER,
            "",
            "Write a warm, personal email from an event planner to a client, accompanying a venue "
            "proposal you're sending them. Structure it as a real email:",
            f"- Open with exactly 'Dear {first_name},' on its own line.",
            "- A warm opening line referencing your recent conversation.",
            "- State that you've prepared "
            + venue_clause
            + (f" for the {event_type}" if event_type else "")
            + ", each suited to the format and feeling they described, with fully transparent pricing.",
            "- Mention that the full proposal is attached as a PDF.",
            (
                f"- Offer a soft hold on {event_date} if they'd like."
                if event_date
                else "- Offer to hold their preferred date."
            ),
            "- Close with 'With warm regards,' then the planner's first name on the next line.",
            "",
            f"{f'Client organisation: {organisation_name}. ' if organisation_name else ''}"
            "Keep it to about 4 short paragraphs. Do not invent specifics not given above. "
            "Return only the email body text.",
        ]
    )
    return get_llm_client().generate_text(prompt)


def generate_venue_copy(
    venue_name: str,
    venue_description: str | None,
    configuration_name: str,
    quote_total: float,
    currency: str,
) -> str:
    prompt = (
        f"{_BRAND_VOICE_PLACEHOLDER}\n\n"
        f"Write a short (2-3 sentence) description selling this specific venue option "
        f"within a proposal. Venue: {venue_name}. "
        f"{f'Description on file: {venue_description}. ' if venue_description else ''}"
        f"Layout: {configuration_name}. Indicative total: {currency} {quote_total:,.0f}. "
        "Do not invent amenities or features not mentioned above."
    )
    return get_llm_client().generate_text(prompt)
