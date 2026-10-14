// Pure helpers for Journey Schedules. All times treated as IST (Asia/Kolkata, UTC+5:30).
// No DB / no UI imports here so the frontend and the Deno edge functions can share it.
// supabase/functions/_shared/comms-schedule.ts is a byte copy; keep them in sync (parity test).

export type ScheduleType = "one_time" | "recurring";
export type ScheduleFrequency = "daily" | "weekly" | "monthly" | "quarterly";

export interface JourneySchedule {
  id?: string;
  journey_id?: string;
  type: ScheduleType;
  frequency: ScheduleFrequency | null;
  execution_date: string | null; // YYYY-MM-DD
  execution_time: string | null; // HH:MM[:SS]
  days_of_week: number[] | null; // 0=Sun … 6=Sat
  day_of_month: number | null; // 1..31
  month_of_quarter: number | null; // 1..3 — 1=first month of quarter (Jan/Apr/Jul/Oct)
  timezone?: string;
  next_run_at?: string | null;
}

const IST_OFFSET_MIN = 330; // +05:30
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function pad(n: number) { return String(n).padStart(2, "0"); }

function parseHM(time: string | null): { h: number; m: number } {
  if (!time) return { h: 0, m: 0 };
  const [h, m] = time.split(":").map((v) => parseInt(v, 10));
  return { h: h || 0, m: m || 0 };
}

/** Convert an IST wall-clock date+time to a UTC Date instance. */
function istToUtc(year: number, month0: number, day: number, h: number, m: number): Date {
  // The UTC equivalent is IST - 5:30
  return new Date(Date.UTC(year, month0, day, h, m) - IST_OFFSET_MIN * 60_000);
}

/** Get IST wall-clock parts (year, month0, day, hour, minute, dow) from a Date. */
function istParts(d: Date) {
  const ist = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return {
    year: ist.getUTCFullYear(),
    month0: ist.getUTCMonth(),
    day: ist.getUTCDate(),
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
    dow: ist.getUTCDay(),
  };
}

function daysInMonth(year: number, month0: number) {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function clampDay(year: number, month0: number, day: number) {
  return Math.min(day, daysInMonth(year, month0));
}

function format12h(h: number, m: number) {
  const period = h >= 12 ? "PM" : "AM";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${pad(m)} ${period}`;
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const QUARTER_MONTHS_LABEL = ["Jan/Apr/Jul/Oct", "Feb/May/Aug/Nov", "Mar/Jun/Sep/Dec"];

export function summarizeSchedule(s: JourneySchedule | null | undefined): string {
  if (!s) return "";
  const { h, m } = parseHM(s.execution_time);
  const timeStr = `${format12h(h, m)} IST`;

  if (s.type === "one_time") {
    if (!s.execution_date) return "One-time schedule";
    const [y, mo, d] = s.execution_date.split("-").map((v) => parseInt(v, 10));
    const dateLabel = `${d} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][mo - 1]} ${y}`;
    return `Runs on ${dateLabel} at ${timeStr}`;
  }

  switch (s.frequency) {
    case "daily":
      return `Runs daily at ${timeStr}`;
    case "weekly": {
      const days = (s.days_of_week || []).slice().sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(", ");
      return `Runs every ${days || "—"} at ${timeStr}`;
    }
    case "monthly":
      return `Runs on the ${ordinal(s.day_of_month || 1)} of every month at ${timeStr}`;
    case "quarterly": {
      const moq = s.month_of_quarter || 1;
      return `Runs on the ${ordinal(s.day_of_month || 1)} of ${QUARTER_MONTHS_LABEL[moq - 1]} at ${timeStr}`;
    }
    default:
      return "Recurring schedule";
  }
}

/** Compute next run as a UTC Date based on IST wall clock. Returns null if invalid. */
export function computeNextRun(s: JourneySchedule | null | undefined, fromDate: Date = new Date()): Date | null {
  if (!s || !s.execution_time) return null;
  const { h, m } = parseHM(s.execution_time);

  if (s.type === "one_time") {
    if (!s.execution_date) return null;
    const [y, mo, d] = s.execution_date.split("-").map((v) => parseInt(v, 10));
    const dt = istToUtc(y, mo - 1, d, h, m);
    return dt >= fromDate ? dt : dt; // return regardless; scheduler will skip past
  }

  const nowIst = istParts(fromDate);

  switch (s.frequency) {
    case "daily": {
      let candidate = istToUtc(nowIst.year, nowIst.month0, nowIst.day, h, m);
      if (candidate <= fromDate) {
        candidate = istToUtc(nowIst.year, nowIst.month0, nowIst.day + 1, h, m);
      }
      return candidate;
    }
    case "weekly": {
      const days = (s.days_of_week || []).slice().sort((a, b) => a - b);
      if (days.length === 0) return null;
      for (let offset = 0; offset < 14; offset++) {
        const probe = new Date(Date.UTC(nowIst.year, nowIst.month0, nowIst.day + offset));
        const probeIst = istParts(probe);
        if (!days.includes(probeIst.dow)) continue;
        const candidate = istToUtc(probeIst.year, probeIst.month0, probeIst.day, h, m);
        if (candidate > fromDate) return candidate;
      }
      return null;
    }
    case "monthly": {
      const dom = s.day_of_month || 1;
      for (let offset = 0; offset < 13; offset++) {
        const month0 = nowIst.month0 + offset;
        const year = nowIst.year + Math.floor(month0 / 12);
        const m0 = ((month0 % 12) + 12) % 12;
        const day = clampDay(year, m0, dom);
        const candidate = istToUtc(year, m0, day, h, m);
        if (candidate > fromDate) return candidate;
      }
      return null;
    }
    case "quarterly": {
      const dom = s.day_of_month || 1;
      const moq = (s.month_of_quarter || 1) - 1; // 0..2
      // valid months: moq, moq+3, moq+6, moq+9
      for (let offset = 0; offset < 24; offset++) {
        const month0 = nowIst.month0 + offset;
        const year = nowIst.year + Math.floor(month0 / 12);
        const m0 = ((month0 % 12) + 12) % 12;
        if (m0 % 3 !== moq) continue;
        const day = clampDay(year, m0, dom);
        const candidate = istToUtc(year, m0, day, h, m);
        if (candidate > fromDate) return candidate;
      }
      return null;
    }
    default:
      return null;
  }
}

/** Format a UTC Date as IST wall-clock human string. */
export function formatIst(d: Date | null): string {
  if (!d) return "—";
  const p = istParts(d);
  const monthLabel = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][p.month0];
  return `${p.day} ${monthLabel} ${p.year}, ${format12h(p.hour, p.minute)} IST`;
}

/** Expand a schedule into calendar events between range. */
export interface ScheduleEvent { journey_id: string; title: string; start: Date; end: Date; }

export function expandToCalendarEvents(
  s: JourneySchedule,
  rangeStart: Date,
  rangeEnd: Date,
  title = "Journey run"
): ScheduleEvent[] {
  const out: ScheduleEvent[] = [];
  if (!s.journey_id || !s.execution_time) return out;

  if (s.type === "one_time") {
    const next = computeNextRun(s, new Date(0));
    if (next && next >= rangeStart && next <= rangeEnd) {
      out.push({ journey_id: s.journey_id, title, start: next, end: new Date(next.getTime() + 60_000) });
    }
    return out;
  }

  let cursor = new Date(rangeStart.getTime() - 1);
  for (let i = 0; i < 500; i++) {
    const next = computeNextRun(s, cursor);
    if (!next || next > rangeEnd) break;
    out.push({ journey_id: s.journey_id, title, start: next, end: new Date(next.getTime() + 60_000) });
    cursor = next;
  }
  return out;
}

export const WEEKDAY_SHORT = DAY_NAMES;
export const WEEKDAY_LONG = DAY_NAMES_LONG;
