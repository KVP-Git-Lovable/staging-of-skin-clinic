/**
 * Grouping the many spellings of a payment mode into the handful of
 * instruments the clinic actually reconciles against.
 *
 * Invoices raised in this app store one of five modes (Cash, Card, UPI,
 * Cheque, Bank Transfer). Everything imported from Salesforce does not: that
 * history carries "Google Pay", "Credit Card", "Part-Payment" and friends. A
 * report that lists those verbatim cannot answer "how much came in on UPI
 * yesterday", which is the question the collection figure is for.
 */

export const PAYMENT_BUCKETS = ["UPI", "Cash", "Card", "Bank Transfer", "Cheque", "Other"] as const;
export type PaymentBucket = (typeof PAYMENT_BUCKETS)[number];

/**
 * Matched in order, first hit wins, so the more specific spellings come first.
 * Note there is deliberately no bare "pay" rule: "Part-Payment" is a Salesforce
 * value meaning the bill was only partly settled, not an instrument, and a
 * "pay" rule would file it under UPI.
 */
const RULES: { bucket: PaymentBucket; needles: string[] }[] = [
  { bucket: "UPI", needles: ["upi", "google pay", "googlepay", "g pay", "gpay", "phonepe", "phone pe", "paytm", "bhim", "qr code", "scan and pay"] },
  { bucket: "Cheque", needles: ["cheque", "check", "demand draft"] },
  { bucket: "Bank Transfer", needles: ["bank transfer", "banktransfer", "net banking", "netbanking", "neft", "imps", "rtgs", "wire", "online transfer", "bank"] },
  { bucket: "Card", needles: ["credit card", "debit card", "credit/debit", "card", "swipe", "pos machine", "visa", "mastercard", "rupay"] },
  { bucket: "Cash", needles: ["cash"] },
];

export function paymentBucket(mode: string | null | undefined): PaymentBucket {
  const value = String(mode ?? "").trim().toLowerCase();
  if (!value) return "Other";
  for (const rule of RULES) {
    if (rule.needles.some((needle) => value.includes(needle))) return rule.bucket;
  }
  return "Other";
}

export interface PaidRow {
  paid_amount?: number | string | null;
  payment_mode?: string | null;
  payment_splits?: unknown;
}

interface Split {
  mode?: string | null;
  amount?: number | string | null;
}

const splitsOf = (row: PaidRow): Split[] =>
  Array.isArray(row?.payment_splits) ? (row.payment_splits as Split[]) : [];

interface Attribution {
  bucket: PaymentBucket;
  /** The mode exactly as it is stored, trimmed. "" when nothing was recorded. */
  mode: string;
  amount: number;
}

/**
 * Every rupee of `paid_amount`, attributed to the mode it was paid with.
 *
 * One walk over the rows, so the bucket totals and the breakdown of what is
 * inside a bucket can never disagree about where a payment went.
 *
 * A split payment is broken up across its parts; anything left over between the
 * splits and `paid_amount` is attributed to the invoice's own mode, so a
 * half-entered split cannot lose money. That remainder is deliberately allowed
 * to be negative when the splits overshoot - dropping it would silently
 * overstate the collection.
 */
function* attributions(rows: PaidRow[]): Generator<Attribution> {
  const at = (mode: string | null | undefined, amount: number): Attribution => ({
    bucket: paymentBucket(mode),
    mode: String(mode ?? "").trim(),
    amount,
  });

  for (const row of rows) {
    const paid = Number(row?.paid_amount ?? 0) || 0;
    const splits = splitsOf(row);
    if (splits.length === 0) {
      yield at(row?.payment_mode, paid);
      continue;
    }
    let attributed = 0;
    for (const split of splits) {
      const amount = Number(split?.amount ?? 0) || 0;
      attributed += amount;
      yield at(split?.mode, amount);
    }
    yield at(row?.payment_mode, paid - attributed);
  }
}

/**
 * What was collected, per instrument.
 *
 * Every rupee in `paid_amount` lands in exactly one bucket, so the buckets add
 * up to the old "Collected" total - an invoice whose mode nobody recognises
 * shows up under "Other" rather than quietly going missing.
 */
export function collectionsByBucket(rows: PaidRow[]): Map<PaymentBucket, number> {
  const totals = new Map<PaymentBucket, number>();
  for (const { bucket, amount } of attributions(rows)) {
    if (!amount) continue;
    totals.set(bucket, (totals.get(bucket) ?? 0) + amount);
  }
  return totals;
}

/** Shown for a payment whose mode was never recorded at all. */
export const UNRECORDED_MODE = "Not recorded";

/** At most this many modes are named on the Other card before "+N more". */
export const HINT_MODE_LIMIT = 3;

/**
 * What is actually inside the "Other" bucket, by the mode as it is stored.
 *
 * "Other" is not a payment method - it is where an unrecognised mode lands,
 * which on imported history is overwhelmingly Salesforce's "Part-Payment". The
 * front desk asks what that money is every time the report is shown, and the
 * card cannot answer without this.
 *
 * Spellings are grouped case-insensitively. The label is the spelling that
 * appears most often, ties broken lexicographically - picking whichever came
 * first would flip the label when the date range changes.
 */
export function unrecognisedModeTotals(rows: PaidRow[]): Map<string, number> {
  const groups = new Map<string, { total: number; spellings: Map<string, number> }>();

  for (const { bucket, mode, amount } of attributions(rows)) {
    if (bucket !== "Other" || !amount) continue;
    const key = mode.toLowerCase();
    const group = groups.get(key) ?? { total: 0, spellings: new Map<string, number>() };
    group.total += amount;
    group.spellings.set(mode, (group.spellings.get(mode) ?? 0) + 1);
    groups.set(key, group);
  }

  const totals = new Map<string, number>();
  for (const [key, group] of groups) {
    if (!key) {
      totals.set(UNRECORDED_MODE, (totals.get(UNRECORDED_MODE) ?? 0) + group.total);
      continue;
    }
    const [label] = Array.from(group.spellings).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0];
    totals.set(label, group.total);
  }
  return totals;
}

/** The modes behind the Other card, biggest first, as one short line. */
export function unrecognisedModeHint(rows: PaidRow[], limit = HINT_MODE_LIMIT): string | undefined {
  const named = Array.from(unrecognisedModeTotals(rows)).sort(
    (a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0]),
  );
  if (named.length === 0) return undefined;
  const shown = named.slice(0, limit).map(([label]) => label);
  const hidden = named.length - shown.length;
  return hidden > 0 ? `${shown.join(", ")} +${hidden} more` : shown.join(", ");
}

/**
 * The buckets with money in them, in a fixed order, for the KPI cards.
 *
 * "Other" keeps its name rather than being replaced by the mode inside it: the
 * Payment Mode filter underneath these cards offers the buckets, so a card
 * labelled "Part-Payment" would leave the reader's next click with nowhere to
 * land. It carries a hint line instead.
 */
export function collectionCards(
  rows: PaidRow[],
  formatValue: (amount: number) => string,
): { label: string; value: string; hint?: string }[] {
  const totals = collectionsByBucket(rows);
  return PAYMENT_BUCKETS.filter((bucket) => (totals.get(bucket) ?? 0) !== 0).map((bucket) => ({
    label: bucket,
    value: formatValue(totals.get(bucket) ?? 0),
    ...(bucket === "Other" ? { hint: unrecognisedModeHint(rows) } : {}),
  }));
}

/**
 * What one invoice was actually paid with, for a Mode column.
 *
 * `payment_mode` alone answers this for all but a handful of invoices. When
 * staff take a bill across two instruments, Billing writes the literal string
 * "Split" into that column and puts the detail in `payment_splits` - so the
 * report printed "Split" and nobody could tell whether the drawer should hold
 * the money. The parts are named here instead: "Cash ₹700 + UPI ₹100".
 *
 * Modes are printed as recorded, not bucketed, because this is a record of
 * what happened at the counter. Bucketing belongs in the collection totals,
 * where the question is "how much came in on UPI".
 */
export function paymentModeLabel(row: PaidRow): string {
  const splits = splitsOf(row).filter((s) => String(s?.mode ?? "").trim() || Number(s?.amount ?? 0));
  const stored = String(row?.payment_mode ?? "").trim();
  if (splits.length < 2) return stored || (splits[0] ? String(splits[0].mode ?? "").trim() : "");
  return splits
    .map((s) => {
      const mode = String(s?.mode ?? "").trim() || UNRECORDED_MODE;
      const amount = Number(s?.amount ?? 0) || 0;
      return `${mode} ₹${amount.toLocaleString("en-IN")}`;
    })
    .join(" + ");
}

/**
 * Every bucket an invoice paid through, so a filter can find a split under
 * either half of it.
 *
 * Without this, picking "Cash" missed an invoice that was half cash: "Split"
 * buckets to "Other", while the money itself was already counted under Cash
 * and UPI on the cards above - the filter and the totals contradicted
 * each other.
 */
export function modesOf(row: PaidRow): PaymentBucket[] {
  const splits = splitsOf(row);
  if (splits.length === 0) return [paymentBucket(row?.payment_mode)];
  const seen = new Set<PaymentBucket>();
  for (const split of splits) {
    if (!(Number(split?.amount ?? 0) || 0) && !String(split?.mode ?? "").trim()) continue;
    seen.add(paymentBucket(split?.mode));
  }
  // A split that does not add up leaves a remainder on the invoice's own mode,
  // exactly as attributions() treats it, so the filter matches that mode too.
  const paid = Number(row?.paid_amount ?? 0) || 0;
  const attributed = splits.reduce((a, s) => a + (Number(s?.amount ?? 0) || 0), 0);
  if (Math.round((paid - attributed) * 100) !== 0) seen.add(paymentBucket(row?.payment_mode));
  return seen.size ? [...seen] : [paymentBucket(row?.payment_mode)];
}
