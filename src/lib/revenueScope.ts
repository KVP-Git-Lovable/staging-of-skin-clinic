/**
 * Which invoices count as money the clinic actually took.
 *
 * A cancelled bill is money never collected, so it must not reach a revenue
 * figure - and it must not reach it in *some* places and not others, which is
 * what was happening. The Dashboard (Index.tsx) and the Invoices & Revenue
 * report both dropped cancelled bills; the staff performance chart, the staff
 * page, the dashboard drill-down and campaign ROI all silently included them.
 * The same doctor's revenue therefore read one figure on the Dashboard and a
 * larger one on their own page, and nobody could tell which was right.
 *
 * There were no cancelled invoices in the database when this was written - the
 * only four were test bills, since removed - so the numbers agreed by accident.
 * They would have diverged the first time the clinic cancelled a real bill.
 */

export const CANCELLED_STATUS = "Cancelled";

/** True for an invoice whose value belongs in a revenue total. */
export function countsTowardRevenue(status: string | null | undefined): boolean {
  return String(status ?? "").trim().toLowerCase() !== CANCELLED_STATUS.toLowerCase();
}

/** Drop cancelled bills from a list of invoices fetched client-side. */
export function onlyCountableInvoices<T extends { status?: string | null }>(invoices: T[]): T[] {
  return invoices.filter((i) => countsTowardRevenue(i?.status));
}
