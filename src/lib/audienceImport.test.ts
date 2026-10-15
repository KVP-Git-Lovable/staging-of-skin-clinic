import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhone, summarizeAudienceRows, validateAudienceRows, viewFiltersFromRow } from "./audienceImport";

describe("audience normalisation", () => {
  it("lowercases emails and rejects invalid ones", () => {
    expect(normalizeEmail(" Asha@Example.COM ")).toBe("asha@example.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
  });

  it("adds +91 to bare 10-digit numbers and strips punctuation", () => {
    expect(normalizePhone("98765 43210")).toBe("919876543210");
    expect(normalizePhone("+91 98765-43211")).toBe("919876543211");
    expect(normalizePhone("123")).toBeNull();
  });

  it("flags duplicates and rows without contact details", () => {
    const rows = validateAudienceRows([
      { email: "a@x.com", phone: "9876543210" },
      { email: "a@x.com", phone: "9876543210" },
      { email: "", phone: "" },
      { email: "bad", phone: "9876543211" },
    ]);
    expect(summarizeAudienceRows(rows)).toEqual({ total: 4, valid: 2, invalid: 1, duplicates: 1, warnings: 1 });
  });
});

describe("viewFiltersFromRow", () => {
  it("reads both stored filter shapes and the match mode", () => {
    const c = [{ field: "status", operator: "equals", value: "new" }];
    expect(viewFiltersFromRow({ filter_match: "any", filters: c })).toEqual({ match: "any", conditions: c });
    expect(viewFiltersFromRow({ filters: { conditions: c } })).toEqual({ match: "all", conditions: c });
    expect(viewFiltersFromRow({ filters: null })).toEqual({ match: "all", conditions: [] });
  });
});
