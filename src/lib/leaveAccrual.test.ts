import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ACCRUAL_OPTIONS, LEAVE_ACCRUALS, accrualLabel, accrualOf, entitlementToDate,
  monthsAccrued, needsTopUp, toppedUpBalance,
} from "./leaveAccrual";

/**
 * The number nothing acted on.
 *
 * leave_types.default_days_per_year has been on the table since March with
 * no trigger, no function and no screen behind it. Casual Leave said 12 days
 * a year while 0 of the 18 active staff had a balance row at all, so the
 * first approved leave would have created a row with no allowance and sent
 * the remainder negative. These are the rules that finally spend it.
 */

const CASUAL = { default_days_per_year: 12, accrual: "monthly" };
const EARNED = { default_days_per_year: 15, accrual: "yearly" };
const MARCH = new Date("2026-03-03T10:00:00");

describe("accrualOf", () => {
  it("reads monthly", () => {
    expect(accrualOf(CASUAL)).toBe("monthly");
    expect(accrualOf({ accrual: " MONTHLY " })).toBe("monthly");
  });

  it("reads manual", () => {
    // Maternity Leave is 180 days a year and active. Granting that to all
    // eighteen staff would put a six-month balance on every record, and the
    // approval screen deducts from whatever balance it finds.
    expect(accrualOf({ accrual: "manual" })).toBe("manual");
  });

  it("treats everything else as the old behaviour", () => {
    // The column defaults to 'yearly' and the published build does not send
    // it at all, so a row with nothing in it must behave as it always has.
    expect(accrualOf(EARNED)).toBe("yearly");
    expect(accrualOf({})).toBe("yearly");
    expect(accrualOf(null)).toBe("yearly");
    expect(accrualOf({ accrual: "weekly" })).toBe("yearly");
  });
});

describe("monthsAccrued", () => {
  it("counts the month somebody is in", () => {
    // On 3 March they have March's day, the way a salary arrives at the
    // start of the month it is for rather than the end.
    expect(monthsAccrued(2026, MARCH)).toBe(3);
    expect(monthsAccrued(2026, new Date("2026-01-01T00:00:00"))).toBe(1);
    expect(monthsAccrued(2026, new Date("2026-12-31T23:59:00"))).toBe(12);
  });

  it("completes a past year and starts no future one", () => {
    expect(monthsAccrued(2025, MARCH)).toBe(12);
    expect(monthsAccrued(2027, MARCH)).toBe(0);
  });
});

describe("entitlementToDate", () => {
  it("gives a yearly type the whole figure", () => {
    expect(entitlementToDate(EARNED, 2026, MARCH)).toBe(15);
    expect(entitlementToDate(EARNED, 2026, new Date("2026-01-01T00:00:00"))).toBe(15);
  });

  it("gives a monthly type a twelfth per month begun", () => {
    expect(entitlementToDate(CASUAL, 2026, MARCH)).toBe(3);
    expect(entitlementToDate(CASUAL, 2026, new Date("2026-01-15T00:00:00"))).toBe(1);
    expect(entitlementToDate(CASUAL, 2026, new Date("2026-12-01T00:00:00"))).toBe(12);
  });

  it("rounds to two decimals", () => {
    // A twelfth of 10 is 0.8333..., and a balance that reads
    // 2.4999999999999996 days helps nobody.
    expect(entitlementToDate({ default_days_per_year: 10, accrual: "monthly" }, 2026, MARCH)).toBe(2.5);
    // Two twelfths of 10 is 1.6666666666666667 before rounding.
    expect(entitlementToDate(
      { default_days_per_year: 10, accrual: "monthly" }, 2026, new Date("2026-02-10T00:00:00"),
    )).toBe(1.67);
  });

  it("grants nothing for a year that has not started", () => {
    expect(entitlementToDate(EARNED, 2027, MARCH)).toBe(0);
    expect(entitlementToDate(CASUAL, 2027, MARCH)).toBe(0);
  });

  it("grants nothing for a manual type, however many days it carries", () => {
    expect(entitlementToDate({ default_days_per_year: 180, accrual: "manual" }, 2026, MARCH)).toBe(0);
  });

  it("grants nothing when the type says nothing", () => {
    expect(entitlementToDate({ default_days_per_year: 0, accrual: "monthly" }, 2026, MARCH)).toBe(0);
    expect(entitlementToDate({}, 2026, MARCH)).toBe(0);
    expect(entitlementToDate(null, 2026, MARCH)).toBe(0);
  });
});

describe("toppedUpBalance", () => {
  it("never lowers a figure", () => {
    // The button is pressable twice, and a monthly type is MEANT to be
    // pressed again each month. Running it in March must not take back days
    // an admin granted by hand in February.
    expect(toppedUpBalance(20, 3)).toBe(20);
    expect(toppedUpBalance(1, 3)).toBe(3);
    expect(toppedUpBalance(null, 3)).toBe(3);
    expect(toppedUpBalance("7", 3)).toBe(7);
  });

  it("says whether pressing it would change anything", () => {
    expect(needsTopUp(1, 3)).toBe(true);
    expect(needsTopUp(3, 3)).toBe(false);
    expect(needsTopUp(20, 3)).toBe(false);
  });
});

describe("accrualLabel", () => {
  it("says the rate in words", () => {
    expect(accrualLabel(EARNED)).toMatch(/15 days\/year, all at once/);
    expect(accrualLabel(CASUAL)).toMatch(/^1 days a month \(12\/year\)$/);
    expect(accrualLabel({ default_days_per_year: 180, accrual: "manual" }))
      .toMatch(/180 days, granted by hand when needed/);
  });
});

describe("the accrual options", () => {
  it("offers every mode the code and the CHECK constraint know", () => {
    // One list behind both pickers, so a mode cannot exist in the type and
    // be unreachable from the screen.
    expect(ACCRUAL_OPTIONS.map((o) => o.value)).toEqual([...LEAVE_ACCRUALS]);
  });
});

describe("the leave settings cards", () => {
  const page = () =>
    readFileSync("src/components/attendance/LeaveSettings.tsx", "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

  const topUp = () => page().split("const topUpAllowances")[1].split("const createBalance")[0];

  it("offers Update allowances", () => {
    expect(page()).toMatch(/data-testid="top-up-allowances"/);
  });

  it("grants this year's entitlement to date, not the whole year", () => {
    const body = topUp();
    expect(body).toMatch(/entitlementToDate\(/);
    expect(body).toMatch(/needsTopUp\(/);
    expect(body).toMatch(/toppedUpBalance\(/);
  });

  it("only grants to active staff and active leave types", () => {
    const body = topUp();
    expect(body).toMatch(/staffList\.filter\(\(p\) => p\.is_active !== false\)/);
    expect(body).toMatch(/leaveTypes\.filter\(\(t\) => t\.is_active !== false\)/);
  });

  it("never sends `used` when topping an existing row up", () => {
    // An upsert would carry used: 0 back over somebody's approved leave.
    // The update path must touch opening_balance and nothing else.
    const update = topUp().split(".update(")[1].split(";")[0];
    expect(update).toMatch(/opening_balance/);
    expect(update).not.toMatch(/\bused\b/);
  });

  it("reads the balances afresh rather than trusting the cached card", () => {
    // There is a UNIQUE (staff_id, leave_type_id, year): a row the cache had
    // not seen would fail the whole insert.
    expect(topUp()).toMatch(/from\("staff_leave_balances"\)[\s\S]*?\.eq\("year", year\)/);
  });

  it("lets an admin set how each leave type is given", () => {
    const src = page();
    expect(src).toMatch(/data-testid=\{`accrual-\$\{t\.id\}`\}/);
    expect(src).toMatch(/data-testid="lt-accrual"/);
  });

  it("makes days per year editable, which it never was before", () => {
    // default_days_per_year could only be set at the moment a type was
    // created; the clinic's four types were stuck with whatever March chose.
    const src = page();
    expect(src).toMatch(/data-testid=\{`days-\$\{t\.id\}`\}/);
    expect(src).toMatch(/onChange=\{\(days\) => edit\(t\.id, \{ days \}\)\}/);
  });

  it("can no longer put NaN in the Grant balance year", () => {
    // parseInt("") is NaN and the old handler had no fallback, so clearing
    // the box wrote NaN into state, rendered as the string "NaN", and went
    // into the insert as the year.
    const src = page();
    expect(src).not.toMatch(/parseInt\(e\.target\.value\)/);
    const block = src.split('data-testid="balance-year"')[0].split("<NumberField").slice(-1)[0];
    expect(block).toMatch(/min=\{2000\} max=\{2100\} emptyValue=\{new Date\(\)\.getFullYear\(\)\}/);
  });

  it("no longer collapses a cleared leave figure to zero", () => {
    const src = page();
    expect(src).not.toMatch(/parseFloat\(e\.target\.value\) \|\| 0/);
    expect(src).not.toMatch(/numVal/);
  });

  it("saves only the rows somebody actually changed", () => {
    const src = page();
    expect(src).toMatch(/for \(const id of dirty\)/);
    expect(src).toMatch(/disabled=\{saving \|\| dirty\.length === 0\}/);
  });

  it("does not report a policy refusal as a save", () => {
    // An UPDATE refused by row-level security matches no rows and is not an
    // error, so the save has to ask for the changed row back.
    const save = page().split("const save = async")[1].split("const create = useMutation")[0];
    expect(save).toMatch(/\.select\("id"\)/);
    expect(save).toMatch(/!data \|\| data\.length === 0/);
  });

  it("saves the accrual on a new leave type", () => {
    const body = page().split("const create = useMutation")[1].split("return (")[0];
    expect(body).toMatch(/accrual,/);
  });
});

describe("where leave is configured", () => {
  const settings = () =>
    readFileSync("src/components/attendance/AttendanceSettings.tsx", "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
  const leavePage = () =>
    readFileSync("src/pages/LeaveManagement.tsx", "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

  it("puts both cards on the attendance policy tab", () => {
    const src = settings();
    expect(src).toMatch(/<LeaveTypesCard \/>/);
    expect(src).toMatch(/<LeaveAllowancesCard \/>/);
  });

  it("gates them on leave_admin, not on reaching the page", () => {
    // /admin/attendance is guarded by attendance_admin. Setting leave policy
    // is a different right, and walking in through this page must not
    // silently become it.
    const src = settings();
    expect(src).toMatch(/moduleKey: "leave_admin"/);
    expect(src).toMatch(/\{canAdminLeave && \(\s*<>/);
  });

  it("is gone from the Leave page entirely, not merely hidden", () => {
    // Left mounted behind a guard, the Add Leave Type and Grant Balance
    // dialogs stay in a therapist's DOM.
    const src = leavePage();
    expect(src).not.toMatch(/TabsContent value="balances"/);
    expect(src).not.toMatch(/TabsContent value="types"/);
    expect(src).not.toMatch(/TabsTrigger value="balances"/);
    expect(src).not.toMatch(/TabsTrigger value="types"/);
    expect(src).not.toMatch(/topUpAllowances|createLeaveType|createBalance/);
  });

  it("ignores a stale ?tab= that now points somewhere else", () => {
    // The bell links at /leave?tab=regularisations and must keep working;
    // ?tab=types used to land here and would now select an empty tab.
    const src = leavePage();
    expect(src).toMatch(/const LEAVE_TABS = \["mine", "my-regularisations", "applications", "regularisations"\]/);
    expect(src).toMatch(/LEAVE_TABS\.includes\(askedForTab \?\? ""\) \? askedForTab : null/);
  });

  it("still leaves applying and deciding on the Leave page", () => {
    const src = leavePage();
    expect(src).toMatch(/TabsContent value="applications"/);
    expect(src).toMatch(/TabsContent value="regularisations"/);
    expect(src).toMatch(/TabsContent value="mine"/);
    expect(src).toMatch(/TabsContent value="my-regularisations"/);
  });
});

describe("the migration", () => {
  const sql = () =>
    readFileSync("supabase/migrations/20261114180000_allowances_that_arrive_on_their_own.sql", "utf8")
      .replace(/^\s*--.*$/gm, "");

  it("adds accrual so the published build keeps working", () => {
    // NOT NULL with a default of 'yearly' - today's behaviour exactly - and
    // if not exists, so re-running it is harmless.
    expect(sql()).toMatch(
      /alter table public\.leave_types\s+add column if not exists accrual text not null default 'yearly'/i,
    );
  });

  it("allows only the two accruals the code knows", () => {
    expect(sql()).toMatch(/check \(accrual in \('yearly', 'monthly'\)\)/i);
  });

  it("defaults the correction limit to unlimited", () => {
    expect(sql()).toMatch(
      /add column if not exists regularisation_monthly_limit integer not null default 0/i,
    );
    expect(sql()).toMatch(/regularisation_monthly_limit >= 0 and regularisation_monthly_limit <= 31/i);
  });

  it("enforces the limit before the insert, not in the form", () => {
    const s = sql();
    expect(s).toMatch(/create or replace function public\.enforce_regularisation_limit\(\)/i);
    expect(s).toMatch(/before insert on public\.attendance_regularisations/i);
  });

  it("treats 0 as no limit", () => {
    expect(sql()).toMatch(/if coalesce\(v_limit, 0\) <= 0 then\s+return new;/i);
  });

  it("counts the month being corrected, and not rejected requests", () => {
    const fn = sql().split("enforce_regularisation_limit()")[1];
    expect(fn).toMatch(/date_trunc\('month', r\.date\) = date_trunc\('month', new\.date\)/i);
    expect(fn).toMatch(/r\.status <> 'Rejected'/i);
  });
});

describe("the attendance settings screen", () => {
  const page = () =>
    readFileSync("src/components/attendance/AttendanceSettings.tsx", "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

  it("uses a box the 0 can be backspaced out of", () => {
    // value={form.x} with onChange={Number(e.target.value)} put the 0 back
    // on every keystroke: the clinic could not clear this field, and typing
    // 3 after the surviving 0 gave 30.
    const src = page();
    expect(src).not.toMatch(/Number\(e\.target\.value\)/);
    for (const id of ["regularisation-limit", "face-threshold", "face-attempts"]) {
      const block = src.split(`data-testid="${id}"`)[0].split("<NumberField").slice(-1)[0];
      expect(block, `${id} is not a NumberField`).not.toMatch(/<Input/);
    }
  });

  it("settles an emptied box on a value that was chosen for it", () => {
    // Not always 0: the threshold's documented default is 75, and attempts
    // cannot be 0 at all.
    const src = page();
    expect(src).toMatch(/min=\{0\} max=\{31\} emptyValue=\{0\}/);
    expect(src).toMatch(/min=\{0\} max=\{100\} emptyValue=\{75\}/);
    expect(src).toMatch(/min=\{1\} max=\{10\} emptyValue=\{1\}/);
  });

  it("is where an admin sets the correction limit", () => {
    // The clinic asked "where to configure how many", and this is the
    // answer for corrections - beside the other check-in settings.
    const src = page();
    expect(src).toMatch(/data-testid="regularisation-limit"/);
    expect(src).toMatch(/form\.regularisation_monthly_limit/);
  });

  it("keeps the input inside what the CHECK constraint allows", () => {
    // check (regularisation_monthly_limit >= 0 and <= 31). A spinner that
    // goes past it hands the person a database error.
    const block = page()
      .split('label="Corrections allowed per month"')[1]
      .split("</Row>")[0];
    expect(block).toMatch(/min=\{0\}/);
    expect(block).toMatch(/max=\{31\}/);
  });

  it("defaults to unlimited in the client as well as the database", () => {
    const lib = readFileSync("src/lib/attendance.ts", "utf8");
    expect(lib).toMatch(/regularisation_monthly_limit: number;/);
    expect(lib).toMatch(/regularisation_monthly_limit: 0,/);
  });
});

describe("the allowance confirmation", () => {
  const page = () =>
    readFileSync("src/components/attendance/LeaveSettings.tsx", "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

  it("shows what will be written before writing it", () => {
    // 18 people x 4 types is 72 rows. A button that does that silently is
    // not a button somebody can check.
    const src = page();
    expect(src).toMatch(/data-testid="top-up-preview"/);
    expect(src).toMatch(/data-testid="confirm-top-up"/);
  });

  it("only the confirm button writes", () => {
    const src = page();
    const trigger = src.split('data-testid="top-up-allowances"')[1].split("</Button>")[0];
    expect(trigger).not.toMatch(/topUpAllowances\.mutate/);
    const confirm = src.split('data-testid="confirm-top-up"')[1].split("</Button>")[0];
    expect(confirm).toMatch(/topUpAllowances\.mutate\(\)/);
  });

  it("names the types it will skip", () => {
    const body = page().split("const allowancePreview")[1].split("}, [staffList, leaveTypes]);")[0];
    expect(body).toMatch(/grants: rows\.filter\(\(r\) => r\.days > 0\)/);
    expect(body).toMatch(/skipped: rows\.filter\(\(r\) => r\.days <= 0\)/);
    expect(page()).toMatch(/granted by hand: \{allowancePreview\.skipped/);
  });

  it("refuses to run when nothing would be granted", () => {
    const confirm = page().split('data-testid="confirm-top-up"')[1].split("</Button>")[0];
    expect(confirm).toMatch(/allowancePreview\.grants\.length === 0/);
  });
});

describe("the manual-accrual migration", () => {
  const sql = () =>
    readFileSync("supabase/migrations/20261114190000_maternity_is_not_an_allowance.sql", "utf8")
      .replace(/^\s*--.*$/gm, "");

  it("widens the check rather than replacing what it allowed", () => {
    expect(sql()).toMatch(/check \(accrual in \('yearly', 'monthly', 'manual'\)\)/i);
  });

  it("moves Maternity Leave off the bulk grant, and only that row", () => {
    const s = sql();
    expect(s).toMatch(/set accrual = 'manual'/i);
    expect(s).toMatch(/where name = 'Maternity Leave'/i);
    // Guarded, so re-running it cannot undo an admin's later choice.
    expect(s).toMatch(/and accrual = 'yearly'/i);
    expect(s).toMatch(/and default_days_per_year >= 90/i);
  });
});
