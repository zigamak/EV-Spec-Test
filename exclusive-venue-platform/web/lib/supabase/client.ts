import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Singleton, not a fresh client per call. supabase-js serializes session
// access (getSession()/auto-refresh) across client instances sharing the
// same storage key via the browser's Web Locks API — creating a new
// client on every apiFetch() call (as this used to do) piles up lock
// contention and can hang a call indefinitely once a page fires several
// fetches back-to-back (surfaced on the proposal editor page, which loads
// proposal + venues + links in sequence).
let client: SupabaseClient | undefined;

export function createClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
  }
  return client;
}
