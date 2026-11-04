import { describe, it, expect } from "vitest";
import { invoiceLineChanges } from "./invoiceLineChanges";

const line = (over: Record<string, unknown> = {}) => ({
  kind: "service",
  name: "Hormonal Hirsutism -Face (MEDICAL TREATMENT)",
  qty: 1,
  price: 4200,
  hsn: "999722",
  gst: 5,
  service_id: null,
  ...over,
});

describe("invoiceLineChanges", () => {
  it("says nothing changed when nothing did", () => {
    expect(invoiceLineChanges([line()], [line()])).toEqual({ lines: false, money: false });
  });

  it("treats a corrected name as a change to the bill, not to the money", () => {
    // The whole point: a spelling fix must not re-resolve the GST of a bill
    // that already matches Salesforce to the rupee.
    expect(invoiceLineChanges([line()], [line({ name: "Hormonal Hirsutism - Face (Medical Treatment)" })]))
      .toEqual({ lines: true, money: false });
  });

  it("counts a changed price, HSN, GST or quantity as money", () => {
    for (const change of [{ price: 4500 }, { hsn: "999319" }, { gst: 0 }, { qty: 2 }]) {
      expect(invoiceLineChanges([line()], [line(change)])).toEqual({ lines: true, money: true });
    }
  });

  it("counts a changed material percentage as money", () => {
    expect(invoiceLineChanges([line()], [line({ material_percent: 5 })]))
      .toEqual({ lines: true, money: true });
  });

  it("counts unlinking a line from the Service Master as money", () => {
    // The id decides nothing about the tax today, but it is part of what was
    // billed, and a save that drops it is not a rename.
    expect(invoiceLineChanges([line({ service_id: "svc-1" })], [line({ service_id: null })]))
      .toEqual({ lines: true, money: true });
  });

  it("counts a line added or removed as money, whatever it is called", () => {
    expect(invoiceLineChanges([line()], [line(), line({ name: "Peel" })]))
      .toEqual({ lines: true, money: true });
    expect(invoiceLineChanges([line(), line({ name: "Peel" })], [line()]))
      .toEqual({ lines: true, money: true });
  });

  it("renames every line at once without touching the money", () => {
    const before = [line(), line({ name: "Peel", price: 1000 })];
    const after = [line({ name: "A" }), line({ name: "B", price: 1000 })];
    expect(invoiceLineChanges(before, after)).toEqual({ lines: true, money: false });
  });

  it("is not fooled by the order the keys were written in", () => {
    const a = { kind: "service", name: "X", qty: 1, price: 100, hsn: "999722", gst: 5 };
    const b = { gst: 5, hsn: "999722", price: 100, qty: 1, name: "X", kind: "service" };
    expect(invoiceLineChanges([a], [b]).money).toBe(false);
  });

  it("leaves an untouched bill alone, both empty", () => {
    expect(invoiceLineChanges([], [])).toEqual({ lines: false, money: false });
  });

  it("knows a pharmacy line's own money keys", () => {
    const p = { kind: "product", name: "Sunscreen", qty: 1, price: 500, inventory_id: "i1", uom_factor: 1 };
    expect(invoiceLineChanges([p], [{ ...p, name: "Sunscreen SPF50" }]))
      .toEqual({ lines: true, money: false });
    expect(invoiceLineChanges([p], [{ ...p, quantity: 2, qty: 2 }]))
      .toEqual({ lines: true, money: true });
  });
});
