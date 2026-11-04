import { describe, it, expect } from "vitest";
import { numVal } from "./numberInput";

describe("numVal", () => {
  it("renders 0 as an empty box, so it can be typed over", () => {
    expect(numVal(0)).toBe("");
  });

  it("keeps every other number", () => {
    expect(numVal(4200)).toBe("4200");
    expect(numVal(2.5)).toBe("2.5");
    expect(numVal(-1)).toBe("-1");
    expect(numVal(0.5)).toBe("0.5");
  });

  it("treats missing values as empty", () => {
    expect(numVal(undefined)).toBe("");
    expect(numVal(null)).toBe("");
    expect(numVal("")).toBe("");
  });

  it("passes strings through, including a typed-in zero", () => {
    expect(numVal("0")).toBe("0");
    expect(numVal("12.50")).toBe("12.50");
  });
});
