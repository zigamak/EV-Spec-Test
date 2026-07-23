"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

/** Operator team directory for the "Forward to" hand-off and the
 * salesperson filter/reassign UI everywhere it appears (Pipeline board,
 * Inquiries inbox, Calendar). Each of these four now has a real Supabase
 * Auth login + `profiles.full_name` row (scripts/create_salesperson_users.py,
 * workflow overhaul) — this is the live directory fetch this file's own
 * comment used to say would replace the hardcoded array "once real staff
 * logins exist." `ROLE_LABEL`/`REGION_LABEL` stay as decorative, static
 * flavor text (title/region aren't real HR data anywhere in this schema)
 * keyed by name, so the tooltip subtitle degrades gracefully for anyone
 * not in the map instead of breaking. */
export interface TeamMember {
  name: string;
  role: string;
  region: string;
}

const ROLE_LABEL: Record<string, string> = {
  "Crystal Lam": "Account Director",
  "Henry Wong": "Senior Account Manager",
  "Sammi Chiu": "GM",
  "Saoud Maherzi": "Chairman",
};

const REGION_LABEL: Record<string, string> = {
  "Crystal Lam": "Hong Kong",
  "Henry Wong": "Hong Kong",
  "Sammi Chiu": "Hong Kong",
  "Saoud Maherzi": "Exclusive Venue Asia",
};

// Seed/fallback so pages render instantly and stay usable if /staff is
// briefly unavailable — overwritten by the live fetch as soon as it
// resolves. Kept in sync with scripts/create_salesperson_users.py.
export const TEAM: TeamMember[] = [
  { name: "Crystal Lam", role: ROLE_LABEL["Crystal Lam"] ?? "", region: REGION_LABEL["Crystal Lam"] ?? "" },
  { name: "Henry Wong", role: ROLE_LABEL["Henry Wong"] ?? "", region: REGION_LABEL["Henry Wong"] ?? "" },
  { name: "Sammi Chiu", role: ROLE_LABEL["Sammi Chiu"] ?? "", region: REGION_LABEL["Sammi Chiu"] ?? "" },
  { name: "Saoud Maherzi", role: ROLE_LABEL["Saoud Maherzi"] ?? "", region: REGION_LABEL["Saoud Maherzi"] ?? "" },
];

interface StaffMemberResponse {
  user_id: string;
  full_name: string;
}

/** Live version of TEAM — fetches GET /staff (RLS-gated same as every
 * other read) and falls back to the static seed above on error or while
 * loading, so no consumer needs a loading/error branch of its own. */
export function useStaffDirectory(): TeamMember[] {
  const [staff, setStaff] = useState<TeamMember[]>(TEAM);

  useEffect(() => {
    apiFetch<StaffMemberResponse[]>("/staff")
      .then((rows) => {
        if (rows.length === 0) return;
        setStaff(
          rows.map((r) => ({
            name: r.full_name,
            role: ROLE_LABEL[r.full_name] ?? "",
            region: REGION_LABEL[r.full_name] ?? "",
          })),
        );
      })
      .catch(() => {
        // Keep the static seed — a directory fetch failing shouldn't
        // blank out the salesperson filter/reassign UI.
      });
  }, []);

  return staff;
}

/** Sentinel used when forwarding to everyone at once. */
export const WHOLE_TEAM = "The whole team";

/** Fixed palette for per-salesperson filters/badges — reuses the four brand
 * tokens already defined in tokens.provisional.css, one per team member,
 * rather than a hashed color that could collide. Shared by the Pipeline
 * board and the bookings Calendar so the same person reads as the same
 * color everywhere in the app. */
export const OWNER_COLOR: Record<string, string> = {
  "Sammi Chiu": "var(--color-accent)",
  "Crystal Lam": "var(--color-navy)",
  "Henry Wong": "var(--color-success)",
  "Saoud Maherzi": "var(--color-brass)",
};

export function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
