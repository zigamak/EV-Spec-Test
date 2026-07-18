import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Generous enough that a legitimately slow call (AI parse/re-rank/copy
// generation can take several seconds) never gets caught by this, while
// still catching the dev-only hung-connection quirk documented below in
// well under a page's patience.
const REQUEST_TIMEOUT_MS = 25_000;

// A dev-only quirk observed against the local uvicorn --reload server: the
// CORS preflight (OPTIONS) for a given path occasionally succeeds but the
// real request that should follow on the same keep-alive connection never
// arrives — the browser's fetch() then hangs indefinitely with no error.
// Pages that fire several sequential apiFetch calls (Calendar, the
// proposal editor) are the ones that surface it. A hung request now aborts
// after REQUEST_TIMEOUT_MS and is retried once on a fresh connection
// (fetch() opens a new one once the old one is aborted) rather than
// blocking the page forever.
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchWithTimeout(url, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return fetchWithTimeout(url, init);
    }
    throw err;
  }
}

/** Bounce to login (preserving where we were) rather than surfacing a
 * confusing inline "invalid session" when the token is gone/expired. */
function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/app/login")) return;
  const redirect = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/app/login?redirect=${redirect}`;
}

/**
 * Every FastAPI route is RLS-scoped to the caller's own session (see
 * api/app/core/scoped_client.py) — this just attaches that session's
 * access token, it doesn't decide what the caller can see or do.
 *
 * Keeps active users signed in: the access token is refreshed proactively
 * when it's expired or within a minute of expiring, so an idle-then-active
 * tab never fires a request with a stale token (the cause of surprise 401s).
 * A 401 that still slips through (revoked/expired token the refresh couldn't
 * save) redirects to login instead of erroring inline.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const supabase = createClient();
  let {
    data: { session },
  } = await supabase.auth.getSession();

  // expires_at is a UNIX timestamp in seconds; refresh if inside a 60s buffer.
  if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
    const { data } = await supabase.auth.refreshSession();
    session = data.session ?? session;
  }

  if (!session) {
    redirectToLogin();
    throw new ApiError(401, "Not signed in");
  }

  const isFormData = init.body instanceof FormData;
  const response = await fetchWithRetry(`${API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });

  if (response.status === 401) {
    redirectToLogin();
    throw new ApiError(401, "Session expired — please sign in again.");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new ApiError(response.status, body.detail ?? "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

/** Authenticated file download (e.g. a server-rendered PDF): fetches the
 * bytes with the session token, then triggers a browser download. */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const supabase = createClient();
  let {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
    const { data } = await supabase.auth.refreshSession();
    session = data.session ?? session;
  }
  if (!session) {
    redirectToLogin();
    throw new ApiError(401, "Not signed in");
  }

  const response = await fetchWithTimeout(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (response.status === 401) {
    redirectToLogin();
    throw new ApiError(401, "Session expired — please sign in again.");
  }
  if (!response.ok) {
    throw new ApiError(response.status, "Download failed");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
