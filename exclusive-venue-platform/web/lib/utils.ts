/** Pure helpers shared across pages — kept dependency-free and easy to
 * unit test (task I1: the web project needs *some* Vitest coverage, not
 * just Playwright browser smoke tests). */

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// A small fixed palette (matches the sidebar's navy/red brand colors plus
// two neutral grays) so the same id always renders the same avatar color
// without needing a real staff-directory lookup (out of scope — see
// tasks.md's "no staff/user management page" note).
function paletteColor(index: 0 | 1 | 2 | 3): string {
  switch (index) {
    case 0:
      return "#10142b";
    case 1:
      return "#9e1b32";
    case 2:
      return "#5b5f6d";
    case 3:
      return "#8b8fa3";
  }
}

export function avatarColorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return paletteColor((hash % 4) as 0 | 1 | 2 | 3);
}

export function daysSince(isoDate: string): number {
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
