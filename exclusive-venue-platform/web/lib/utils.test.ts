import { describe, expect, it } from "vitest";
import { slugify, toIsoDate } from "./utils";

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
