/**
 * A bill paid in more than one way.
 *
 * The clinic takes a single payment across two modes often enough that the
 * create form offers it: Basavaraju's ₹32,175 was ₹30,000 cash and ₹2,175 UPI.
 * The rows are stored on the invoice in payment_splits, and payment_mode reads
 * "Split" so every list and the printed copy can say so in one word.
 *
 * These rules lived inline in the create path, which is why Edit Invoice had
 * none of them: it offered a mode list with no "Split" in it, so the box came up
 * blank, and it saved payment_mode without ever touching the rows underneath -
 * one click from a bill that said "Cash" above two payments that said otherwise.
 * One copy now, used by both forms.
 */

export interface PaymentSplit {
  mode: string;
  amount: number;
}

/** The rows stored on an invoice, or none. */
export function splitsFromInvoice(stored: unknown): PaymentSplit[] {
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row) => ({ mode: String(row.mode ?? ""), amount: Number(row.amount) || 0 }));
}

export function splitTotal(rows: PaymentSplit[]): number {
  return rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

/**
 * What payment_mode should say.
 *
 * One row names its own mode - a "split" of one is just that payment. Two or
 * more read "Split". No rows at all leave the single mode the form holds.
 */
export function paymentModeForSplits(rows: PaymentSplit[], fallback: string): string {
  if (rows.length === 0) return fallback;
  return rows.length === 1 ? rows[0].mode : "Split";
}

/**
 * Why these rows cannot be saved, or null when they can.
 *
 * Compared in paise, because 30000 + 2175 and 32175 are the same money however
 * the browser adds them up.
 */
export function splitProblem(rows: PaymentSplit[], paidAmount: number): string | null {
  if (rows.length === 0) return null;
  if (rows.some((row) => !row.mode)) return "Each split row needs a payment mode";
  if (rows.some((row) => !(Number(row.amount) > 0))) return "Each split row needs an amount above zero";
  if (Math.round(splitTotal(rows) * 100) !== Math.round((Number(paidAmount) || 0) * 100)) {
    return "Split amounts must equal paid amount";
  }
  return null;
}

/**
 * What a list should show for a bill's payment mode.
 *
 * payment_mode stores the word "Split" so a bill paid two ways can say so in
 * one word, which is right on the invoice itself - the rows are printed
 * underneath it. In a list there is no underneath, so "Split" is all anybody
 * sees, and the front desk cannot tell a cash-and-card bill from a cash-and-UPI
 * one without opening it.
 *
 * So a list names the modes instead. Order is the order they were taken, and a
 * mode used twice is named once - two cash rows and a UPI row is "Cash + UPI",
 * not "Cash + Cash + UPI".
 */
/**
 * Each mode of a split with what went on it.
 *
 * paymentModeLabel answers "how was this paid" - "Card + UPI" - and the clinic
 * asked the next question: how much on each. The amounts have been sitting in
 * payment_splits all along beside the modes; nothing read them. Josily Boban's
 * 17 Oct bill is ₹29,359 of which ₹26,939 went on a card and ₹2,420 by UPI,
 * and the list said only that two modes were used.
 *
 * Repeats of one mode are merged and summed - two cash rows are one "Cash"
 * holding the total, not "Cash" twice - and the order taken is kept.
 *
 * Empty for an ordinary bill, and empty when no row names a mode at all, so
 * the caller falls back to paymentModeLabel rather than printing nothing.
 */
export function paymentSplitParts(storedMode: string | null | undefined, stored: unknown): PaymentSplit[] {
  const rows = splitsFromInvoice(stored);
  if (rows.length < 2) return [];

  const byMode = new Map<string, PaymentSplit>();
  for (const row of rows) {
    const mode = row.mode.trim();
    if (!mode) continue;
    const key = mode.toLowerCase();
    const existing = byMode.get(key);
    if (existing) existing.amount += Number(row.amount) || 0;
    else byMode.set(key, { mode, amount: Number(row.amount) || 0 });
  }
  return [...byMode.values()];
}

export function paymentModeLabel(storedMode: string | null | undefined, stored: unknown): string {
  const rows = splitsFromInvoice(stored);
  if (rows.length < 2) return (storedMode ?? "").trim();

  const seen = new Set<string>();
  const modes: string[] = [];
  for (const row of rows) {
    const mode = row.mode.trim();
    if (!mode || seen.has(mode.toLowerCase())) continue;
    seen.add(mode.toLowerCase());
    modes.push(mode);
  }
  // Rows with no mode on them at all: nothing truthful to name, so the stored
  // word stands rather than an empty cell.
  return modes.length > 0 ? modes.join(" + ") : (storedMode ?? "").trim();
}
