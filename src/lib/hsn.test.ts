import { describe, it, expect } from "vitest";
import { activeHsnCodes, hsnOptions, liveHsn } from "./hsn";

// What the Tax Master query returns: active rows only.
const ACTIVE = [{ hsn_code: "999319" }, { hsn_code: "999722" }];
const ACTIVE_CODES = activeHsnCodes(ACTIVE);

describe("hsnOptions", () => {
  it("offers the active codes", () => {
    expect(hsnOptions(ACTIVE)).toEqual([
      { id: "999319", name: "999319" },
      { id: "999722", name: "999722" },
    ]);
  });

  it("does not offer a retired code", () => {
    // The bug: 9997 was retired but kept reappearing because the form added
    // "whatever is already on the line" to the list.
    expect(hsnOptions(ACTIVE).map((o) => o.id)).not.toContain("9997");
  });

  it("ignores blank and missing codes in the master", () => {
    expect(hsnOptions([{ hsn_code: "" }, { hsn_code: "   " }, { hsn_code: null }])).toEqual([]);
  });

  it("offers a code once even if the master lists it twice", () => {
    expect(hsnOptions([{ hsn_code: "999319" }, { hsn_code: " 999319 " }])).toHaveLength(1);
  });

  it("copes with the master not having loaded", () => {
    expect(hsnOptions(undefined)).toEqual([]);
    expect(hsnOptions(null)).toEqual([]);
  });
});

describe("liveHsn", () => {
  it("keeps a code that is still active", () => {
    expect(liveHsn("999319", ACTIVE_CODES)).toBe("999319");
  });

  it("drops a retired code, so it never reaches the line", () => {
    // Without this the line would still hold 9997, the select would merely
    // render blank, and the saved invoice would still print 9997.
    expect(liveHsn("9997", ACTIVE_CODES)).toBe("");
  });

  it("trims before deciding", () => {
    expect(liveHsn("  999722  ", ACTIVE_CODES)).toBe("999722");
    expect(liveHsn("  9997 ", ACTIVE_CODES)).toBe("");
  });

  it("treats no code as no code", () => {
    expect(liveHsn("", ACTIVE_CODES)).toBe("");
    expect(liveHsn(null, ACTIVE_CODES)).toBe("");
    expect(liveHsn(undefined, ACTIVE_CODES)).toBe("");
  });

  it("passes a code through while the master is still loading", () => {
    // With nothing to check against, blanking would quietly strip valid codes
    // from any line built in those first milliseconds.
    expect(liveHsn("999319", [])).toBe("999319");
    expect(liveHsn("9997", [])).toBe("9997");
  });
});

describe("activeHsnCodes", () => {
  it("returns the distinct trimmed codes", () => {
    expect(activeHsnCodes([{ hsn_code: " 999319" }, { hsn_code: "999319 " }, { hsn_code: "999722" }]))
      .toEqual(["999319", "999722"]);
  });
});
