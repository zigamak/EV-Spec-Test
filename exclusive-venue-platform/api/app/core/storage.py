"""Admin-scoped Supabase Storage access for the private `venue-media`
bucket (task B2). The bucket has no public/anon read — the only way to
reach an object is a signed URL minted here, and we only mint one after
the caller's own RLS-scoped request already proved they can read the
matching `venue_media` row (see routers/venue_media.py). Authorization
still flows through Postgres RLS; this client only touches the object
store itself.
"""

from functools import lru_cache
from uuid import uuid4

from supabase import Client, create_client

from app.core.config import get_settings

BUCKET = "venue-media"
SIGNED_URL_TTL_SECONDS = 3600


@lru_cache
def _admin_client() -> Client:
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_secret_key)


def build_storage_path(venue_id: str, filename: str) -> str:
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    return f"{venue_id}/{uuid4()}.{suffix}"


def upload_object(storage_path: str, content: bytes, content_type: str) -> None:
    _admin_client().storage.from_(BUCKET).upload(
        storage_path,
        content,
        file_options={"content-type": content_type},
    )


def signed_url(storage_path: str) -> str:
    result = _admin_client().storage.from_(BUCKET).create_signed_url(
        storage_path, SIGNED_URL_TTL_SECONDS
    )
    return result["signedURL"]


def signed_urls(storage_paths: list[str]) -> dict[str, str]:
    """Batch form of signed_url(): one round trip for many paths, keyed by
    the path that produced each URL.

    Signing is a network call per path, so a list endpoint that signs each
    row in a loop pays that latency once per photo (a portfolio of 20
    venues x 4 photos = 80 sequential round trips). Callers that already
    hold every path they need should sign them together.

    Paths the Storage API reports an error for are omitted rather than
    raising: one unreadable object shouldn't blank out a whole page.
    """
    if not storage_paths:
        return {}

    unique_paths = list(dict.fromkeys(storage_paths))
    results = _admin_client().storage.from_(BUCKET).create_signed_urls(
        unique_paths, SIGNED_URL_TTL_SECONDS
    )
    return {
        item["path"]: item["signedURL"]
        for item in results
        if not item.get("error") and item.get("path") and item.get("signedURL")
    }


def delete_object(storage_path: str) -> None:
    _admin_client().storage.from_(BUCKET).remove([storage_path])
