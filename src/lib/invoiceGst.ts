/**
 * The money figures a bill shows in a report: Amount, GST %, GST and Total.
 *
 * Nothing here writes anything or changes a stored figure. Total is the bill's
 * own total_amount, exactly as before, and Amount is derived from it, so every
 * card, chart and export still adds up to the same money.
 *
 * ON THE RATE, because this is where the reports went wrong.
 *
 * The report printed rates like 3.35%, 3.36% and 3.37% - figures that are in no
 * GST slab and that nobody had entered. They were worked out by dividing the
 * GST charged by the whole bill, which only gives a real rate when the whole
 * bill was taxed at one rate.
 *
 * At this clinic it almost never is. Treatment lines are healthcare (HSN 9993 /
 * 999319) and exempt; cosmetic lines (999722) carry 5%; products on HSN 9997
 * carry 18%. A bill of Rs 24,850 of medical treatment plus Rs 50,400 of
 * cosmetic treatment carries Rs 2,520 of GST - 5% of the part that was taxed,
 * and a meaningless 3.37% of the whole.
 *
 * It used to read the bill-level tax_rate first, which hid this. That column
 * stopped being written on 24 September, when bills moved to per-line GST:
 * every taxed bill since records its CGST and SGST and leaves tax_rate empty,
 * so the fallback became the normal path rather than the exception. The
 * Salesforce importer makes the same point deliberately - it stores 0 on a
 * mixed bill, meaning "no single rate, read the lines".
 *
 * So the rates come from the lines, which is where they were charged. One rate
 * reads "5%", two read "5% + 18%", and a bill whose lines cannot account for
 * the GST on it shows no rate at all rather than an invented one. The amount is
 * always there to read beside it.
 */

export interface GstLine {
  qty?: number | string | null;
  price?: number | string | null;
  gst?: number | string | null;
  hsn?: string | null;
}

/** The slabs GST is charged at. Nothing outside this set is a rate. */
const GST_SLABS = [3, 5, 12, 18, 28];

export interface GstInvoice {
  /** Numerics arrive from the database as strings, hence the loose type. */
  total_amount?: number | string | null;
  tax_amount?: number | string | null;
  tax_rate?: number | string | null;
  /** The per-line snapshot taken when the bill was raised. */
  line_items?: GstLine[] | unknown;
}

const num = (value: number | string | null | undefined): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** What the bill came to before GST: its total less the GST on it. */
export function amountBeforeGst(row: GstInvoice | null | undefined): number {
  return num(row?.total_amount) - num(row?.tax_amount);
}

/** The bill's total, unchanged - the same figure the summary cards add up. */
export function totalWithGst(row: GstInvoice | null | undefined): number {
  return num(row?.total_amount);
}

/** The GST charged on the bill, in rupees. */
export function gstAmount(row: GstInvoice | null | undefined): number {
  return num(row?.tax_amount);
}

const linesOf = (row: GstInvoice | null | undefined): GstLine[] =>
  Array.isArray(row?.line_items) ? (row.line_items as GstLine[]) : [];

/**
 * The rates actually charged on this bill, in ascending order.
 *
 * Only trusted when the lines account for the GST the bill carries - within a
 * rupee, since the stored line prices and the stored tax are rounded
 * separately. A snapshot that does not add up is not evidence of anything, so
 * it is ignored rather than guessed at.
 */
export function gstRatesCharged(row: GstInvoice | null | undefined): number[] {
  const tax = num(row?.tax_amount);
  if (tax <= 0) return [];
  const lines = linesOf(row);
  if (lines.length === 0) return [];

  let computed = 0;
  const rates = new Set<number>();
  for (const line of lines) {
    const rate = num(line?.gst);
    const amount = (num(line?.qty) || 1) * num(line?.price);
    if (rate > 0 && amount > 0) {
      rates.add(rate);
      computed += (amount * rate) / 100;
    }
  }
  if (rates.size > 0 && Math.abs(computed - tax) <= 1) {
    return Array.from(rates).sort((a, b) => a - b);
  }
  return ratesFromHsnGroups(lines, tax);
}

/**
 * The rate, worked back from which lines were taxable.
 *
 * Bills raised before the line snapshot carried its own rate - and a few since -
 * record the HSN on every line but leave gst at 0, so the sum above comes to
 * nothing. The HSN is still there, and it is what decided whether a line was
 * taxed: healthcare treatment is exempt, cosmetic treatment is not.
 *
 * So the lines are grouped by HSN and each group asked whether the GST on the
 * bill is a GST slab on exactly that group. Where one group answers and the
 * others do not, that is the rate the bill was charged at - on 33 bills in this
 * clinic's data it recovers the 5% that was otherwise being shown as 3.35%.
 * Where two groups could answer, nothing is claimed.
 */
function ratesFromHsnGroups(lines: GstLine[], tax: number): number[] {
  const byHsn = new Map<string, number>();
  for (const line of lines) {
    const amount = (num(line?.qty) || 1) * num(line?.price);
    if (amount <= 0) continue;
    const hsn = String(line?.hsn ?? "").trim();
    if (!hsn) continue;
    byHsn.set(hsn, (byHsn.get(hsn) ?? 0) + amount);
  }
  const matches = new Set<number>();
  for (const amount of byHsn.values()) {
    for (const slab of GST_SLABS) {
      if (Math.abs((amount * slab) / 100 - tax) <= 1) matches.add(slab);
    }
  }
  return matches.size === 1 ? [...matches] : [];
}

/**
 * The single rate the bill carries, or null when there is no single answer.
 *
 * Null covers three different bills and they all read the same way on a report:
 * one with no GST, one taxed at two rates, and one whose lines do not account
 * for its GST. gstRateLabel tells the first two apart.
 */
export function gstRate(row: GstInvoice | null | undefined): number | null {
  const charged = gstRatesCharged(row);
  if (charged.length === 1) return charged[0];
  if (charged.length > 1) return null;

  if (num(row?.tax_amount) <= 0) return null;
  // No usable line snapshot - Salesforce history, mostly. The bill-level rate
  // is then the only thing anyone recorded, and 0 means "mixed", not "none".
  const recorded = num(row?.tax_rate);
  return recorded > 0 ? recorded : null;
}

/** "5%", "18%", "5% + 18%" - or null for a bill with no GST, which shows blank. */
export function gstRateLabel(row: GstInvoice | null | undefined): string | null {
  const charged = gstRatesCharged(row);
  // Trailing zeros dropped: 5 reads "5%", not "5.00%".
  const pct = (rate: number) => `${Number(rate.toFixed(2))}%`;
  if (charged.length > 1) return charged.map(pct).join(" + ");
  const rate = gstRate(row);
  return rate === null ? null : pct(rate);
}
