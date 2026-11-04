import { describe, it, expect } from "vitest";
import { countsTowardRevenue, onlyCountableInvoices } from "./revenueScope";

describe("countsTowardRevenue", () => {
  it("excludes a cancelled bill, whatever the casing", () => {
    expect(countsTowardRevenue("Cancelled")).toBe(false);
    expect(countsTowardRevenue("cancelled")).toBe(false);
    expect(countsTowardRevenue(" Cancelled ")).toBe(false);
  });

  it("counts every other status the clinic uses", () => {
    for (const s of ["Paid", "Pending", "Partial", "Scheduled"]) {
      expect(countsTowardRevenue(s)).toBe(true);
    }
  });

  it("counts a missing status rather than silently dropping the money", () => {
    // Losing revenue from a blank field would be worse than counting it.
    expect(countsTowardRevenue(null)).toBe(true);
    expect(countsTowardRevenue(undefined)).toBe(true);
    expect(countsTowardRevenue("")).toBe(true);
  });
});

describe("onlyCountableInvoices", () => {
  it("keeps everything but the cancelled bills", () => {
    const rows = [
      { id: "a", status: "Paid" },
      { id: "b", status: "Cancelled" },
      { id: "c", status: "Pending" },
    ];
    expect(onlyCountableInvoices(rows).map((r) => r.id)).toEqual(["a", "c"]);
  });
});
