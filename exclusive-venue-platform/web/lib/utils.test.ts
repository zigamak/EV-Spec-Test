import { describe, expect, it } from "vitest";
import { avatarColorForId, daysSince, slugify, toIsoDate } from "./utils";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("The Peak Skyline Hall")).toBe("the-peak-skyline-hall");
  });

  it("collapses non-alphanumeric runs into a single hyphen", () => {
    expect(slugify("Wan Chai --- Warehouse!!")).toBe("wan-chai-warehouse");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("  --Repulse Bay--  ")).toBe("repulse-bay");
  });

  it("returns an empty string for input with no alphanumerics", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("toIsoDate", () => {
  it("formats a UTC date as YYYY-MM-DD", () => {
    expect(toIsoDate(new Date(Date.UTC(2026, 5, 15)))).toBe("2026-06-15");
  });
});

describe("avatarColorForId", () => {
  it("is deterministic for the same id", () => {
    const id = "abc-123-def";
    expect(avatarColorForId(id)).toBe(avatarColorForId(id));
  });

  it("returns a hex color from the fixed palette", () => {
    expect(avatarColorForId("some-uuid")).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("daysSince", () => {
  it("returns 0 for a timestamp right now", () => {
    expect(daysSince(new Date().toISOString())).toBe(0);
  });

  it("returns the correct day count for a past date", () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysSince(fiveDaysAgo)).toBe(5);
  });
});
