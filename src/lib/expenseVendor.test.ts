import { describe, it, expect } from "vitest";
import { resolveVendorName } from "./expenseVendor";

const vendors = [
  { id: "13400310-735b-4e35-8555-ddd2c0604a35", name: "Radha Medicals" },
  { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", name: "Demo Supplies" },
];

describe("resolveVendorName", () => {
  it("turns a stored vendor id back into the vendor's name", () => {
    expect(resolveVendorName("13400310-735b-4e35-8555-ddd2c0604a35", vendors)).toBe("Radha Medicals");
  });
  it("keeps a stored name as it is", () => {
    expect(resolveVendorName("Demo Supplies", vendors)).toBe("Demo Supplies");
  });
  it("returns empty for no vendor", () => {
    expect(resolveVendorName(null, vendors)).toBe("");
  });
});
