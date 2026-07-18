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
