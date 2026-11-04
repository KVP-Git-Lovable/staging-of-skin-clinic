// Which HSN code a billed line carries.
//
// Salesforce's Billing__c has no HSN field - the import wrote `hsn: ""` on every
// line, so the HSN column printed blank on all of them. The codes exist, but
// which set applies depends on when the bill was raised, because the clinic
// moved to the six-digit SAC codes at the September 2025 GST rate change:
//
//   Before 2025-09-21        After
//   9997   taxable (18%)     999722  taxable (5%)  - beauty / physical well-being
//   9993   exempt  (0%)      999319  exempt  (0%)  - human health services
//
// The four-digit codes are still visible in this codebase: src/lib/hsn.ts was
// written because a service "still storing an old code - 9997" kept putting it
// back in front of the front desk after it was retired from the Tax Master.
//
// A rate this does not recognise returns "". A wrong HSN on a tax invoice is
// worse than an empty one - an empty cell is visibly missing, a wrong code is
// not.

/** The day the clinic's GST rates and HSN codes changed. */
export const HSN_CHANGEOVER = "2025-09-21";

export const HSN_EXEMPT_OLD = "9993";
export const HSN_TAXABLE_OLD = "9997";
export const HSN_EXEMPT = "999319";
export const HSN_SERVICES_5 = "999722";

/**
 * The HSN for a line charged at this GST rate on this date.
 *
 * `billedOn` decides which code set applies; an unparseable or missing date is
 * treated as current, since anything being imported now without a usable date
 * is far more likely to be a new bill than a 2020 one.
 */
export function hsnForRate(
  rate: number | string | null | undefined,
  billedOn?: string | Date | null,
): string {
  // Guard before converting: Number(null) and Number("") are both 0, which
  // would hand an exempt code to a line whose rate is simply unknown.
  if (rate === null || rate === undefined || String(rate).trim() === "") return "";
  const n = Number(rate);
  if (!Number.isFinite(n)) return "";

  const when = billedOn ? new Date(billedOn) : null;
  const isOld = when && !Number.isNaN(when.getTime())
    ? when < new Date(HSN_CHANGEOVER)
    : false;

  if (n === 0) return isOld ? HSN_EXEMPT_OLD : HSN_EXEMPT;
  if (isOld) return n === 18 ? HSN_TAXABLE_OLD : "";
  return n === 5 ? HSN_SERVICES_5 : "";
}
