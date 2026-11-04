import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({}) } }));

const getReport = async (key: string) => {
  const { REPORTS } = await import("./reportsCatalog");
  const report = REPORTS.find((r) => r.key === key);
  if (!report) throw new Error(`${key} report missing`);
  return report;
};

const cancelled = [
  { invoice_number: "B-48834", patient_name: "Safa", total_amount: 7750, cancellation_reason: "Wrong service billed", cancelled_by_name: "reception@clinic", cancelled_at: "2026-09-18T10:00:00Z" },
  { invoice_number: "B-48830", patient_name: "Jibin", total_amount: 5000, cancellation_reason: "Duplicate bill", cancelled_by_name: "reception@clinic", cancelled_at: "2026-09-19T10:00:00Z" },
];

describe("Cancelled Invoices report", () => {
  it("sits under Finance, beside Invoices & Revenue", async () => {
    const report = await getReport("cancelled_invoices");
    expect(report.category).toBe("Finance");
    expect(report.title).toBe("Cancelled Invoices");
  });

  it("shows the billing id, patient, amount and why it was cancelled", async () => {
    const keys = (await getReport("cancelled_invoices")).columns.map((c) => c.key);
    expect(keys).toContain("invoice_number");
    expect(keys).toContain("patient_name");
    expect(keys).toContain("total_amount");
    expect(keys).toContain("cancellation_reason");
    expect(keys).toContain("cancelled_by_name");
    expect(keys).toContain("cancelled_at");
  });

  it("labels the invoice number as Billing ID, which is what staff call it", async () => {
    const col = (await getReport("cancelled_invoices")).columns.find((c) => c.key === "invoice_number")!;
    expect(col.label).toBe("Billing ID");
  });

  it("leads with the most recently cancelled", async () => {
    expect((await getReport("cancelled_invoices")).defaultSort).toEqual({ key: "cancelled_at", dir: "desc" });
  });

  it("totals the cancelled value and says it is kept out of revenue", async () => {
    const report = await getReport("cancelled_invoices");
    const summary = report.summary!(cancelled);
    expect(summary.find((s) => s.label === "Cancelled Invoices")?.value).toBe("2");
    const value = summary.find((s) => s.label === "Value Cancelled")!;
    expect(value.value).toContain("12,750");
    expect(value.hint).toMatch(/not counted in invoices & revenue/i);
  });

  it("can be searched by reason and by who cancelled it, not just the number", async () => {
    const fields = (await getReport("cancelled_invoices")).searchFields ?? [];
    expect(fields).toContain("cancellation_reason");
    expect(fields).toContain("cancelled_by_name");
  });

  it("filters by when the bill was cancelled, not when it was raised", async () => {
    const f = (await getReport("cancelled_invoices")).filters.find((x) => x.type === "dateRange")!;
    expect(f.serverDateField).toBe("cancelled_at");
    expect(f.label).toBe("Cancelled Date");
  });
});

describe("Invoices & Revenue no longer carries cancelled bills", () => {
  it("does not offer Cancelled as a status to filter by", async () => {
    // The rows are excluded at the query, so the option could only ever return
    // an empty table - offering it would read as "there are none", which is a
    // different and wrong statement.
    const status = (await getReport("invoices")).filters.find((f) => f.key === "status")!;
    const options = (status.options ?? []).map((o) => o.value);
    expect(options).toEqual(["Pending", "Partial", "Paid"]);
    expect(options).not.toContain("Cancelled");
  });

  it("keeps the two reports separate", async () => {
    const invoices = await getReport("invoices");
    const cancelledReport = await getReport("cancelled_invoices");
    expect(invoices.key).not.toBe(cancelledReport.key);
    expect(cancelledReport.description).toMatch(/cancelled/i);
  });
});
