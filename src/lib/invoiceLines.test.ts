import { describe, it, expect, beforeEach } from "vitest";
import { invoiceLineRows, hsnRateCache } from "./invoiceLines";

/**
 * Built from the real INV-385506, which is what exposed this.
 *
 * The Tax Master has 999722 at CGST 2.5 + SGST 2.5 = 5%, and the invoice was
 * charged on that: cgst 75 + sgst 75 = 150 on a 3,000 line. But the line's own
 * snapshot said 2.5, taken from services.gst_percent, which had drifted from
 * the master. Showing the snapshot printed half the tax the patient paid.
 */
const invoice = {
  total_amount: 10250,
  paid_amount: 10250,
  tax_amount: 150,
  cgst_amount: 75,
  sgst_amount: 75,
  igst_amount: 0,
  tax_rate: null,
  line_items: [
    { name: "REVLITE LASER TONING A", hsn: "999722", qty: 1, price: 3000, gst: 2.5 },
    { name: "HYDRA CLEAN UP", hsn: "999319", qty: 1, price: 4750, gst: 0 },
    { name: "phototherapy", hsn: "999319", qty: 1, price: 2350, gst: 0 },
  ],
};

describe("invoiceLineRows", () => {
  beforeEach(() => {
    for (const k of Object.keys(hsnRateCache)) delete hsnRateCache[k];
    // As the Tax Master holds them.
    hsnRateCache["999722"] = 5;
    hsnRateCache["999319"] = 0;
  });

  it("uses the Tax Master rate, not the line's stale snapshot", () => {
    const [revlite] = invoiceLineRows(invoice);
    expect(revlite.gst).toBe(5);
    expect(revlite.tax).toBeCloseTo(150, 2);
    expect(revlite.total).toBeCloseTo(3150, 2);
  });

  it("leaves zero-rated lines untaxed", () => {
    const [, hydra, photo] = invoiceLineRows(invoice);
    expect(hydra.tax).toBe(0);
    expect(hydra.total).toBeCloseTo(4750, 2);
    expect(photo.tax).toBe(0);
  });

  it("adds up to the invoice's own total", () => {
    const rows = invoiceLineRows(invoice);
    const amount = rows.reduce((s, r) => s + r.amount, 0);
    const tax = rows.reduce((s, r) => s + r.tax, 0);
    expect(amount).toBeCloseTo(10100, 2);
    expect(tax).toBeCloseTo(150, 2);
    expect(amount + tax).toBeCloseTo(Number(invoice.total_amount), 2);
  });

  it("reconciles to the charged tax when no rate resolves, without taxing zero-rated lines", () => {
    // Master unavailable (e.g. cache not warm) and the snapshot is the stale 2.5.
    delete hsnRateCache["999722"];
    delete hsnRateCache["999319"];
    const rows = invoiceLineRows(invoice);
    const tax = rows.reduce((s, r) => s + r.tax, 0);
    expect(tax).toBeCloseTo(150, 2);
    // The whole correction lands on the only taxed line, never on the others.
    expect(rows[0].tax).toBeCloseTo(150, 2);
    expect(rows[1].tax).toBe(0);
    expect(rows[2].tax).toBe(0);
  });

  it("spreads by amount only when nothing carries a rate at all", () => {
    const flat = {
      ...invoice,
      line_items: invoice.line_items.map((l) => ({ ...l, gst: 0, hsn: "" })),
    };
    const rows = invoiceLineRows(flat);
    const tax = rows.reduce((s, r) => s + r.tax, 0);
    expect(tax).toBeCloseTo(150, 2);
    expect(rows[0].tax).toBeGreaterThan(0);
  });
});
