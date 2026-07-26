/** Operator team directory for the "Forward to" hand-off.
 *
 * TEAM below is now a *fallback / display metadata* layer: the real accounts
 * live in Supabase (see scripts/seed_staff_users.py) and are fetched live via
 * GET /staff (fetchStaff). Forwarding writes both enquiries.assigned_to (the
 * real auth.users id) and forwarded_to (the display name, kept because the
 * pipeline owner filter + OWNER_COLOR key off the name). Names here match the
 * seeded users exactly, so region/role titles still decorate the live list. */
export interface TeamMember {
  name: string;
  role: string;
  region: string;
}

/** A real staff account from GET /staff. `role` here is the auth role
 * ("staff" | "admin"), distinct from the TeamMember job title. */
export interface StaffMember {
  id: string;
  full_name: string;
  role: string;
}

export const TEAM: TeamMember[] = [
  { name: "Crystal Lam", role: "Account Director", region: "Hong Kong" },
  { name: "Henry Wong", role: "Senior Account Manager", region: "Hong Kong" },
  { name: "Sammi Chiu", role: "GM", region: "Hong Kong" },
  { name: "Saoud Maherzi", role: "Chairman", region: "Exclusive Venue Asia" },
];

/** Job title + region decoration, keyed by the seeded full name. Merged onto
 * the live GET /staff list so the modal can still show "Account Director ·
 * Hong Kong" without storing that in the DB yet. */
export const TEAM_META: Record<string, { role: string; region: string }> =
  Object.fromEntries(TEAM.map((m) => [m.name, { role: m.role, region: m.region }]));

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

/** Live operator directory (real accounts). Falls back to the static TEAM
 * names if the call fails, so the hand-off modal always has options. */
export async function fetchStaff(): Promise<StaffMember[]> {
  const { apiFetch } = await import("@/lib/api/client");
  return apiFetch<StaffMember[]>("/staff");
}

export function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
