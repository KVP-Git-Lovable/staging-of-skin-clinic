import { describe, it, expect } from "vitest";
import { moveToPosition, parseMedicineNumber } from "./medicineNumber";

const rows = (...keys: string[]) => keys.map((key) => ({ key }));
const keys = (list: { key: string }[]) => list.map((r) => r.key);

describe("parseMedicineNumber", () => {
  it("accepts whole numbers of 1 or more", () => {
    expect(parseMedicineNumber("1")).toBe(1);
    expect(parseMedicineNumber(" 3 ")).toBe(3);
    expect(parseMedicineNumber("12")).toBe(12);
  });

  it("refuses anything else", () => {
    for (const bad of ["", "  ", "0", "00", "-1", "1.5", "2a", "abc", "1234"]) {
      expect(parseMedicineNumber(bad), bad).toBeNull();
    }
  });
});

describe("moveToPosition", () => {
  it("moves a medicine up to the number typed and shifts the others down", () => {
    expect(keys(moveToPosition(rows("a", "b", "c"), "c", 1))).toEqual(["c", "a", "b"]);
    expect(keys(moveToPosition(rows("a", "b", "c", "d"), "d", 2))).toEqual(["a", "d", "b", "c"]);
  });

  it("moves a medicine down and shifts the others up", () => {
    expect(keys(moveToPosition(rows("a", "b", "c"), "a", 3))).toEqual(["b", "c", "a"]);
    expect(keys(moveToPosition(rows("a", "b", "c", "d"), "a", 2))).toEqual(["b", "a", "c", "d"]);
  });

  it("clamps a number that is too big or too small instead of leaving a gap", () => {
    expect(keys(moveToPosition(rows("a", "b", "c"), "a", 9))).toEqual(["b", "c", "a"]);
    expect(keys(moveToPosition(rows("a", "b", "c"), "c", 0))).toEqual(["c", "a", "b"]);
    expect(keys(moveToPosition(rows("a", "b", "c"), "c", -4))).toEqual(["c", "a", "b"]);
  });

  it("returns the very same array when nothing moves", () => {
    const list = rows("a", "b", "c");
    expect(moveToPosition(list, "b", 2)).toBe(list);
    expect(moveToPosition(list, "nobody", 1)).toBe(list);
  });

  it("keeps every row, once, whatever is typed - so numbers never repeat", () => {
    const start = rows("a", "b", "c", "d", "e");
    for (const key of ["a", "b", "c", "d", "e"]) {
      for (const pos of [-1, 0, 1, 2, 3, 4, 5, 6, 99]) {
        const out = moveToPosition(start, key, pos);
        expect(out).toHaveLength(5);
        expect(new Set(keys(out)).size).toBe(5);
      }
    }
  });

  it("leaves rows marked removed in their own slots and out of the count", () => {
    const list = [
      { key: "a", gone: false },
      { key: "x", gone: true },
      { key: "b", gone: false },
      { key: "c", gone: false },
    ];
    const out = moveToPosition(list, "c", 1, (r) => !r.gone);
    // The listed rows are now c, a, b; the removed row did not move or count.
    expect(keys(out)).toEqual(["c", "x", "a", "b"]);
    // "3" means third among the LISTED rows, not third in the raw array.
    expect(keys(moveToPosition(list, "a", 3, (r) => !r.gone))).toEqual(["b", "x", "c", "a"]);
  });
});
