import {
  startOfDay, endOfDay, subDays, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter,
  startOfYear, endOfYear, subYears,
} from "date-fns";

/** Same period choices as the Dr. 360 dashboard, reused by every standard report. */
export const REPORT_DATE_RANGE_OPTIONS = [
  { key: "all", label: "All Time" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last_7", label: "Last 7 Days" },
  { key: "this_week", label: "This Week" },
  { key: "last_week", label: "Last Week" },
  { key: "this_month", label: "Current Month" },
  { key: "last_month", label: "Last Month" },
  { key: "this_quarter", label: "Current Quarter" },
  { key: "last_quarter", label: "Last Quarter" },
  { key: "this_year", label: "Current Year" },
  { key: "last_year", label: "Last Year" },
  { key: "custom", label: "Custom Date Range" },
];

export const DEFAULT_REPORT_PRESET = "this_month";

/** Resolve a preset key into a concrete range. `all` means "no date bounds". */
export function getReportDateRange(
  key: string,
  customStart?: string,
  customEnd?: string,
): { start?: Date; end?: Date } {
  const now = new Date();
  switch (key) {
    case "all":
      return {};
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "yesterday": {
      const d = subDays(now, 1);
      return { start: startOfDay(d), end: endOfDay(d) };
    }
    case "last_7":
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
    case "this_week":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfDay(now) };
    case "last_week": {
      const s = startOfWeek(subDays(now, 7), { weekStartsOn: 1 });
      return { start: s, end: endOfWeek(s, { weekStartsOn: 1 }) };
    }
    case "last_month": {
      const m = subMonths(now, 1);
      return { start: startOfMonth(m), end: endOfMonth(m) };
    }
    case "this_quarter":
      return { start: startOfQuarter(now), end: endOfDay(now) };
    case "last_quarter": {
      const q = subMonths(startOfQuarter(now), 1);
      return { start: startOfQuarter(q), end: endOfQuarter(q) };
    }
    case "this_year":
      return { start: startOfYear(now), end: endOfDay(now) };
    case "last_year": {
      const y = subYears(now, 1);
      return { start: startOfYear(y), end: endOfYear(y) };
    }
    case "custom": {
      const s = customStart ? startOfDay(new Date(customStart)) : startOfMonth(now);
      const e = customEnd ? endOfDay(new Date(customEnd)) : endOfDay(now);
      return { start: s, end: e < s ? endOfDay(s) : e };
    }
    case "this_month":
    default:
      return { start: startOfMonth(now), end: endOfDay(now) };
  }
}

export interface ReportPin {
  preset: string;
  customStart?: string;
  customEnd?: string;
  doctor?: string;
  service?: string;
}

const PIN_KEY = "report-filters-pin-v1";

export function loadReportPin(): ReportPin | null {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as ReportPin;
    return p && typeof p === "object" && p.preset ? p : null;
  } catch {
    return null;
  }
}

export function saveReportPin(p: ReportPin) {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function clearReportPin() {
  try {
    localStorage.removeItem(PIN_KEY);
  } catch {
    /* ignore */
  }
}
