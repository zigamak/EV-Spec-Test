"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";

/** Role-based access (workflow overhaul) — informational only, the same
 * way GET /me itself is: it's what a page reads to decide which UI to
 * render (the salesperson pill row and reassign controls, admin-only),
 * never what enforces access. Postgres RLS (migration 0022) does that
 * regardless of what this returns. `null` while loading or on error —
 * callers should treat null as "don't know yet," not "is admin." */
export interface Me {
  user_id: string;
  email: string | null;
  role: "admin" | "staff";
  full_name: string | null;
}

/** The outermost layout mounts (and effects run) before Supabase has
 * necessarily finished hydrating the just-created session into memory —
 * a real race confirmed live: right after a fresh login redirect, the
 * very first apiFetch("/me") from whichever component mounts earliest
 * can 401 with "Not signed in" for over half a second before
 * getSession() actually resolves (a page mounted a beat later than the
 * layout never hits this at all). Retries with backoff up to ~3.4s total
 * cover the observed gap without turning a real "you're logged out" 401
 * into a long-hanging loop. */
const RETRY_DELAYS_MS = [300, 600, 1000, 1500];

export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
          const result = await apiFetch<Me>("/me");
          if (!cancelled) setMe(result);
          return;
        } catch (err) {
          const isAuthRace = err instanceof ApiError && err.status === 401;
          const delay = RETRY_DELAYS_MS[attempt];
          if (!isAuthRace || delay === undefined || cancelled) return;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return me;
}
