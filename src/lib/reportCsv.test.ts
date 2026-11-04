import { describe, it, expect } from "vitest";
import { toCSV } from "./reportCsv";
import type { ReportColumn } from "./reportsCatalog";

const columns: ReportColumn[] = [
  { key: "invoice_number", label: "Invoice #" },
  { key: "created_at", label: "Date", type: "date" },
  { key: "total_amount", label: "Total", type: "currency" },
];

const rows = [
  { invoice_number: "INV-1", created_at: "2026-09-30T10:00:00+00:00", total_amount: 12380 },
  { invoice_number: "INV-2", created_at: "2026-10-01T10:00:00+00:00", total_amount: 800 },
];

describe("toCSV", () => {
  it("writes the headings the printed report uses, money marked as rupees", () => {
    expect(toCSV(columns, []).split("\n")[0]).toBe('"Invoice #","Date","Total (Rs)"');
  });

  it("writes a date Excel will read and money it can add", () => {
    const [, first] = toCSV(columns, rows).split("\n");
    expect(first).toBe('"INV-1","30/09/2026","12380.00"');
  });

  it("puts the totals line under the rows, not among them", () => {
    const out = toCSV(columns, rows, { invoice_number: "TOTAL", total_amount: 13180 }).split("\n");
    expect(out).toHaveLength(4);
    expect(out[3]).toBe('"TOTAL","","13180.00"');
  });

  it("never writes NaN under a column the totals line says nothing about", () => {
    const out = toCSV(columns, rows, { invoice_number: "TOTAL", total_amount: 13180 });
    expect(out).not.toContain("NaN");
  });

  it("leaves the file as it was when there is no totals line", () => {
    expect(toCSV(columns, rows)).toBe(toCSV(columns, rows, null));
  });

  it("escapes a quote rather than breaking the column", () => {
    const out = toCSV([{ key: "n", label: "Name" }], [{ n: 'Peel "B"' }]);
    expect(out.split("\n")[1]).toBe('"Peel ""B"""');
  });
});
