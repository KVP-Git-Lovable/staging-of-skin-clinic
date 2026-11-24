/**
 * Asking for a forgotten punch to be put right.
 *
 * Somebody forgets to press End My Day. The record sits open for ever, the
 * month's hours are short, and until now there was no way to ask for it to
 * be fixed and no screen for an admin to fix it from - the only correction
 * in this repo's history was made by hand in SQL.
 *
 * The decisions live here rather than in the form so they can be tested
 * without a database, and so the same answer is given whether the request
 * comes from the dialog, a keyboard-pasted date or a future paste of this
 * code somewhere else. The database carries the same three rules as CHECK
 * constraints, which is what makes them true rather than merely asked for.
 */

export const REGULARISATION_STATUSES = ["Pending", "Approved", "Rejected"] as const;
export type RegularisationStatus = (typeof REGULARISATION_STATUSES)[number];

export interface RegularisationDraft {
  /** yyyy-mm-dd, the day being corrected. */
  date: string;
  /** "HH:MM", or "" for "leave this end alone". */
  checkIn: string;
  checkOut: string;
  reason: string;
}

/**
 * What is wrong with this request, or null when nothing is.
 *
 * Returns the FIRST problem rather than a list: the form shows one line, and
 * a person fixing one thing at a time is the normal case.
 */
export function regularisationProblem(
  draft: RegularisationDraft,
  now: Date = new Date(),
): string | null {
  const date = String(draft.date ?? "").trim();
  if (!date) return "Pick the day you want corrected.";

  const day = new Date(`${date}T00:00:00`);
  if (Number.isNaN(day.getTime())) return "Pick the day you want corrected.";

  // Today is allowed - somebody who forgot to clock in this morning should
  // not have to wait until tomorrow to say so. Tomorrow is not.
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (day.getTime() > endOfToday.getTime()) {
    return "You cannot correct a day that has not happened yet.";
  }

  const checkIn = String(draft.checkIn ?? "").trim();
  const checkOut = String(draft.checkOut ?? "").trim();
  if (!checkIn && !checkOut) {
    return "Give the time you started, the time you ended, or both.";
  }
  if (checkIn && checkOut && checkOut <= checkIn) {
    return "The end time has to be after the start time.";
  }

  if (!String(draft.reason ?? "").trim()) {
    return "Say why it needs correcting - whoever approves it only has this.";
  }
  return null;
}

/**
 * A "HH:MM" on a given day, as an ISO timestamp, or null when the time was
 * left blank.
 *
 * Built from the local parts rather than parsing "2026-11-10T18:15" as a
 * string, so a clinic in IST records 6:15pm IST and not 6:15pm UTC - the
 * same reason localDateKey exists in workingDays.ts.
 */
export function regularisationTimestamp(date: string, time: string): string | null {
  const t = String(time ?? "").trim();
  if (!t) return null;
  const [y, m, d] = String(date ?? "").split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const at = new Date(y, m - 1, d, hh, mm, 0, 0);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** What the request is asking for, in words, for a list somebody scans. */
export function regularisationAsk(row: {
  requested_check_in?: string | null;
  requested_check_out?: string | null;
}): string {
  const fmt = (v?: string | null) => {
    if (!v) return "";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  };
  const start = fmt(row.requested_check_in);
  const end = fmt(row.requested_check_out);
  if (start && end) return `${start} – ${end}`;
  if (start) return `Start ${start}`;
  if (end) return `End ${end}`;
  return "—";
}

/** Only a pending request can be decided; the screens hide the buttons otherwise. */
export function canDecide(status: string | null | undefined): boolean {
  return String(status ?? "").trim() === "Pending";
}

/**
 * The monthly cap on corrections.
 *
 * attendance_config.regularisation_monthly_limit, 0 meaning no cap, which is
 * what the clinic runs today. The database enforces it in a BEFORE INSERT
 * trigger - that is what makes it true. These three exist so the dialog can
 * say how many are left BEFORE somebody writes a reason and presses send,
 * and they count rows the same way the trigger does.
 *
 * A rejected request does not count. Refusing somebody their only correction
 * of the month because an earlier one was turned down would punish them for
 * the admin's decision.
 */

/** "yyyy-mm" for a date or a yyyy-mm-dd string, in local terms. */
export function monthKeyOf(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  }
  const m = /^(\d{4})-(\d{2})/.exec(String(value).trim());
  return m ? `${m[1]}-${m[2]}` : "";
}

/** How many of these rows count against the cap for the month of `monthOf`. */
export function correctionsUsedIn(
  rows: { date?: string | null; status?: string | null }[],
  monthOf: string | Date,
): number {
  const want = monthKeyOf(monthOf);
  if (!want) return 0;
  return (rows ?? []).filter(
    (r) => monthKeyOf(r.date) === want && String(r.status ?? "").trim() !== "Rejected",
  ).length;
}

/** Corrections still allowed this month, or null when nothing caps them. */
export function correctionsLeft(
  limit: number | string | null | undefined,
  used: number,
): number | null {
  const cap = Number(limit ?? 0);
  if (!Number.isFinite(cap) || cap <= 0) return null;
  return Math.max(0, cap - (Number(used) || 0));
}

/** The line the dialog shows above the form, or null when there is no cap. */
export function correctionsNote(
  limit: number | string | null | undefined,
  used: number,
): string | null {
  const left = correctionsLeft(limit, used);
  if (left === null) return null;
  const cap = Number(limit);
  if (left === 0) return `You have used all ${cap} correction(s) allowed this month.`;
  return `${left} of ${cap} correction(s) left this month.`;
}
