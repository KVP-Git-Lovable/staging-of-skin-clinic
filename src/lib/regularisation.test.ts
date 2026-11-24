import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  canDecide, correctionsLeft, correctionsNote, correctionsUsedIn, monthKeyOf,
  regularisationAsk, regularisationProblem, regularisationTimestamp,
} from "./regularisation";

/**
 * Asking for a forgotten punch to be put right, and telling somebody it was
 * asked for.
 *
 * Neither existed. There was no way to request a correction and no screen to
 * make one from - the only correction in this repo's history was done by
 * hand in SQL. And leave applications have existed since March with nothing
 * ever telling anybody one had arrived.
 */

const NOW = new Date("2026-11-14T12:00:00");
const ok = { date: "2026-11-10", checkIn: "09:30", checkOut: "18:15", reason: "Forgot to press End My Day" };

describe("regularisationProblem", () => {
  it("accepts a complete request", () => {
    expect(regularisationProblem(ok, NOW)).toBeNull();
  });

  it("accepts one end alone", () => {
    // The common case by far: somebody clocked in and forgot to clock out.
    expect(regularisationProblem({ ...ok, checkIn: "" }, NOW)).toBeNull();
    expect(regularisationProblem({ ...ok, checkOut: "" }, NOW)).toBeNull();
  });

  it("refuses a request that asks for nothing", () => {
    expect(regularisationProblem({ ...ok, checkIn: "", checkOut: "" }, NOW))
      .toMatch(/started, the time you ended, or both/i);
  });

  it("refuses an end before the start", () => {
    expect(regularisationProblem({ ...ok, checkIn: "18:00", checkOut: "09:00" }, NOW))
      .toMatch(/after the start/i);
    // Equal is not after.
    expect(regularisationProblem({ ...ok, checkIn: "09:00", checkOut: "09:00" }, NOW)).not.toBeNull();
  });

  it("allows TODAY, because somebody who forgot this morning should not wait", () => {
    expect(regularisationProblem({ ...ok, date: "2026-11-14" }, NOW)).toBeNull();
  });

  it("refuses a day that has not happened", () => {
    expect(regularisationProblem({ ...ok, date: "2026-11-15" }, NOW))
      .toMatch(/has not happened yet/i);
  });

  it("refuses a missing or unreadable day", () => {
    expect(regularisationProblem({ ...ok, date: "" }, NOW)).toMatch(/Pick the day/i);
    expect(regularisationProblem({ ...ok, date: "not-a-date" }, NOW)).toMatch(/Pick the day/i);
  });

  it("insists on a reason, because the approver has only that", () => {
    expect(regularisationProblem({ ...ok, reason: "   " }, NOW)).toMatch(/Say why/i);
  });

  it("reports the FIRST problem, not a list", () => {
    // The form shows one line, and people fix one thing at a time.
    expect(regularisationProblem({ date: "", checkIn: "", checkOut: "", reason: "" }, NOW))
      .toMatch(/Pick the day/i);
  });
});

describe("regularisationTimestamp", () => {
  it("builds the time on that day in the clinic's own timezone", () => {
    // Not `new Date("2026-11-10T18:15")` as a string: a clinic in IST has to
    // record 6:15pm IST, which is the reason localDateKey exists too.
    const iso = regularisationTimestamp("2026-11-10", "18:15")!;
    const back = new Date(iso);
    expect(back.getFullYear()).toBe(2026);
    expect(back.getMonth()).toBe(10);
    expect(back.getDate()).toBe(10);
    expect(back.getHours()).toBe(18);
    expect(back.getMinutes()).toBe(15);
  });

  it("is null for an end that was left blank", () => {
    expect(regularisationTimestamp("2026-11-10", "")).toBeNull();
    expect(regularisationTimestamp("2026-11-10", "   ")).toBeNull();
  });

  it("is null rather than an Invalid Date when the day is junk", () => {
    expect(regularisationTimestamp("", "18:15")).toBeNull();
    expect(regularisationTimestamp("2026-11-10", "nonsense")).toBeNull();
  });
});

describe("regularisationAsk", () => {
  const at = (h: number, m: number) => new Date(2026, 10, 10, h, m).toISOString();

  it("reads as a range when both ends were asked for", () => {
    expect(regularisationAsk({ requested_check_in: at(9, 30), requested_check_out: at(18, 15) }))
      .toMatch(/–/);
  });

  it("names which end when only one was", () => {
    expect(regularisationAsk({ requested_check_out: at(18, 15) })).toMatch(/^End /);
    expect(regularisationAsk({ requested_check_in: at(9, 30) })).toMatch(/^Start /);
  });

  it("says nothing rather than Invalid Date", () => {
    expect(regularisationAsk({})).toBe("—");
    expect(regularisationAsk({ requested_check_in: "rubbish" })).toBe("—");
  });
});

describe("canDecide", () => {
  it("is true only while a request is pending", () => {
    expect(canDecide("Pending")).toBe(true);
    for (const s of ["Approved", "Rejected", "", null, undefined]) {
      expect(canDecide(s), String(s)).toBe(false);
    }
  });
});

describe("the screens", () => {
  const page = () => readFileSync("src/pages/LeaveManagement.tsx", "utf8").replace(/^\s*\/\/.*$/gm, "");

  it("gives everybody a place to ask, and admins a place to decide", () => {
    const src = page();
    expect(src).toContain('<TabsTrigger value="my-regularisations">');
    expect(src).toContain('<TabsContent value="my-regularisations">');
    expect(src).toMatch(/\{canAdminLeave && \(<>[\s\S]{0,400}<TabsContent value="regularisations">/);
  });

  it("shows my own corrections on my tab, not the clinic's", () => {
    expect(page()).toMatch(/myRegularisations = \(regularisations[\s\S]{0,100}\.filter\(\(r\) => r\.staff_id === myStaffId\)/);
  });

  it("asks the shared rule before sending", () => {
    expect(page()).toContain("const problem = regularisationProblem({ date: regDate, checkIn: regIn, checkOut: regOut, reason: regReason });");
    expect(page()).toContain("if (problem) throw new Error(problem);");
  });

  it("sends the times as timestamps on that day", () => {
    const src = page();
    expect(src).toContain("requested_check_in: regularisationTimestamp(regDate, regIn)");
    expect(src).toContain("requested_check_out: regularisationTimestamp(regDate, regOut)");
  });

  it("records who decided, and only offers it while pending", () => {
    const src = page();
    expect(src).toMatch(/\.update\(\{ status, decided_by: myStaffId \|\| null, decided_at: new Date\(\)\.toISOString\(\) \}\)/);
    // Two conditions now: pending, AND the person is one of the named
    // approvers. Being an admin is no longer enough to answer a request.
    expect(src).toMatch(/\{canDecide\(r\.status\) && mayDecide && \(/);
  });

  it("does NOT write the attendance record from the browser", () => {
    // That is the trigger's job. The leave page's own approval is two client
    // writes that are not a transaction, and its balance half silently did
    // nothing for months; the same bug here would be somebody's pay.
    const src = page();
    const at = src.indexOf("const decideRegularisation");
    const body = src.slice(at, at + 1400);
    expect(body).not.toContain("attendance_records");
  });

  it("opens on the tab a notification points at", () => {
    // Still the bell's deep link - /leave?tab=regularisations - but read
    // through LEAVE_TABS now, because ?tab=types and ?tab=balances used to
    // land here and would otherwise select a tab that no longer exists.
    const src = page();
    expect(src).toContain('const askedForTab = searchParams.get("tab");');
    expect(src).toContain('LEAVE_TABS.includes(askedForTab ?? "") ? askedForTab : null');
    expect(src).toContain('value={tab ?? linkedTab ?? (canAdminLeave ? "applications" : "mine")}');
    expect(src).toContain('"regularisations"');
  });
});

describe("the migration", () => {
  const sql = () =>
    readFileSync("supabase/migrations/20261114060000_a_punch_somebody_forgot.sql", "utf8")
      .replace(/^\s*--.*$/gm, "");

  it("refuses a request that asks for nothing, in the database too", () => {
    // The form says so; this makes it true.
    expect(sql()).toMatch(/attendance_regularisations_wants_something\s*\n?\s*check \(requested_check_in is not null or requested_check_out is not null\)/);
  });

  it("refuses an end before the start", () => {
    expect(sql()).toContain("requested_check_out > requested_check_in");
  });

  it("limits the status to the three it can be", () => {
    expect(sql()).toMatch(/check \(status in \('Pending', 'Approved', 'Rejected'\)\)/);
  });

  it("carries the staff guard AGENTS.md requires on a new table", () => {
    expect(sql()).toMatch(/create policy signed_in_must_be_staff[\s\S]{0,200}is_active_staff/);
  });

  it("lets you ask only for your own days, and only admins decide", () => {
    const src = sql();
    expect(src).toMatch(/for insert to authenticated\s*\n\s*with check \(staff_id = \(select public\.current_staff_id\(\)\)\)/);
    expect(src).toMatch(/"Only admins decide a regularisation"[\s\S]{0,200}using \(\(select public\.is_admin_user\(\)\)\)/);
  });

  it("tells the people the clinic named, and not the person who asked", () => {
    const src = sql();
    expect(src).toContain("where s.approves_requests");
    expect(src).toContain("and s.id is distinct from new.staff_id");
    expect(src).toMatch(/drvindhyapai@gmail\.com', 'suyog\.h@kvpcorp\.com/);
  });

  it("notifies on a leave application as well as a correction", () => {
    const src = sql();
    expect(src).toMatch(/after insert on public\.leave_applications\s*\n\s*for each row execute function public\.notify_request_approvers\(\)/);
    expect(src).toMatch(/after insert on public\.attendance_regularisations\s*\n\s*for each row execute function public\.notify_request_approvers\(\)/);
  });

  it("tells the person who asked, once the answer is in", () => {
    const src = sql();
    expect(src).toContain("create or replace function public.notify_requester_of_decision()");
    // Only on a real change of answer: an unrelated update must not
    // re-announce a decision somebody already read.
    expect(src).toMatch(/if new\.status is not distinct from old\.status then\s*\n\s*return new;/);
  });

  it("writes the corrected day on approval, keeping the end that was right", () => {
    const src = sql();
    expect(src).toMatch(/on conflict \(staff_id, date\) do update/);
    expect(src).toContain("check_in_time  = coalesce(excluded.check_in_time, attendance_records.check_in_time)");
    expect(src).toContain("check_out_time = coalesce(excluded.check_out_time, attendance_records.check_out_time)");
  });

  it("does nothing on an update that was not an approval", () => {
    expect(sql()).toMatch(/if new\.status is not distinct from old\.status or new\.status <> 'Approved' then\s*\n\s*return new;/);
  });

  it("adds a column with a default and renames nothing", () => {
    const src = sql();
    expect(src).toContain("add column if not exists approves_requests boolean not null default false");
    expect(src).not.toMatch(/drop column/i);
    expect(src).not.toMatch(/rename/i);
  });
});

/**
 * The monthly cap.
 *
 * The clinic asked where to configure how many corrections somebody may ask
 * for. The database trigger is what enforces it; these let the dialog say
 * how many are left before somebody writes a reason and presses send, and
 * they have to count rows the same way the trigger does or the form will
 * promise what the database then refuses.
 */
describe("the monthly cap on corrections", () => {
  const rows = [
    { date: "2026-11-02", status: "Approved" },
    { date: "2026-11-20", status: "Pending" },
    { date: "2026-11-25", status: "Rejected" },
    { date: "2026-10-30", status: "Approved" },
  ];

  it("reads a month off a date or a yyyy-mm-dd", () => {
    expect(monthKeyOf("2026-11-25")).toBe("2026-11");
    expect(monthKeyOf(new Date("2026-01-05T12:00:00"))).toBe("2026-01");
    expect(monthKeyOf("")).toBe("");
    expect(monthKeyOf(null)).toBe("");
    expect(monthKeyOf(new Date("nonsense"))).toBe("");
  });

  it("counts the month being corrected, not the month of asking", () => {
    // Somebody tidying up a 30 October punch on 2 November spends October's
    // allowance - which is what date_trunc('month', r.date) does in the
    // trigger.
    expect(correctionsUsedIn(rows, "2026-11-20")).toBe(2);
    expect(correctionsUsedIn(rows, "2026-10-30")).toBe(1);
    expect(correctionsUsedIn(rows, "2026-09-01")).toBe(0);
  });

  it("does not count a rejected request", () => {
    // Refusing somebody their only correction of the month because an
    // earlier one was turned down would punish them for the decision.
    expect(correctionsUsedIn([{ date: "2026-11-01", status: "Rejected" }], "2026-11-05")).toBe(0);
  });

  it("treats 0 and a missing limit as no cap at all", () => {
    expect(correctionsLeft(0, 5)).toBeNull();
    expect(correctionsLeft(null, 5)).toBeNull();
    expect(correctionsNote(0, 5)).toBeNull();
  });

  it("never reports a negative remainder", () => {
    expect(correctionsLeft(2, 5)).toBe(0);
  });

  it("says how many are left", () => {
    expect(correctionsNote(3, 1)).toMatch(/2 of 3 correction\(s\) left this month/);
    expect(correctionsNote(3, 3)).toMatch(/used all 3 correction\(s\) allowed this month/);
  });
});

describe("the correction dialog", () => {
  const page = () =>
    readFileSync("src/pages/LeaveManagement.tsx", "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

  it("shows how many corrections are left", () => {
    expect(page()).toMatch(/data-testid="corrections-left"/);
  });

  it("counts against the day being corrected, falling back to today", () => {
    expect(page()).toMatch(/correctionsUsedIn\(myRegularisations, regDate \|\| new Date\(\)\)/);
  });

  it("stops Send once the cap is reached", () => {
    // Without this the person fills the form in, presses send and gets a
    // raw policy error from the trigger.
    const src = page();
    expect(src).toMatch(/disabled=\{askForCorrection\.isPending \|\| capReached\}/);
    expect(src).toMatch(/correctionsUsedThisMonth >= Number\(attendanceConfig\.regularisation_monthly_limit\)/);
  });
});
