import { localDateKey } from "@/lib/workingDays";

/**
 * The window the All staff attendance list is showing.
 *
 * The screen had two date boxes and nothing else: to see today you typed
 * today's date twice, and to see one person you read past everybody else.
 * The clinic asked for a dropdown instead, and for a second one to pick a
 * person.
 *
 * Pure, so the arithmetic is testable without a clock or a database - and
 * every date is built through localDateKey rather than toISOString(), which
 * is UTC and names yesterday for anybody using the app after 18:30 IST. That
 * is the bug vitest.config.ts pins TZ: "Asia/Kolkata" to catch, and this
 * module is exactly the kind of place it bites.
 */

export type AttendancePeriod =
  | "all"
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "custom";

export interface DateRange {
  /** yyyy-mm-dd, inclusive at both ends. */
  from: string;
  to: string;
}

/** In the order the dropdown offers them. */
export const ATTENDANCE_PERIODS: { value: AttendancePeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

/** What the list opens on: the seven days it has always shown. */
export const DEFAULT_ATTENDANCE_PERIOD: AttendancePeriod = "last7";

/** Midnight local, so stepping back by days cannot drift across an offset. */
function atMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBefore(date: Date, days: number): Date {
  const out = atMidnight(date);
  out.setDate(out.getDate() - days);
  return out;
}

/**
 * The dates a period covers, or null when it covers everything.
 *
 * Null rather than a very wide range on purpose: the caller then applies no
 * date filter at all, instead of asking the database to compare every row
 * against a date chosen to be safely far in the past.
 *
 * "Last 7 days" counts back from today INCLUSIVE - today and the six before
 * it - which is what the two boxes defaulted to before this existed.
 */
export function periodRange(
  period: AttendancePeriod,
  today: Date = new Date(),
  custom?: Partial<DateRange>,
): DateRange | null {
  const now = atMidnight(today);
  switch (period) {
    case "all":
      return null;
    case "today":
      return { from: localDateKey(now), to: localDateKey(now) };
    case "yesterday": {
      const d = localDateKey(daysBefore(now, 1));
      return { from: d, to: d };
    }
    case "last7":
      return { from: localDateKey(daysBefore(now, 6)), to: localDateKey(now) };
    case "last30":
      return { from: localDateKey(daysBefore(now, 29)), to: localDateKey(now) };
    case "custom": {
      // A half-filled custom range is not a filter yet. Returning null while
      // one box is empty shows everything rather than silently clamping to
      // whichever end was typed first.
      const from = custom?.from?.trim();
      const to = custom?.to?.trim();
      if (!from || !to) return null;
      return from <= to ? { from, to } : { from: to, to: from };
    }
    default:
      return null;
  }
}

/** The label for a period, for anywhere that has to say which one is on. */
export function periodLabel(period: AttendancePeriod): string {
  return ATTENDANCE_PERIODS.find((p) => p.value === period)?.label ?? "All time";
}
