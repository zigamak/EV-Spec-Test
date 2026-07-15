"""Exclusive Venue Platform — FastAPI entrypoint.

AI orchestration + pricing engine live here. Pricing, availability, capacity,
and permissions are deterministic code only — zero AI calls in those call
paths (memory/constitution.md #1).
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.routers import (
    briefs,
    enquiries,
    pricing,
    proposals,
    public_proposals,
    recommendations,
    venue_media,
    venues,
    webhooks,
)

app = FastAPI(title="Exclusive Venue Platform API", version="0.1.0")

# Dev: the web/ Next.js app runs on a different port and calls this API
# directly from the browser with the caller's own Supabase session token
# (see web/lib/api/client.ts) — that's a cross-origin request. In
# production this narrows to the deployed web origin(s); see Render env
# config, not hardcoded here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"] if get_settings().environment == "development" else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(venues.router)
app.include_router(venue_media.router)
app.include_router(enquiries.router)
app.include_router(briefs.router)
app.include_router(pricing.router)
app.include_router(recommendations.router)
app.include_router(proposals.router)
app.include_router(public_proposals.router)
app.include_router(webhooks.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
