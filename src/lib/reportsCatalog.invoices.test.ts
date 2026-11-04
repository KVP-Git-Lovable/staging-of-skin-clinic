import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({}) } }));

const invoicesReport = async () => {
  const { REPORTS } = await import("./reportsCatalog");
  const report = REPORTS.find((r) => r.key === "invoices");
  if (!report) throw new Error("invoices report missing");
  return report;
};

const rows = [
  { invoice_number: "B-48834", total_amount: 7750, paid_amount: 7750, payment_mode: "Part-Payment" },
  { invoice_number: "B-48830", total_amount: 5000, paid_amount: 5000, payment_mode: "Google Pay" },
  { invoice_number: "B-48824", total_amount: 800, paid_amount: 800, payment_mode: "Cash" },
  { invoice_number: "B-48821", total_amount: 3500, paid_amount: 3500, payment_mode: "Credit Card" },
  { invoice_number: "B-48810", total_amount: 2000, paid_amount: 0, payment_mode: null },
];

describe("Invoices & Revenue summary", () => {
  it("breaks the collection down by instrument instead of one lump", async () => {
    const report = await invoicesReport();
    const labels = report.summary!(rows).map((s) => s.label);
    expect(labels.slice(0, 2)).toEqual(["Invoices", "Total Billed"]);
    expect(labels).toContain("UPI");
    expect(labels).toContain("Cash");
    expect(labels).toContain("Card");
    expect(labels).not.toContain("Collected");
    expect(labels).not.toContain("Outstanding");
  });

  it("does not show a card for an instrument the period never used", async () => {
    const report = await invoicesReport();
    const labels = report.summary!(rows).map((s) => s.label);
    expect(labels).not.toContain("Cheque");
    expect(labels).not.toContain("Bank Transfer");
  });

  it("shows a cheque card as soon as a cheque is taken", async () => {
    const report = await invoicesReport();
    const labels = report
      .summary!([...rows, { total_amount: 900, paid_amount: 900, payment_mode: "Cheque" }])
      .map((s) => s.label);
    expect(labels).toContain("Cheque");
  });

  it("never abbreviates a figure to lakhs or crores", async () => {
    // "Rs 1.95 L" cannot be reconciled against a bank statement or the cash
    // drawer, which is the only reason these cards exist.
    const report = await invoicesReport();
    const big = report.summary!(rows.map((r) => ({ ...r, total_amount: 194800, paid_amount: 194800 })));
    for (const card of big) {
      expect(card.value, card.label).not.toMatch(/\d\s?(L|Cr|K|M|B)$/);
    }
    expect(big.find((s) => s.label === "Total Billed")?.value).toBe("₹9,74,000");
  });

  it("still counts every invoice and the full billed amount", async () => {
    const report = await invoicesReport();
    const summary = report.summary!(rows);
    expect(summary.find((s) => s.label === "Invoices")?.value).toBe("5");
    // 7,750 + 5,000 + 800 + 3,500 + 2,000
    expect(summary.find((s) => s.label === "Total Billed")?.value).toMatch(/19/);
  });
});

describe("Invoices & Revenue columns", () => {
  it("is the twelve columns the clinic asked for, in that order", async () => {
    const report = await invoicesReport();
    expect(report.columns.map((c) => c.key)).toEqual([
      "created_at",
      "invoice_number",
      "patient_name",
      "service",
      "doctor_name",
      "payment_mode",
      "total_amount",
      "gst_rate",
      "gst_amount",
      "amount_before_gst",
      "material_percent_label",
      "amount_after_deduction",
    ]);
  });

  it("shows what is left after the deduction, not the deduction", async () => {
    const report = await invoicesReport();
    const column = report.columns.find((c) => c.key === "amount_after_deduction")!;
    expect(column.label).toBe("Amount after Deduction");
    // 11,850 before GST, 550 of material.
    expect(column.accessor!({ total_amount: 12380, tax_amount: 530, material_cost_total: 550 })).toBeCloseTo(11300, 2);
    // Nothing recorded, so nothing is deducted.
    expect(column.accessor!({ total_amount: 12380, tax_amount: 530, material_cost_total: null })).toBeCloseTo(11850, 2);
  });

  it("shapes its own sheet for Excel and the PDF, and only there", async () => {
    const report = await invoicesReport();
    expect(report.exportRows).toBeTypeOf("function");
    expect(report.exportTotals).toBeTypeOf("function");
    const sheet = report.exportRows!([
      {
        id: "inv-1",
        created_at: "2026-09-30T10:00:00+00:00",
        invoice_number: "INV-49503",
        patient_name: "Jahnavi",
        total_amount: 12380,
        tax_amount: 530,
        hsn_rates: { "999319": 0, "999722": 5 },
        material_lines: [],
        line_items: [
          { name: "CONSULTATION- DR VINDHYA PAI", hsn: "999319", qty: 1, price: 1250 },
          { name: "Underarms hair reduction", hsn: "999722", qty: 1, price: 3100 },
          { name: "Full legs hair reduction", hsn: "999722", qty: 1, price: 7500 },
        ],
      },
    ]);
    expect(sheet).toHaveLength(3);
    expect(sheet.map((r) => r.gst_rate)).toEqual(["0%", "5%", "5%"]);
    const totals = report.exportTotals!(sheet);
    expect(totals!.total_amount).toBeCloseTo(12380, 2);
    expect(totals!.gst_amount).toBeCloseTo(530, 2);
  });

  it("no longer carries Paid or Status as columns", async () => {
    // Dropped at the clinic's request. The Status filter and the collection
    // cards read the row rather than the column list, so both still work.
    const report = await invoicesReport();
    const keys = report.columns.map((c) => c.key);
    expect(keys).not.toContain("paid_amount");
    expect(keys).not.toContain("status");
    expect(report.filters.some((f) => f.key === "status")).toBe(true);
  });

  it("does not promise paid and pending amounts it no longer shows", async () => {
    // The description is printed on the PDF.
    const report = await invoicesReport();
    expect(report.description).not.toMatch(/pending/i);
  });

  it("names the services from the billed lines the material figures come from", async () => {
    const report = await invoicesReport();
    const column = report.columns.find((c) => c.key === "service")!;
    expect(column.accessor!({ line_items: [{ name: "Laser toning" }, { name: "Peel" }] })).toBe(
      "Laser toning, Peel",
    );
  });

  it("leaves the money keys alone, so the summary and the chart do not move", async () => {
    const report = await invoicesReport();
    const total = report.columns.find((c) => c.key === "total_amount")!;
    expect(total.type).toBe("currency");
    expect(total.accessor).toBeUndefined();
    expect(report.chart?.build).toBeTypeOf("function");
  });

  it("shows the doctor where the cancellation reason used to be", async () => {
    const report = await invoicesReport();
    const keys = report.columns.map((c) => c.key);
    expect(keys).toContain("doctor_name");
    expect(keys).not.toContain("cancellation_reason");
  });

  it("names the doctor from the invoice's own staff link", async () => {
    const report = await invoicesReport();
    const column = report.columns.find((c) => c.key === "doctor_name")!;
    expect(column.accessor!({ doctor: { first_name: "Vindhya", last_name: "Pai" } })).toBe("Vindhya Pai");
  });

  it("falls back to the name recorded on the appointment", async () => {
    // Almost all the Salesforce-imported history has no staff record to point
    // at, and a blank Doctor column on a 2021 report is not a report on 2021.
    const report = await invoicesReport();
    const column = report.columns.find((c) => c.key === "doctor_name")!;
    expect(column.accessor!({ doctor: null, appointment: { doctor_name: "Dr. Shricharith Shetty" } }))
      .toBe("Dr. Shricharith Shetty");
  });

  it("gives an empty string, not 'undefined undefined', with neither", async () => {
    const report = await invoicesReport();
    const column = report.columns.find((c) => c.key === "doctor_name")!;
    expect(column.accessor!({})).toBe("");
  });
});

describe("Invoices & Revenue payment mode filter", () => {
  it("matches by instrument so UPI finds the Google Pay rows the UPI card counted", async () => {
    const report = await invoicesReport();
    const filter = report.filters.find((f) => f.key === "payment_mode")!;
    expect(filter.matches!({ payment_mode: "Google Pay" }, "UPI")).toBe(true);
    expect(filter.matches!({ payment_mode: "Credit Card" }, "Card")).toBe(true);
    expect(filter.matches!({ payment_mode: "Google Pay" }, "Cash")).toBe(false);
  });

  it("offers the same buckets the cards use", async () => {
    const report = await invoicesReport();
    const filter = report.filters.find((f) => f.key === "payment_mode")!;
    expect(filter.options!.map((o) => o.value)).toEqual(["UPI", "Cash", "Card", "Bank Transfer", "Cheque", "Other"]);
  });
});
