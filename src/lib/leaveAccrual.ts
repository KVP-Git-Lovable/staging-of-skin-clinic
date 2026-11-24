/**
 * How many days of a leave type somebody is entitled to, as of today.
 *
 * leave_types.default_days_per_year has been on the table since March and
 * NOTHING ever acted on it - no trigger, no function, no screen. Casual
 * Leave said 12 days a year while 0 of the 18 active staff had a balance,
 * so the first approved leave created a row with no allowance and sent the
 * remainder negative.
 *
 * Two ways a type can hand its days out, and one number behind both:
 *
 *   yearly   the whole figure is there from 1 January
 *   monthly  a twelfth of it each month, so Casual Leave's 12 is exactly the
 *            "one day a month" the clinic described
 *   manual   nothing arrives on its own; an admin grants it to the person
 *            who needs it. Maternity Leave's 180 days is a statutory
 *            entitlement for one person, not an allowance for all eighteen
 *
 * One number rather than two deliberately. A separate days_per_month field
 * is a second thing to keep in step with the first, and the first time they
 * disagree nobody can say which is right.
 */

export const LEAVE_ACCRUALS = ["yearly", "monthly", "manual"] as const;
export type LeaveAccrual = (typeof LEAVE_ACCRUALS)[number];

export interface LeaveTypeLike {
  default_days_per_year?: number | string | null;
  accrual?: string | null;
}

/** Anything the code does not recognise is the old behaviour. */
export function accrualOf(type: LeaveTypeLike | null | undefined): LeaveAccrual {
  const word = String(type?.accrual ?? "").trim().toLowerCase();
  return (LEAVE_ACCRUALS as readonly string[]).includes(word)
    ? (word as LeaveAccrual)
    : "yearly";
}

/**
 * Months of a year that have begun, as of a date.
 *
 * The month somebody is IN counts: on 3 March they have March's day, the
 * same way a salary arrives at the start of the month it is for. A past year
 * is complete; a future one has not started.
 */
export function monthsAccrued(year: number, asOf: Date = new Date()): number {
  const thisYear = asOf.getFullYear();
  if (year < thisYear) return 12;
  if (year > thisYear) return 0;
  return asOf.getMonth() + 1;
}

/**
 * The days this type has given somebody for a year, by this date.
 *
 * Rounded to two decimals, because a twelfth of 10 is 0.8333 and a balance
 * sheet that reads 2.4999999999999996 days helps nobody.
 */
export function entitlementToDate(
  type: LeaveTypeLike | null | undefined,
  year: number,
  asOf: Date = new Date(),
): number {
  const perYear = Number(type?.default_days_per_year ?? 0);
  if (!Number.isFinite(perYear) || perYear <= 0) return 0;
  // Nothing accrues on its own, so there is nothing to grant in bulk.
  if (accrualOf(type) === "manual") return 0;
  if (accrualOf(type) === "yearly") {
    // A year that has not started yet grants nothing either way.
    return monthsAccrued(year, asOf) > 0 ? round2(perYear) : 0;
  }
  return round2((perYear / 12) * monthsAccrued(year, asOf));
}

/**
 * What to set somebody's opening balance to, given what it already is.
 *
 * NEVER downwards. A monthly type tops itself up as the year goes on, and
 * running this in March after an admin granted somebody extra by hand in
 * February must not take that back. It is also what makes the button safe to
 * press twice.
 */
export function toppedUpBalance(current: number | string | null | undefined, entitled: number): number {
  const now = Number(current ?? 0);
  return Math.max(Number.isFinite(now) ? now : 0, entitled);
}

/** Whether pressing the button would change this person's row at all. */
export function needsTopUp(current: number | string | null | undefined, entitled: number): boolean {
  return toppedUpBalance(current, entitled) > (Number(current ?? 0) || 0);
}

export function accrualLabel(type: LeaveTypeLike | null | undefined): string {
  const perYear = Number(type?.default_days_per_year ?? 0) || 0;
  const how = accrualOf(type);
  if (how === "manual") return `${perYear} days, granted by hand when needed`;
  if (how === "yearly") return `${perYear} days/year, all at once`;
  return `${round2(perYear / 12)} days a month (${perYear}/year)`;
}

/** The option list, so the two pickers cannot drift apart. */
export const ACCRUAL_OPTIONS: { value: LeaveAccrual; label: string }[] = [
  { value: "yearly", label: "All at once, in January" },
  { value: "monthly", label: "A twelfth each month" },
  { value: "manual", label: "By hand only - not granted to everyone" },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
