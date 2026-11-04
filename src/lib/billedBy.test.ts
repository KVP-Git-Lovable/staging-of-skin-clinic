import { describe, it, expect } from "vitest";
import { BILLED_BY_OPTIONS, billedByLabel } from "./billedBy";

describe("BILLED_BY_OPTIONS", () => {
  it("is the three people the clinic named, in that order", () => {
    expect([...BILLED_BY_OPTIONS]).toEqual(["Anusha", "Munasha", "Dorothy"]);
  });

  it("has no duplicates, which would make two identical dropdown rows", () => {
    expect(new Set(BILLED_BY_OPTIONS).size).toBe(BILLED_BY_OPTIONS.length);
  });
});

describe("billedByLabel", () => {
  it("shows a dash for a bill raised before anyone was recorded", () => {
    expect(billedByLabel(null)).toBe("—");
    expect(billedByLabel("")).toBe("—");
    expect(billedByLabel("   ")).toBe("—");
  });

  it("shows a stored name even if it is no longer on the list", () => {
    // Somebody who has since left still raised the bills they raised.
    expect(billedByLabel("Rekha")).toBe("Rekha");
  });

  it("shows a name on the list", () => {
    expect(billedByLabel("Dorothy")).toBe("Dorothy");
  });
});
