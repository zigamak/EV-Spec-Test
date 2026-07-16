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
) -> str:
    details = ", ".join(
        filter(
            None,
            [
                f"event type: {event_type}" if event_type else None,
                f"guest count: {guest_count}" if guest_count else None,
                f"date: {event_date}" if event_date else None,
                f"client organisation: {organisation_name}" if organisation_name else None,
            ],
        )
    )
    prompt = (
        f"{_BRAND_VOICE_PLACEHOLDER}\n\n"
        "Write a short (2-3 sentence) introductory paragraph for a venue "
        f"proposal. Known details: {details or 'none provided'}. "
        "Do not invent specifics not given above."
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
