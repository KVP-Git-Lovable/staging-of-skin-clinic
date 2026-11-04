import { describe, it, expect } from "vitest";
import {
  HSN_EXEMPT,
  HSN_EXEMPT_OLD,
  HSN_SERVICES_5,
  HSN_TAXABLE_OLD,
  hsnForRate,
} from "../../supabase/functions/sf-import-clinical/hsnForRate";

/**
 * The HSN column printed blank on every bill because the import hardcoded
 * `hsn: ""`. Which code applies depends on when the bill was raised - the
 * clinic moved to six-digit SAC codes at the September 2025 rate change.
 */

const OLD = "2024-03-15T10:00:00Z";
const NEW = "2026-09-21T10:00:00Z";

describe("hsnForRate - bills from the current 5% era", () => {
  it("gives the services code at 5% and the health code at 0%", () => {
    expect(hsnForRate(5, NEW)).toBe(HSN_SERVICES_5);
    expect(hsnForRate(0, NEW)).toBe(HSN_EXEMPT);
  });

  it("does not hand a current bill an 18% code", () => {
    expect(hsnForRate(18, NEW)).toBe("");
  });
});

describe("hsnForRate - bills from before the September 2025 change", () => {
  it("gives the old four-digit codes", () => {
    expect(hsnForRate(18, OLD)).toBe(HSN_TAXABLE_OLD);
    expect(hsnForRate(0, OLD)).toBe(HSN_EXEMPT_OLD);
  });

  it("does not hand a historical bill a code that did not exist yet", () => {
    expect(hsnForRate(5, OLD)).toBe("");
  });
});

describe("hsnForRate - the changeover boundary", () => {
  it("treats 20 Sept 2025 as old and 22 Sept 2025 as current", () => {
    expect(hsnForRate(18, "2025-09-20T23:00:00Z")).toBe(HSN_TAXABLE_OLD);
    expect(hsnForRate(5, "2025-09-22T09:00:00Z")).toBe(HSN_SERVICES_5);
  });
});

describe("hsnForRate - missing or unusable input", () => {
  it("treats a missing date as current, since new bills are what arrive now", () => {
    expect(hsnForRate(5)).toBe(HSN_SERVICES_5);
    expect(hsnForRate(0, null)).toBe(HSN_EXEMPT);
    expect(hsnForRate(5, "not a date")).toBe(HSN_SERVICES_5);
  });

  it("never guesses from a missing or unrecognised rate", () => {
    // Number(null) is 0 - a line with no rate must not collect an exempt code.
    expect(hsnForRate(null, NEW)).toBe("");
    expect(hsnForRate(undefined, NEW)).toBe("");
    expect(hsnForRate("", NEW)).toBe("");
    expect(hsnForRate(12, NEW)).toBe("");
    expect(hsnForRate("abc", NEW)).toBe("");
  });
});
