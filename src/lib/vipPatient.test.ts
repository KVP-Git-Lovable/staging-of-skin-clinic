import { describe, it, expect } from "vitest";
import { isVipPatient } from "./vipPatient";

describe("isVipPatient", () => {
  it("is true only when the record says so", () => {
    expect(isVipPatient({ is_vip: true })).toBe(true);
    expect(isVipPatient({ is_vip: false })).toBe(false);
  });

  // The generic list views take `any` rows from whichever page is using them,
  // so a row that never carried the column must not read as a VIP.
  it("is false when there is nothing to read", () => {
    expect(isVipPatient({})).toBe(false);
    expect(isVipPatient({ is_vip: null })).toBe(false);
    expect(isVipPatient(null)).toBe(false);
    expect(isVipPatient(undefined)).toBe(false);
  });

  it("is not satisfied by something merely truthy", () => {
    expect(isVipPatient({ is_vip: 1 } as unknown as { is_vip: boolean })).toBe(false);
    expect(isVipPatient({ is_vip: "true" } as unknown as { is_vip: boolean })).toBe(false);
  });
});
