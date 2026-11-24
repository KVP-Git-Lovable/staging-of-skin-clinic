import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MODULE_KEYS } from "./modules";

/**
 * Applying for your own leave, and reading back your own attendance.
 *
 * Both pages were built when only admins and doctors could sign in. The
 * Leave page was one admin console - every form made you pick a staff
 * member from a dropdown of the whole clinic - and /attendance showed today
 * and nothing else. Therapists, nurses and receptionists are about to get
 * logins, and neither page answered the question they will ask.
 *
 * The row-level policies from 20261113060000 already stop a non-admin
 * reading or approving anybody else's leave. What these hold is the other
 * half: that the screen does not OFFER what the database would refuse, and
 * that the admin's own flows survive the split.
 */

const LEAVE = () => readFileSync("src/pages/LeaveManagement.tsx", "utf8").replace(/^\s*\/\/.*$/gm, "");
const PAGE = () => readFileSync("src/pages/Attendance.tsx", "utf8");
/** Comments stripped: the card's own header explains why it does NOT mount
 *  useMyAttendanceDay, and a plain search would find that sentence. */
const CARD = () =>
  readFileSync("src/components/attendance/MyDayCard.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const MIGRATION = "supabase/migrations/20261113120000_apply_for_your_own_leave.sql";
const sql = () => readFileSync(MIGRATION, "utf8").replace(/^\s*--.*$/gm, "");

describe("the Leave page knows who is looking at it", () => {
  it("asks the shared decision, not its own role check", () => {
    const src = LEAVE();
    expect(src).toContain('canViewModule({ isAdmin, permissions, moduleKey: "leave_admin" })');
    expect(src).toContain('from "@/hooks/useAuth"');
  });

  it("gives everybody a My Leave tab", () => {
    const src = LEAVE();
    expect(src).toContain('<TabsTrigger value="mine">');
    expect(src).toContain('<TabsContent value="mine">');
  });

  it("shows the admin tabs only to somebody who can administer leave", () => {
    // Rendered, not merely hidden: leaving a tab mounted puts its dialogs in
    // a therapist's DOM.
    //
    // Two tabs, not four. Leave Types and Balances are configuration and
    // moved to Admin > Attendance > Policy; what is left here is answering
    // what somebody asked for.
    //
    // Checked by slicing the guarded block rather than by distance from the
    // guard: a tab added inside it later pushes the others past any fixed
    // window, and the test would start failing for the wrong reason.
    const src = LEAVE();
    const guard = src.indexOf("{canAdminLeave && (<>");
    expect(guard, "the admin tabs are no longer guarded").toBeGreaterThan(-1);
    const inside = src.slice(guard, src.indexOf("</>)}", guard));
    for (const v of ["applications", "regularisations"]) {
      expect(inside, `the ${v} tab is outside the admin guard`).toContain(`<TabsContent value="${v}">`);
    }

    const trigGuard = src.indexOf("{canAdminLeave && <>");
    expect(trigGuard, "the admin tab buttons are no longer guarded").toBeGreaterThan(-1);
    const triggers = src.slice(trigGuard, src.indexOf("</>}", trigGuard));
    for (const v of ["applications", "regularisations"]) {
      expect(triggers, `the ${v} tab button is outside the admin guard`).toContain(`<TabsTrigger value="${v}"`);
    }

    // And the two that moved are not here under any guard at all.
    for (const v of ["balances", "types"]) {
      expect(src, `the ${v} tab is still on this page`).not.toContain(`value="${v}"`);
    }

    // And the two everybody gets are OUTSIDE both guards.
    for (const v of ["mine", "my-regularisations"]) {
      expect(inside, `${v} must not be admin-only`).not.toContain(`<TabsContent value="${v}">`);
    }
  });

  it("lands an admin where it always did, and everyone else on their own leave", () => {
    // linkedTab sits between them so a bell notification can open the page
    // on the request it is about; without a link in the URL nothing changes.
    expect(LEAVE()).toContain('value={tab ?? linkedTab ?? (canAdminLeave ? "applications" : "mine")}');
  });

  it("shows my own rows on My Leave, not the whole clinic's", () => {
    // An admin's queries return everybody, so the filter is what makes
    // their My Leave tab theirs.
    const src = LEAVE();
    expect(src).toMatch(/myApplications = \(applications[\s\S]{0,80}\.filter\(\(a\) => a\.staff_id === myStaffId\)/);
    expect(src).toMatch(/myBalances = \(balances[\s\S]{0,80}\.filter\(\(b\) => b\.staff_id === myStaffId\)/);
  });
});

describe("applying for leave", () => {
  it("fills in the signed-in person rather than asking who they are", () => {
    const src = LEAVE();
    expect(src).toContain("const staffId = canAdminLeave ? appStaffId : myStaffId;");
    expect(src).toContain('data-testid="applying-as"');
  });

  it("keeps the staff dropdown for an admin applying on somebody's behalf", () => {
    // The flow the page has always offered, and the insert policy still
    // allows it. Removing it would break the live clinic.
    expect(LEAVE()).toMatch(/\{canAdminLeave \? \([\s\S]{0,400}<Label>Staff Member \*<\/Label>/);
  });

  it("refuses to submit with no staff record behind the login", () => {
    expect(LEAVE()).toContain('throw new Error("No staff record is linked to this login")');
  });
});

describe("the three bugs in the approval path", () => {
  it("records WHO approved, which the column was never given", () => {
    const src = LEAVE();
    expect(src).toMatch(/status: "Approved", approved_by: myStaffId \|\| null/);
    expect(src).toMatch(/status: "Rejected", approved_by: myStaffId \|\| null/);
  });

  it("creates the balance row instead of silently deducting nothing", () => {
    // `if (bal)` and nothing else: approving leave for somebody with no
    // balance row succeeded, said "balance adjusted", and deducted nothing.
    const src = LEAVE();
    expect(src).toMatch(/\} else \{[\s\S]{0,600}from\("staff_leave_balances"\)\.insert\(\{/);
    expect(src).toMatch(/used: Number\(app\.days\)/);
  });

  it("invalidates two keys, not one array holding both", () => {
    // ["leave-applications", "leave-balances"] is a single composite key
    // matching no query, so the Balances tab never refreshed.
    const src = LEAVE();
    expect(src).not.toMatch(/queryKey: \["leave-applications", "leave-balances"\]/);
    expect(src).toContain('invalidateQueries({ queryKey: ["leave-applications"] })');
    expect(src).toContain('invalidateQueries({ queryKey: ["leave-balances"] })');
  });
});

describe("my own attendance history", () => {
  it("is on the page, under the day card", () => {
    const src = PAGE();
    expect(src).toContain("<MyAttendanceHistory />");
    const card = src.indexOf("data-testid=\"start-my-day\"");
    expect(card).toBeGreaterThan(-1);
    expect(src.indexOf("<MyAttendanceHistory />")).toBeGreaterThan(card);
  });

  it("leaves the page able to mark the day, which is now the ONLY place that can", () => {
    // The dashboard card links here. If this page stopped marking, nothing
    // in the app would mark attendance at all.
    const src = PAGE();
    expect(src).toContain('press("check_in")');
    expect(src).toContain('press("check_out")');
    expect(src).toContain("<CameraDialog {...cameraProps} />");
  });

  it("reads only the signed-in person's own rows", () => {
    const hist = readFileSync("src/components/attendance/MyAttendanceHistory.tsx", "utf8");
    expect(hist).toContain('.eq("staff_id", staffId!)');
    expect(hist).toContain('.gte("date", range.from)');
    expect(hist).toContain('.lte("date", range.to)');
  });

  it("offers the day, the week and the month the clinic asked for", () => {
    const hist = readFileSync("src/components/attendance/MyAttendanceHistory.tsx", "utf8");
    for (const v of ["day", "week", "month"]) expect(hist).toContain(`key: "${v}"`);
    expect(hist).toContain("shiftAnchor");
  });
});

describe("the dashboard card", () => {
  it("no longer mounts the acting hook", () => {
    const src = CARD();
    expect(src).toContain("useMyAttendanceToday");
    expect(src).not.toContain("useMyAttendanceDay");
    expect(src).not.toContain("CameraDialog");
  });
});

describe("the migration", () => {
  it("grants only keys the registry knows", () => {
    for (const key of ["leave", "leave_admin"]) {
      expect(sql(), `${key} is not back-filled`).toContain(`'${key}'`);
      expect(MODULE_KEYS, `${key} is missing from the registry`).toContain(key);
    }
  });

  it("gives everyone the right to apply", () => {
    expect(sql()).toMatch(/select r\.id, 'leave', true, true,/);
  });

  it("gives the admin half to admins alone", () => {
    expect(sql()).toMatch(/select r\.id, 'leave_admin', lower\(r\.name\) = 'admin'/);
  });

  it("is re-runnable", () => {
    expect((sql().match(/on conflict \(role_id, module_key\) do update/g) ?? []).length).toBe(2);
  });

  it("changes no table, column or policy", () => {
    const src = sql();
    expect(src).not.toMatch(/alter table/i);
    expect(src).not.toMatch(/create policy/i);
    expect(src).not.toMatch(/drop policy/i);
  });
});
