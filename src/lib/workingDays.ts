/**
 * Which days the clinic is closed.
 *
 * ONE implementation, deliberately. The Bharath Builders app this follows has
 * three copies of the week-off check - in its attendance hook, its calendar
 * view and its working-days config screen - and they disagree: two read a
 * null alternate_pattern on an "is off" day as every week, the third counts
 * it as no weeks at all. Same table, same row, two different answers about
 * whether somebody was meant to be at work.
 */

export interface WeekOffRow {
  day_of_week: number;
  is_off: boolean;
  alternate_pattern: string | null;
}

export interface HolidayRow {
  /** Present on rows read from the database; the date and name are all the
   *  decisions below need. */
  id?: string;
  date: string;
  name: string;
}

/**
 * Is this date a week-off?
 *
 * `alternate_pattern` lets a clinic close on, say, the 2nd and 4th Saturday,
 * which is how a great many Indian workplaces run.
 *
 * The week number is `ceil(dayOfMonth / 7)` - a day-of-month bucket, not a
 * count of that weekday in the month. Kept from the reference on purpose, so
 * "2nd and 4th Saturday" keeps meaning to this clinic what it already means
 * elsewhere. The consequence worth knowing: days 29-31 fall in bucket 5, so
 * a 5th Saturday is never an alternate week-off.
 */
export function isWeekOff(date: Date, rows: WeekOffRow[] | null | undefined): boolean {
  const day = date.getDay();
  for (const row of rows ?? []) {
    if (row.day_of_week !== day || !row.is_off) continue;
    // Null means "every week". The reference's third copy forgets this and
    // silently treats such a day as a working day.
    const pattern = row.alternate_pattern || "all";
    if (pattern === "all") return true;
    const bucket = Math.ceil(date.getDate() / 7);
    if (pattern === "1st_3rd" && (bucket === 1 || bucket === 3)) return true;
    if (pattern === "2nd_4th" && (bucket === 2 || bucket === 4)) return true;
  }
  return false;
}

/** yyyy-mm-dd in the browser's own timezone, not UTC - `toISOString` would
 *  shift an Indian evening into the next day. */
export function localDateKey(date: Date): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p2(date.getMonth() + 1)}-${p2(date.getDate())}`;
}

/**
 * Why the clinic is closed on this date, or "" when it is an ordinary day.
 *
 * A holiday wins over a week-off: "Diwali" tells somebody more than "Week
 * off", and when both are true the holiday is the reason anybody remembers.
 *
 * This LABELS, it does not block. People work on days off - a doctor coming
 * in on a Sunday for one procedure still has to be able to record it, and
 * the reference does not block either.
 */
export function nonWorkingReason(
  date: Date,
  weekOffs: WeekOffRow[] | null | undefined,
  holidays: HolidayRow[] | null | undefined,
): string {
  const key = localDateKey(date);
  const holiday = (holidays ?? []).find((h) => String(h.date).slice(0, 10) === key);
  if (holiday) return holiday.name;
  return isWeekOff(date, weekOffs) ? "Week off" : "";
}
