/** Operator team directory for the "Forward to" hand-off. These are the
 * reference team from the design; not platform auth accounts, which is why
 * forwarding writes enquiries.forwarded_to (a name) rather than assigned_to
 * (an auth.users FK). When real staff logins exist, this can be replaced by
 * a live directory fetch without touching the modal. */
export interface TeamMember {
  name: string;
  role: string;
  region: string;
}

export const TEAM: TeamMember[] = [
  { name: "Crystal Lam", role: "Account Director", region: "Hong Kong" },
  { name: "Henry Wong", role: "Senior Account Manager", region: "Hong Kong" },
  { name: "Sammi Chiu", role: "GM", region: "Hong Kong" },
  { name: "Saoud Maherzi", role: "Chairman", region: "Exclusive Venue Asia" },
];

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
