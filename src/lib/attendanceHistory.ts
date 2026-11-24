import { hoursWorked, type AttendanceRow } from "@/lib/attendance";
import { localDateKey, nonWorkingReason, type HolidayRow, type WeekOffRow } from "@/lib/workingDays";

/**
 * A person's own attendance, read back over a day, a week or a month.
 *
 * /attendance showed today and nothing else, so there was no way for anybody
 * to answer "how many hours did I work last week" from inside the app. The
 * clinic asked for the day, the week and the month, with punch in, punch out
 * and the total.
 *
 * ── Why every date in the range gets a row ──
 *
 * The obvious shape is "list the attendance_records you have". That quietly
 * answers the wrong question: a week where somebody never clocked in on
 * Wednesday renders as six rows, and the missing day is invisible precisely
 * when it matters. Every date in the range gets a row, and a date with no
 * record says so - absent, or the reason the clinic was closed.
 *
 * Pure, so the arithmetic can be tested without a database, a clock or a
 * logged-in user. hoursWorked and nonWorkingReason are reused rather than
 * reimplemented: there are already three subtly different copies of the
 * week-off rule in the app this one follows, which is exactly the bug
 * src/lib/workingDays.ts exists to prevent.
 */

export type HistoryView = "day" | "week" | "month";

export interface HistoryRange {
  /** yyyy-mm-dd, inclusive. */
  from: string;
  to: string;
}

export interface HistoryRow {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  /** Null while a day is still running, or when nobody clocked in. */
  hours: number | null;
  /** "Week off", a holiday's name, or "" on an ordinary working day. */
  closed: string;
  /** Whether there is an attendance record at all for this date. */
  present: boolean;
}

export interface HistoryTotals {
  daysPresent: number;
  totalHours: number;
  /** Days with a check-in but no check-out - a punch somebody forgot. */
  daysOpen: number;
}

/** Midnight local, so arithmetic never drifts across a timezone offset. */
function atMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * The dates a view covers, anchored on a date inside it.
 *
 * Weeks run Monday to Sunday. getDay() calls Sunday 0, so Sunday has to be
 * pulled back six days rather than none - the off-by-one that would put a
 * Sunday's hours in the week that had not started yet.
 */
export function historyRange(view: HistoryView, anchor: Date): HistoryRange {
  const a = atMidnight(anchor);
  if (view === "day") return { from: localDateKey(a), to: localDateKey(a) };
  if (view === "week") {
    const back = (a.getDay() + 6) % 7;
    const from = new Date(a.getFullYear(), a.getMonth(), a.getDate() - back);
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6);
    return { from: localDateKey(from), to: localDateKey(to) };
  }
  const from = new Date(a.getFullYear(), a.getMonth(), 1);
  // Day 0 of the next month is the last day of this one, so February and the
  // 31-day months need no table and no leap-year rule.
  const to = new Date(a.getFullYear(), a.getMonth() + 1, 0);
  return { from: localDateKey(from), to: localDateKey(to) };
}

/** The same view one period earlier or later, for the back/forward buttons. */
export function shiftAnchor(view: HistoryView, anchor: Date, by: -1 | 1): Date {
  const a = atMidnight(anchor);
  if (view === "day") return new Date(a.getFullYear(), a.getMonth(), a.getDate() + by);
  if (view === "week") return new Date(a.getFullYear(), a.getMonth(), a.getDate() + by * 7);
  // Day 1 first: stepping back a month from the 31st would otherwise land in
  // the month before the one wanted, because there is no 31st of November.
  return new Date(a.getFullYear(), a.getMonth() + by, 1);
}

/** Every date in a range, inclusive, as yyyy-mm-dd. */
export function datesIn(range: HistoryRange): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = range.from.split("-").map(Number);
  const [ty, tm, td] = range.to.split("-").map(Number);
  const end = new Date(ty, tm - 1, td);
  const cursor = new Date(fy, fm - 1, fd);
  // A guard, not a limit anyone should hit: a malformed range must not spin.
  for (let i = 0; cursor <= end && i < 400; i++) {
    out.push(localDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** One row per date in the range, in date order, records matched onto it. */
export function historyRows(
  records: AttendanceRow[] | null | undefined,
  range: HistoryRange,
  weekOffs?: WeekOffRow[] | null,
  holidays?: HolidayRow[] | null,
): HistoryRow[] {
  const byDate = new Map<string, AttendanceRow>();
  for (const r of records ?? []) {
    const key = String((r as { date?: string }).date ?? "").slice(0, 10);
    if (key) byDate.set(key, r);
  }
  return datesIn(range).map((date) => {
    const row = byDate.get(date);
    const [y, m, d] = date.split("-").map(Number);
    return {
      date,
      checkIn: row?.check_in_time ?? null,
      checkOut: row?.check_out_time ?? null,
      hours: hoursWorked(row?.check_in_time, row?.check_out_time),
      closed: nonWorkingReason(new Date(y, m - 1, d), weekOffs, holidays),
      present: !!row?.check_in_time,
    };
  });
}

/**
 * What the period adds up to.
 *
 * A day still running counts as present and contributes no hours - it has
 * not finished, and guessing at "so far" in a monthly total would put a
 * number in front of somebody that quietly changes after lunch.
 */
export function historyTotals(rows: HistoryRow[]): HistoryTotals {
  let daysPresent = 0;
  let daysOpen = 0;
  let totalHours = 0;
  for (const r of rows) {
    if (!r.present) continue;
    daysPresent++;
    if (r.hours === null) daysOpen++;
    else totalHours += r.hours;
  }
  return { daysPresent, daysOpen, totalHours: Math.round(totalHours * 100) / 100 };
}

/** "7h 30m" from decimal hours, matching elapsedLabel's shape on the card. */
export function hoursLabel(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "—";
  const total = Math.max(0, Math.round(hours * 60));
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
}
