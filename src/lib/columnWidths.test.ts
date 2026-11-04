import { describe, it, expect } from "vitest";
import { resizeColumn, mergeSavedWidths, MIN_COLUMN_SHARE, type ColumnWidth } from "./columnWidths";

const widths: ColumnWidth[] = [
  ["patient", 15],
  ["service", 14],
  ["doctor", 12],
  ["status", 10],
];

const total = (w: ColumnWidth[]) => w.reduce((sum, [, n]) => sum + n, 0);

describe("resizeColumn", () => {
  it("widens a column by taking from the one beside it", () => {
    const next = resizeColumn(widths, "service", 6);
    expect(next.find(([k]) => k === "service")?.[1]).toBe(20);
    expect(next.find(([k]) => k === "doctor")?.[1]).toBe(6);
  });

  it("never changes the total, whatever the drag", () => {
    // The colgroup must keep adding up, or every column slides out of true.
    for (const delta of [-100, -7, -1, 0, 1, 9, 100]) {
      expect(total(resizeColumn(widths, "service", delta))).toBe(total(widths));
    }
  });

  it("stops before either column becomes unusable", () => {
    const squashed = resizeColumn(widths, "service", 999);
    expect(squashed.find(([k]) => k === "doctor")?.[1]).toBe(MIN_COLUMN_SHARE);

    const shrunk = resizeColumn(widths, "service", -999);
    expect(shrunk.find(([k]) => k === "service")?.[1]).toBe(MIN_COLUMN_SHARE);
  });

  it("leaves the list alone when there is no neighbour to take from", () => {
    expect(resizeColumn(widths, "status", 5)).toBe(widths);
    expect(resizeColumn(widths, "nonexistent", 5)).toBe(widths);
  });
});

describe("mergeSavedWidths", () => {
  it("takes saved shares and keeps defaults for the rest", () => {
    const merged = mergeSavedWidths(widths, { service: 30, doctor: 8 });
    expect(merged.find(([k]) => k === "service")?.[1]).toBe(30);
    expect(merged.find(([k]) => k === "doctor")?.[1]).toBe(8);
    expect(merged.find(([k]) => k === "patient")?.[1]).toBe(15);
  });

  it("ignores a column that no longer exists", () => {
    // A width saved before a column was removed must not reappear as one.
    const merged = mergeSavedWidths(widths, { visit_status: 20, service: 18 });
    expect(merged.map(([k]) => k)).toEqual(["patient", "service", "doctor", "status"]);
    expect(merged.find(([k]) => k === "service")?.[1]).toBe(18);
  });

  it("falls back to defaults for rubbish", () => {
    expect(mergeSavedWidths(widths, null)).toBe(widths);
    expect(mergeSavedWidths(widths, "nonsense")).toBe(widths);
    expect(mergeSavedWidths(widths, { service: "wide" })).toEqual(widths);
    expect(mergeSavedWidths(widths, { service: 0 })).toEqual(widths);
  });
});
