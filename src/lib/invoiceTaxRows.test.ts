import { describe, it, expect } from "vitest";
import {
  reconcileLineTax,
  storedTaxOf,
  taxTotalRows,
} from "../../supabase/functions/generate-invoice-pdf/invoiceTaxRows.ts";

/**
 * The clinic's own invoice PDF printed a GST % against every line and then no
 * tax at all in its totals, while the same bill on screen showed CGST and SGST.
 * It also worked every rate out from the Tax Master as it stands today, so a
 * bill reprinted after a rate changed no longer added up to its own total.
 */

const line = (gross: number, rate: number, split: "intra" | "inter" = "intra") => {
  const tax = (gross * rate) / 100;
  return {
    sgst: split === "intra" ? rate / 2 : 0,
    cgst: split === "intra" ? rate / 2 : 0,
    igst: split === "inter" ? rate : 0,
    taxAmount: tax,
    amount: gross + tax,
  };
};

describe("reconcileLineTax", () => {
  it("leaves the lines alone when they already come to the bill's GST", () => {
    const lines = [line(10000, 5)];
    expect(reconcileLineTax(lines, 500, true)).toEqual(lines);
  });

  it("scales the lines to what the patient was actually charged", () => {
    // Raised at 5%, reprinted after the master moved to 12%.
    const lines = [line(10000, 12)];
    const [out] = reconcileLineTax(lines, 500, true);
    expect(out.taxAmount).toBeCloseTo(500, 2);
    expect(out.amount).toBeCloseTo(10500, 2);
    // The printed percentages follow the figure, so the row stays consistent.
    expect(out.sgst + out.cgst + out.igst).toBeCloseTo(5, 4);
    expect(out.sgst).toBeCloseTo(2.5, 4);
  });

  it("never moves GST onto an exempt treatment line", () => {
    // Rs 24,400 of exempt medical treatment, Rs 50,400 of cosmetic at 5%.
    const lines = [line(6000, 0), line(18400, 0), line(50400, 12)];
    const out = reconcileLineTax(lines, 2520, true);
    expect(out[0].taxAmount).toBe(0);
    expect(out[1].taxAmount).toBe(0);
    expect(out[2].taxAmount).toBeCloseTo(2520, 2);
    expect(out[0].amount).toBe(6000);
    expect(out[2].sgst + out[2].cgst).toBeCloseTo(5, 4);
  });

  it("adds up to the bill, which is the whole point", () => {
    const lines = [line(6000, 0), line(50400, 12)];
    const out = reconcileLineTax(lines, 2520, true);
    expect(out.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(6000 + 50400 + 2520, 2);
  });

  it("spreads evenly only when no line carries any rate at all", () => {
    const lines = [line(1000, 0), line(1000, 0)];
    const out = reconcileLineTax(lines, 100, true);
    expect(out[0].taxAmount).toBeCloseTo(50, 2);
    expect(out[1].taxAmount).toBeCloseTo(50, 2);
    expect(out[0].sgst).toBeCloseTo(2.5, 4);
  });

  it("puts it all under IGST when the patient is out of state", () => {
    const lines = [line(1000, 0)];
    const [out] = reconcileLineTax(lines, 180, false);
    expect(out.igst).toBeCloseTo(18, 4);
    expect(out.sgst).toBe(0);
    expect(out.cgst).toBe(0);
  });

  it("does nothing to a bill that carries no GST", () => {
    const lines = [line(850, 0)];
    expect(reconcileLineTax(lines, 0, true)).toEqual(lines);
    expect(reconcileLineTax([], 500, true)).toEqual([]);
  });
});

describe("storedTaxOf", () => {
  it("prefers the split the bill was charged with", () => {
    expect(storedTaxOf({ cgst_amount: "1260", sgst_amount: "1260", tax_amount: "9999" })).toBe(2520);
  });

  it("falls back to the bill's total tax", () => {
    expect(storedTaxOf({ tax_amount: "545" })).toBe(545);
    expect(storedTaxOf({})).toBe(0);
    expect(storedTaxOf(null)).toBe(0);
  });
});

describe("taxTotalRows", () => {
  it("spells out what the printed invoice used to leave off entirely", () => {
    const rows = taxTotalRows(
      { total_amount: "77320", cgst_amount: "1260", sgst_amount: "1260", igst_amount: "0" },
      true,
    );
    expect(rows.map((r) => r.label)).toEqual(["Taxable Value", "CGST", "SGST", "Total GST"]);
    expect(rows[0].value).toBeCloseTo(74800, 2);
    expect(rows[3].value).toBeCloseTo(2520, 2);
  });

  it("reconciles: taxable value plus the GST is the bill", () => {
    const inv = { total_amount: "11445", cgst_amount: "272.5", sgst_amount: "272.5" };
    const rows = taxTotalRows(inv, true);
    const taxable = rows.find((r) => r.label === "Taxable Value")!.value;
    const gst = rows.find((r) => r.label === "Total GST")!.value;
    expect(taxable + gst).toBeCloseTo(11445, 2);
  });

  it("assumes an even CGST/SGST split where the bill stored none", () => {
    const rows = taxTotalRows({ total_amount: "1050", tax_amount: "50" }, true);
    expect(rows.map((r) => r.label)).toEqual(["Taxable Value", "CGST", "SGST", "Total GST"]);
    expect(rows[1].value).toBeCloseTo(25, 2);
  });

  it("shows IGST alone for a patient out of state", () => {
    const rows = taxTotalRows({ total_amount: "1180", tax_amount: "180" }, false);
    expect(rows.map((r) => r.label)).toEqual(["Taxable Value", "IGST", "Total GST"]);
  });

  it("prints nothing at all on an exempt bill, rather than Total GST 0.00", () => {
    expect(taxTotalRows({ total_amount: "850", tax_amount: "0" }, true)).toEqual([]);
    expect(taxTotalRows(null, true)).toEqual([]);
  });

  it("falls back to the tax the lines came to when the bill stored none", () => {
    const rows = taxTotalRows({ total_amount: "1050" }, true, 50);
    expect(rows.find((r) => r.label === "Total GST")!.value).toBeCloseTo(50, 2);
  });
});
