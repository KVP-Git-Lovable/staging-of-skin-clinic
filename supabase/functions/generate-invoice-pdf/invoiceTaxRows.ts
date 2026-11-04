/**
 * Making a printed invoice's lines agree with the GST the bill actually carries.
 *
 * The PDF works every line's rate out from the Tax Master as it stands today.
 * That is right for a bill raised today and wrong for one reprinted after a
 * rate changed: the Amount column stopped adding up to the Total Billed
 * underneath it, and a document that cannot be reconciled against itself is not
 * a tax invoice.
 *
 * The invoice's own stored CGST/SGST/IGST is what the patient was charged, so
 * the lines are scaled to it. The invoice on screen already does exactly this
 * (src/lib/invoiceLines.ts); keeping the rule here, beside the function and
 * tested from the app's own suite, is what stops the screen and the printed
 * document drifting apart again.
 */

export interface TaxableLine {
  sgst: number;
  cgst: number;
  igst: number;
  taxAmount: number;
  /** Tax-inclusive, so the Amount column adds up to the Total Billed. */
  amount: number;
}

/**
 * The lines, scaled so their tax comes to `storedTax`.
 *
 * Each line keeps its share OF THE TAX rather than of the amount: spreading by
 * amount would move GST onto the exempt treatment lines, which were never
 * taxed. Only where no line carries any tax at all is an even spread the best
 * available. The printed percentages follow the figures, so a row can never
 * show one rate and a tax worked out at another.
 */
export function reconcileLineTax<T extends TaxableLine>(
  lines: T[],
  storedTax: number,
  sameState: boolean
): T[] {
  if (!(storedTax > 0) || lines.length === 0) return lines;
  const lineTaxSum = lines.reduce((sum, line) => sum + line.taxAmount, 0);
  if (Math.abs(lineTaxSum - storedTax) <= 0.01) return lines;

  const grossSum = lines.reduce((sum, line) => sum + (line.amount - line.taxAmount), 0);
  return lines.map((line) => {
    const gross = line.amount - line.taxAmount;
    const taxAmount = lineTaxSum > 0
      ? (line.taxAmount / lineTaxSum) * storedTax
      : grossSum > 0 ? (gross / grossSum) * storedTax : 0;
    const oldRate = line.sgst + line.cgst + line.igst;
    const newRate = gross > 0 ? (taxAmount / gross) * 100 : 0;
    const k = oldRate > 0 ? newRate / oldRate : 0;
    return {
      ...line,
      sgst: oldRate > 0 ? line.sgst * k : sameState ? newRate / 2 : 0,
      cgst: oldRate > 0 ? line.cgst * k : sameState ? newRate / 2 : 0,
      igst: oldRate > 0 ? line.igst * k : sameState ? 0 : newRate,
      taxAmount,
      amount: gross + taxAmount,
    };
  });
}

export interface TaxTotalsInvoice {
  total_amount?: number | string | null;
  tax_amount?: number | string | null;
  cgst_amount?: number | string | null;
  sgst_amount?: number | string | null;
  igst_amount?: number | string | null;
}

const num = (value: number | string | null | undefined): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** The GST the bill carries: its stored split, or its stored total tax. */
export function storedTaxOf(inv: TaxTotalsInvoice | null | undefined): number {
  const split = num(inv?.cgst_amount) + num(inv?.sgst_amount) + num(inv?.igst_amount);
  return split > 0 ? split : num(inv?.tax_amount);
}

export interface TaxTotalRow {
  label: string;
  value: number;
}

/**
 * The rows a tax invoice has to show above its total.
 *
 * The printed invoice showed a GST % against every line and then no tax at all
 * in its totals - only Total Billed, Total Paid and Balance Due - while the
 * same bill on screen showed CGST and SGST. These are the same stored figures
 * the screen reads, so the two documents say the same thing.
 *
 * A bill with no GST on it gets no rows: an exempt consultation should not
 * print "Total GST 0.00".
 */
export function taxTotalRows(
  inv: TaxTotalsInvoice | null | undefined,
  sameState: boolean,
  fallbackTax = 0
): TaxTotalRow[] {
  const tax = storedTaxOf(inv) || fallbackTax;
  if (!(tax > 0.005)) return [];

  const rows: TaxTotalRow[] = [{ label: "Taxable Value", value: num(inv?.total_amount) - tax }];
  const cgst = num(inv?.cgst_amount);
  const sgst = num(inv?.sgst_amount);
  const igst = num(inv?.igst_amount);
  if (cgst > 0 || sgst > 0 || igst > 0) {
    if (cgst > 0) rows.push({ label: "CGST", value: cgst });
    if (sgst > 0) rows.push({ label: "SGST", value: sgst });
    if (igst > 0) rows.push({ label: "IGST", value: igst });
  } else if (sameState) {
    // No stored split - the same even CGST/SGST assumption the rest of the app
    // makes, rather than one unlabelled "Tax" line.
    rows.push({ label: "CGST", value: tax / 2 }, { label: "SGST", value: tax / 2 });
  } else {
    rows.push({ label: "IGST", value: tax });
  }
  rows.push({ label: "Total GST", value: tax });
  return rows;
}
