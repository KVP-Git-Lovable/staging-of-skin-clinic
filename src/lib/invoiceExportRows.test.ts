import { describe, it, expect } from "vitest";
import {
  invoiceExportRows,
  invoiceExportTotals,
  invoiceExportSheet,
  invoiceLineSplit,
} from "./invoiceExportRows";

/** The two codes the clinic has active. */
const RATES = { "999319": 0, "999722": 5 };

/** INV-49503, a real bill: a 0% consultation and two 5% treatments. */
const threeServices = {
  id: "inv-1",
  created_at: "2026-09-30T10:00:00+00:00",
  invoice_number: "INV-49503",
  patient_name: "Jahnavi",
  total_amount: 12380,
  tax_amount: 530,
  line_items: [
    { name: "CONSULTATION- DR VINDHYA PAI", hsn: "999319", qty: 1, price: 1250 },
    { name: "Underarms hair reduction", hsn: "999722", qty: 1, price: 3100, material_percent: 5 },
    { name: "Full legs hair reduction", hsn: "999722", qty: 1, price: 7500, material_percent: 5 },
  ],
};

const oneService = {
  id: "inv-2",
  created_at: "2026-09-01T09:00:00+00:00",
  invoice_number: "INV-1",
  patient_name: "Bobby",
  total_amount: 800,
  tax_amount: 0,
  line_items: [{ name: "Cryotherapy", hsn: "999319", qty: 1, price: 800 }],
};

describe("invoiceLineSplit", () => {
  it("gives each service the GST its own HSN was charged at", () => {
    const [consult, underarms, legs] = invoiceLineSplit(threeServices, RATES);
    expect(consult.tax).toBe(0);
    expect(underarms.tax).toBeCloseTo(155, 2);
    expect(legs.tax).toBeCloseTo(375, 2);
    expect(consult.rate).toBe(0);
    expect(underarms.rate).toBe(5);
  });

  it("adds back to the bill - that is the whole test of a split", () => {
    const lines = invoiceLineSplit(threeServices, RATES);
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(11850, 2);
    expect(lines.reduce((s, l) => s + l.tax, 0)).toBeCloseTo(530, 2);
    expect(lines.reduce((s, l) => s + l.total, 0)).toBeCloseTo(12380, 2);
  });

  it("never moves GST onto a zero-rated treatment when it has to reconcile", () => {
    // The bill says 600 of GST; the rates come to 530. The correction lands on
    // the lines that were taxed, never on the exempt consultation.
    const lines = invoiceLineSplit({ ...threeServices, tax_amount: 600 }, RATES);
    expect(lines[0].tax).toBe(0);
    expect(lines.reduce((s, l) => s + l.tax, 0)).toBeCloseTo(600, 2);
  });

  it("shows no rate at all rather than one nobody charged", () => {
    // No HSN resolves, so the tax can only be apportioned - and a share of a
    // figure is not a rate.
    const lines = invoiceLineSplit({ ...threeServices, line_items: [
      { name: "A", hsn: "", qty: 1, price: 1000 },
      { name: "B", hsn: "", qty: 1, price: 1000 },
    ], total_amount: 2100, tax_amount: 100 }, RATES);
    expect(lines.every((l) => l.rate === null)).toBe(true);
    expect(lines.reduce((s, l) => s + l.tax, 0)).toBeCloseTo(100, 2);
  });

  it("counts quantity, not just the unit price", () => {
    const [line] = invoiceLineSplit(
      { total_amount: 2100, tax_amount: 100, line_items: [{ name: "A", hsn: "999722", qty: 2, price: 1000 }] },
      RATES,
    );
    expect(line.amount).toBe(2000);
    expect(line.tax).toBeCloseTo(100, 2);
  });

  it("treats a bill with no itemisation as the one line it is", () => {
    const lines = invoiceLineSplit({ total_amount: 1050, tax_amount: 50, line_items: [] }, RATES);
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(1000);
    expect(lines[0].tax).toBe(50);
  });
});

describe("invoiceExportRows", () => {
  const options = {
    rates: RATES,
    doctorName: () => "Dr Vindhya Pai",
    paymentMode: () => "UPI",
    materialLines: [
      { invoice_id: "inv-1", service_name: "Underarms hair reduction", material_percent: 5, material_cost: 155 },
    ],
  };

  it("puts the earliest date first", () => {
    const rows = invoiceExportRows([threeServices, oneService], options);
    expect(rows[0].invoice_number).toBe("INV-1");
    expect(rows[0].created_at.startsWith("2026-09-01")).toBe(true);
  });

  it("leaves a single-service bill as one row", () => {
    const rows = invoiceExportRows([oneService], options);
    expect(rows).toHaveLength(1);
    expect(rows[0].service).toBe("Cryotherapy");
  });

  it("gives a three-service bill three lines, named on the bill once", () => {
    const rows = invoiceExportRows([threeServices], options);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.invoice_number)).toEqual(["INV-49503", "", ""]);
    expect(rows.map((r) => r.patient_name)).toEqual(["Jahnavi", "", ""]);
    expect(rows.map((r) => r.doctor_name)).toEqual(["Dr Vindhya Pai", "", ""]);
    expect(rows.map((r) => r.created_at.slice(0, 10))).toEqual(["2026-09-30", "", ""]);
    expect(rows.map((r) => r.service)).toEqual([
      "CONSULTATION- DR VINDHYA PAI",
      "Underarms hair reduction",
      "Full legs hair reduction",
    ]);
  });

  it("prints each line's own rate", () => {
    const rows = invoiceExportRows([threeServices], options);
    expect(rows.map((r) => r.gst_rate)).toEqual(["0%", "5%", "5%"]);
  });

  it("takes the material cost off the line it belongs to, and no other", () => {
    const rows = invoiceExportRows([threeServices], options);
    expect(rows[1].material_percent_label).toBe("5%");
    expect(rows[1].amount_after_deduction).toBeCloseTo(3100 - 155, 2);
    // Nothing recorded against the other two, so nothing is deducted from them.
    expect(rows[0].material_percent_label).toBe("");
    expect(rows[0].amount_after_deduction).toBe(1250);
    expect(rows[2].amount_after_deduction).toBe(7500);
  });
});

describe("invoiceExportTotals", () => {
  const options = { rates: RATES, doctorName: () => "", paymentMode: () => "" };

  it("adds the columns up to what the bills came to", () => {
    const rows = invoiceExportRows([threeServices, oneService], options);
    const totals = invoiceExportTotals(rows);
    expect(totals.total_amount).toBeCloseTo(12380 + 800, 2);
    expect(totals.gst_amount).toBeCloseTo(530, 2);
    expect(totals.amount_before_gst).toBeCloseTo(11850 + 800, 2);
  });

  it("labels itself in a column that holds no figure", () => {
    // In a currency column the label would export as NaN.
    expect(invoiceExportTotals([]).invoice_number).toBe("TOTAL");
    expect(invoiceExportTotals([])).not.toHaveProperty("patient_name");
  });
});

describe("invoiceExportSheet", () => {
  it("reads the rates and the material lines off the rows themselves", () => {
    const rows = [
      {
        ...threeServices,
        hsn_rates: RATES,
        material_lines: [
          { invoice_id: "inv-1", service_name: "Full legs hair reduction", material_percent: 5, material_cost: 375 },
        ],
      },
    ];
    const out = invoiceExportSheet(rows, { doctorName: () => "Dr X", paymentMode: () => "Cash" });
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.gst_rate)).toEqual(["0%", "5%", "5%"]);
    expect(out[2].amount_after_deduction).toBeCloseTo(7500 - 375, 2);
  });

  it("still produces a sheet when nothing was fetched alongside", () => {
    const out = invoiceExportSheet([{ ...threeServices }]);
    expect(out).toHaveLength(3);
    // No rates to resolve, so the tax is apportioned and no rate is claimed.
    expect(out.every((r) => r.gst_rate === "")).toBe(true);
    expect(out.reduce((s, r) => s + Number(r.gst_amount), 0)).toBeCloseTo(530, 2);
  });
});
