/**
 * The Invoices & Revenue sheet, as Excel and the PDF show it.
 *
 * On screen the report is one row per invoice, and it has to stay that way: the
 * Invoices count, Total Billed, the collection cards and the Revenue by Month
 * chart all reduce over the rows the table holds, so a bill split across three
 * rows would be counted three times. The exported sheet is a different job -
 * the clinic reads it line by line and adds the columns up - so the split, the
 * totals line and the earliest-first order live here, and nothing the screen
 * shows moves.
 *
 * The per-line money is the bill's own, not a guess. Each stored line carries
 * its HSN; the Tax Master rate for that code reproduces the bill's own GST to
 * within a rupee on 6,711 of the 7,222 multi-service invoices. Where it does
 * not, the lines are scaled by their share of the tax - never by their share of
 * the amount, which would move tax onto a zero-rated treatment - so the lines
 * always add back to what was charged.
 *
 * Not invoiceLineRows() from invoiceLines.ts, which does the same arithmetic:
 * its HSN rates live in a module-level cache that only the Billing page fills,
 * so on the Reports route it is empty and the rate printed is the stored
 * snapshot, which is known to drift. A figure that depends on which page
 * somebody opened first is not a report.
 */

import { amountBeforeGst, gstAmount } from "@/lib/invoiceGst";

/** Total GST percent per HSN code, from the Tax Master. */
export type HsnRates = Record<string, number>;

export interface MaterialLine {
  invoice_id?: string | null;
  service_name?: string | null;
  material_percent?: number | string | null;
  material_cost?: number | string | null;
}

export interface InvoiceExportRow {
  created_at: string;
  invoice_number: string;
  patient_name: string;
  service: string;
  doctor_name: string;
  payment_mode: string;
  total_amount: number | null;
  gst_rate: string;
  gst_amount: number | null;
  amount_before_gst: number | null;
  material_percent_label: string;
  amount_after_deduction: number | null;
}

export interface ExportRowOptions {
  rates?: HsnRates;
  materialLines?: MaterialLine[];
  doctorName?: (invoice: Record<string, unknown>) => string;
  paymentMode?: (invoice: Record<string, unknown>) => string;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const tidy = (v: unknown): string => String(v ?? "").trim();

/** Service names are compared the way the material view compares them. */
const normalise = (v: unknown): string => tidy(v).toLowerCase().replace(/\s+/g, " ");

/** "5%", or "" where no rate can be shown without inventing one. */
const rateLabel = (pct: number | null): string =>
  pct === null ? "" : `${Number(pct.toFixed(2))}%`;

interface SplitLine {
  name: string;
  amount: number;
  tax: number;
  total: number;
  rate: number | null;
  materialPercent: number | null;
  materialCost: number;
}

/**
 * One entry per billed line, with that line's own share of the bill's GST.
 *
 * A bill with no line snapshot comes back as a single line carrying the whole
 * invoice, which is what it is: the breakdown exists to split a bill that was
 * itemised, not to invent an itemisation for one that was not.
 */
export function invoiceLineSplit(
  invoice: Record<string, unknown>,
  rates: HsnRates = {},
  materialLines: MaterialLine[] = [],
): SplitLine[] {
  const invoiceTax = gstAmount(invoice);
  const invoiceBase = amountBeforeGst(invoice);
  const raw = Array.isArray(invoice?.line_items) ? (invoice.line_items as Record<string, unknown>[]) : [];

  const materialFor = (name: string) =>
    materialLines.find((m) => normalise(m?.service_name) === normalise(name));

  if (raw.length === 0) {
    const m = materialFor("");
    return [{
      name: "",
      amount: invoiceBase,
      tax: invoiceTax,
      total: invoiceBase + invoiceTax,
      rate: null,
      materialPercent: m ? num(m.material_percent) : null,
      materialCost: m ? num(m.material_cost) : 0,
    }];
  }

  const lines: SplitLine[] = raw.map((it) => {
    const qty = num(it?.qty) || 1;
    const price = num(it?.price);
    const amount = qty * price;
    const hsn = tidy(it?.hsn);
    // The Tax Master, never the line's own stored rate: 999722 is snapshotted
    // at 2.5 on older bills against a master of 5.
    const rate = hsn && rates[hsn] !== undefined ? rates[hsn] : null;
    const name = tidy(it?.name);
    const m = materialFor(name);
    return {
      name,
      amount,
      tax: rate === null ? 0 : (amount * rate) / 100,
      total: 0,
      rate,
      materialPercent: m ? num(m.material_percent) : null,
      materialCost: m ? num(m.material_cost) : 0,
    };
  });

  // Make the lines agree with what the bill charged, rather than the other way
  // round. Scaled by share of tax so a zero-rated treatment stays untaxed; only
  // where no line resolved a rate at all is there nothing better than share of
  // amount, and then no line can claim a rate.
  const taxSum = lines.reduce((s, l) => s + l.tax, 0);
  const amountSum = lines.reduce((s, l) => s + l.amount, 0);
  if (Math.abs(taxSum - invoiceTax) > 0.01) {
    if (taxSum > 0) {
      lines.forEach((l) => { l.tax = (l.tax / taxSum) * invoiceTax; });
    } else if (amountSum > 0 && invoiceTax !== 0) {
      lines.forEach((l) => {
        l.tax = (l.amount / amountSum) * invoiceTax;
        l.rate = null;
      });
    }
  }
  lines.forEach((l) => { l.total = l.amount + l.tax; });
  return lines;
}

/**
 * The whole sheet: earliest first, a line per service.
 *
 * A bill's date, number, patient, doctor and payment mode are printed on its
 * first line only. Repeating them would read as three invoices, and leaving
 * them off the first line would lose which bill the lines belong to.
 */
export function invoiceExportRows(
  invoices: Record<string, unknown>[],
  options: ExportRowOptions = {},
): InvoiceExportRow[] {
  const { rates = {}, materialLines = [], doctorName, paymentMode } = options;

  const byInvoice = new Map<string, MaterialLine[]>();
  for (const line of materialLines) {
    const id = tidy(line?.invoice_id);
    if (!id) continue;
    const found = byInvoice.get(id);
    if (found) found.push(line);
    else byInvoice.set(id, [line]);
  }

  const when = (inv: Record<string, unknown>) => {
    const t = Date.parse(String(inv?.created_at ?? ""));
    return Number.isFinite(t) ? t : 0;
  };
  const ordered = [...invoices].sort((a, b) => when(a) - when(b));

  const out: InvoiceExportRow[] = [];
  for (const inv of ordered) {
    const lines = invoiceLineSplit(inv, rates, byInvoice.get(tidy(inv?.id)) ?? []);
    lines.forEach((line, i) => {
      const first = i === 0;
      out.push({
        created_at: first ? String(inv?.created_at ?? "") : "",
        invoice_number: first ? tidy(inv?.invoice_number) : "",
        patient_name: first ? tidy(inv?.patient_name) : "",
        service: line.name,
        doctor_name: first ? (doctorName?.(inv) ?? "") : "",
        payment_mode: first ? (paymentMode?.(inv) ?? "") : "",
        total_amount: line.total,
        gst_rate: rateLabel(line.rate),
        gst_amount: line.tax,
        amount_before_gst: line.amount,
        material_percent_label: line.materialPercent ? rateLabel(line.materialPercent) : "",
        amount_after_deduction: line.amount - line.materialCost,
      });
    });
  }
  return out;
}

/**
 * The line under the columns that get added up.
 *
 * Only the four money columns carry a figure. A total of a date, a patient or a
 * GST rate is not a number, and a column of blanks under them says so better
 * than a zero would.
 */
export function invoiceExportTotals(rows: InvoiceExportRow[]): Record<string, unknown> {
  const sum = (pick: (r: InvoiceExportRow) => number | null) =>
    rows.reduce((s, r) => s + num(pick(r)), 0);
  return {
    invoice_number: "TOTAL",
    total_amount: sum((r) => r.total_amount),
    gst_amount: sum((r) => r.gst_amount),
    amount_before_gst: sum((r) => r.amount_before_gst),
    amount_after_deduction: sum((r) => r.amount_after_deduction),
  };
}

/**
 * The sheet, built from rows that carry their own ingredients.
 *
 * The Tax Master rates and the bill's material lines are fetched alongside the
 * invoices and put on the row, rather than kept in a module-level cache. A
 * cache is how invoiceLines.ts ended up printing a different rate depending on
 * which page somebody opened first.
 */
export function invoiceExportSheet(
  rows: Record<string, unknown>[],
  options: Pick<ExportRowOptions, "doctorName" | "paymentMode"> = {},
): InvoiceExportRow[] {
  const rates = (rows.find((r) => r?.hsn_rates)?.hsn_rates as HsnRates) ?? {};
  const materialLines = rows.flatMap((r) =>
    Array.isArray(r?.material_lines) ? (r.material_lines as MaterialLine[]) : [],
  );
  return invoiceExportRows(rows, { ...options, rates, materialLines });
}
