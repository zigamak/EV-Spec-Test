"""Exclusive Venue Platform — FastAPI entrypoint.

AI orchestration + pricing engine live here. Pricing, availability, capacity,
and permissions are deterministic code only — zero AI calls in those call
paths (memory/constitution.md #1).
"""

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.logging_config import configure_logging
from app.routers import (
    briefs,
    contacts_directory,
    enquiries,
    pricing,
    proposals,
    public_proposals,
    recommendations,
    staff,
    venue_media,
    venue_profile,
    venues,
    webhooks,
)

configure_logging()
logger = logging.getLogger("app")

app = FastAPI(title="Exclusive Venue Platform API", version="0.1.0")


@app.exception_handler(Exception)
async def log_unhandled_exceptions(request: Request, exc: Exception) -> JSONResponse:
    """Every unhandled error gets a full traceback in logs/app.log (not
    just whatever printed to whichever terminal happened to be open) —
    the client still just gets a generic 500, nothing internal leaks."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

# Dev: the web/ Next.js app runs on a different port and calls this API
# directly from the browser with the caller's own Supabase session token
# (see web/lib/api/client.ts) — that's a cross-origin request. In
# production this narrows to the deployed web origin(s); see Render env
# config, not hardcoded here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://172.26.0.1:3000"]
    if get_settings().environment == "development"
    else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(venues.router)
app.include_router(venue_media.router)
app.include_router(venue_profile.router)
app.include_router(enquiries.router)
app.include_router(staff.router)
app.include_router(contacts_directory.router)
app.include_router(briefs.router)
app.include_router(pricing.router)
app.include_router(recommendations.router)
app.include_router(proposals.router)
app.include_router(public_proposals.router)
app.include_router(webhooks.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
