import { describe, it, expect } from "vitest";
import { kpiColumnClass } from "./kpiGrid";

describe("kpiColumnClass", () => {
  it("fills the row rather than leaving empty columns", () => {
    // Clinic 360 shows four cards, Patient 360 two, Marketing and Team one.
    expect(kpiColumnClass(4)).toBe("grid-cols-2 lg:grid-cols-4");
    expect(kpiColumnClass(2)).toBe("grid-cols-2");
    expect(kpiColumnClass(1)).toBe("grid-cols-1");
  });

  it("keeps two-up on phones wherever there is more than one card", () => {
    for (const n of [2, 3, 4]) {
      expect(kpiColumnClass(n), String(n)).toContain("grid-cols-2");
    }
  });

  it("only ever emits complete literal class names", () => {
    // An interpolated lg:grid-cols-${n} would never be emitted by Tailwind's
    // scanner, and the row would silently collapse to one column.
    for (const n of [1, 2, 3, 4, 9]) {
      expect(kpiColumnClass(n)).toMatch(/^grid-cols-[1-4]( lg:grid-cols-[1-4])?$/);
    }
  });

  it("caps at four so the row wraps instead of shrinking", () => {
    expect(kpiColumnClass(8)).toBe("grid-cols-2 lg:grid-cols-4");
  });

  it("does not break on nonsense", () => {
    expect(kpiColumnClass(0)).toBe("grid-cols-1");
    expect(kpiColumnClass(-2)).toBe("grid-cols-1");
    expect(kpiColumnClass(NaN)).toBe("grid-cols-1");
  });
});
