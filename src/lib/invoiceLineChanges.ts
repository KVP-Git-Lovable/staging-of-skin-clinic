/**
 * What actually changed between the bill as it was opened and the bill as it
 * stands - a correction to a name, or a change to the money.
 *
 * Edit Invoice recomputes the total, the GST heads and the paid status from
 * the form whenever its lines differ from what was loaded. That guard exists
 * for a good reason: recomputing on every save "would rewrite 46,936 imported
 * invoices the first time anyone opened one, and those already match
 * Salesforce to the rupee".
 *
 * But it is all-or-nothing, and a service name is part of the comparison. So
 * the moment a name could be typed, correcting a spelling would have rewritten
 * the bill's money from today's Tax Master - and could flip a Paid invoice to
 * Partial. Renaming a line is not a repricing of it.
 */

/** Keys that describe the money on a line. A name is not one of them. */
const MONEY_KEYS = ["kind", "qty", "price", "hsn", "gst", "service_id", "material_percent",
  "inventory_id", "product_id", "uom_factor", "batch", "expiry_date"] as const;

const moneyOf = (line: unknown): string => {
  const l = (line ?? {}) as Record<string, unknown>;
  // Every key but the name, in a fixed order, so two lines that charge the
  // same compare equal however the object was built.
  return JSON.stringify(MONEY_KEYS.map((k) => (k in l ? l[k] : null)));
};

const sameLength = (a: unknown[], b: unknown[]) => a.length === b.length;

export interface InvoiceLineChanges {
  /** Anything at all differs - the name included. */
  lines: boolean;
  /** Something that decides what the patient owes differs. */
  money: boolean;
}

export function invoiceLineChanges(before: unknown[], after: unknown[]): InvoiceLineChanges {
  const lines = JSON.stringify(before) !== JSON.stringify(after);
  if (!lines) return { lines: false, money: false };
  // A line added or removed is a change to the bill whatever it was called.
  if (!sameLength(before, after)) return { lines: true, money: true };
  const money = before.some((b, i) => moneyOf(b) !== moneyOf(after[i]));
  return { lines: true, money };
}
