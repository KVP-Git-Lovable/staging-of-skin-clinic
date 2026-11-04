/**
 * What the Bill Amount cell on the appointments list should say.
 *
 * The cell used to render `invoice ? amount : "—"`, so one dash stood for four
 * different situations: no bill was ever raised, the lookup failed, the query
 * had not resolved yet, or the row simply had nothing to show. The clinic read
 * it as "the bill is missing" and reported a day of visits as unbilled three
 * times over - while the invoices were all present, all linked, and the day's
 * total reconciled with Salesforce to the paise.
 *
 * A free follow-up genuinely has no bill, and that is worth saying out loud. So
 * is a failed lookup, which is the one case where the figure really is unknown
 * and the screen must not imply otherwise.
 *
 * An invoice already in hand wins over everything: a background refetch should
 * not blank a figure that is sitting right there.
 */
export type BillCellState = "amount" | "failed" | "loading" | "elsewhere" | "none";

export function billCellState(opts: {
  hasInvoice: boolean;
  loading: boolean;
  failed: boolean;
  /** The patient has a bill that day, on one of their other appointments. */
  billedElsewhere?: boolean;
}): BillCellState {
  if (opts.hasInvoice) return "amount";
  if (opts.failed) return "failed";
  if (opts.loading) return "loading";
  // A patient can hold two appointment records for one slot, with the single
  // bill attached to the other. "No bill" is true of the row and false of the
  // visit, which is the one case where this column genuinely misleads.
  if (opts.billedElsewhere) return "elsewhere";
  return "none";
}
