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
