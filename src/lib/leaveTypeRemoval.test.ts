import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isRetired, removalPlan, usageLabel } from "./leaveTypeRemoval";

/**
 * Remove, when remove would take history with it.
 *
 * leave_applications.leave_type_id and staff_leave_balances.leave_type_id are
 * both ON DELETE CASCADE, and leave_types is not in trash_allowed_object().
 * Deleting Casual Leave would therefore destroy every Casual Leave
 * application and balance ever recorded, with nothing to restore from.
 */

describe("removalPlan", () => {
  it("deletes only when absolutely nothing refers to the type", () => {
    const plan = removalPlan({ applications: 0, balances: 0 });
    expect(plan.action).toBe("delete");
    expect(plan.confirmLabel).toMatch(/delete/i);
    expect(plan.reason).toMatch(/nothing refers to this leave type/i);
  });

  it("switches off when anything at all refers to it", () => {
    // One is enough. The cascade does not care how many.
    expect(removalPlan({ applications: 1, balances: 0 }).action).toBe("deactivate");
    expect(removalPlan({ applications: 0, balances: 1 }).action).toBe("deactivate");
    expect(removalPlan({ applications: 12, balances: 18 }).action).toBe("deactivate");
  });

  it("promises that history survives a switch-off", () => {
    const plan = removalPlan({ applications: 12, balances: 18 });
    expect(plan.reason).toMatch(/every existing record stays/i);
    expect(plan.reason).toMatch(/switch it back on/i);
    expect(plan.confirmLabel).not.toMatch(/delete/i);
  });

  it("treats rubbish counts as nothing rather than guessing", () => {
    expect(removalPlan({ applications: -3, balances: 0 }).action).toBe("delete");
    expect(removalPlan({} as never).action).toBe("delete");
  });
});

describe("usageLabel", () => {
  it("names the real counts", () => {
    expect(usageLabel({ applications: 12, balances: 18 }))
      .toBe("12 leave applications and 18 balances");
  });

  it("reads correctly at one", () => {
    expect(usageLabel({ applications: 1, balances: 1 }))
      .toBe("1 leave application and 1 balance");
  });

  it("clamps a count that is not a whole positive number", () => {
    // These come from a head:true count(), which can be null; and nothing
    // reads well as "2.9 leave applications".
    expect(usageLabel({ applications: 2.9, balances: 0 })).toBe("2 leave applications");
    expect(usageLabel({ applications: -3, balances: 4 })).toBe("4 balances");
    expect(usageLabel({ applications: null as never, balances: 1 })).toBe("1 balance");
  });

  it("leaves out the side that is empty", () => {
    expect(usageLabel({ applications: 0, balances: 4 })).toBe("4 balances");
    expect(usageLabel({ applications: 4, balances: 0 })).toBe("4 leave applications");
    expect(usageLabel({ applications: 0, balances: 0 })).toBe("nothing");
  });
});

describe("isRetired", () => {
  it("is off only when the column says false", () => {
    // The column defaults true and the published build never writes it, so
    // a row with nothing in it has to read as on.
    expect(isRetired({ is_active: false })).toBe(true);
    expect(isRetired({ is_active: true })).toBe(false);
    expect(isRetired({})).toBe(false);
    expect(isRetired(null)).toBe(false);
  });
});

describe("the leave types card", () => {
  const page = () =>
    readFileSync("src/components/attendance/LeaveSettings.tsx", "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

  it("offers Remove on a live type and Restore on a switched-off one", () => {
    const src = page();
    expect(src).toMatch(/data-testid=\{`remove-\$\{t\.id\}`\}/);
    expect(src).toMatch(/data-testid=\{`restore-\$\{t\.id\}`\}/);
    expect(src).toMatch(/data-testid=\{`off-\$\{t\.id\}`\}/);
  });

  it("counts what uses the type before it says anything", () => {
    const src = page();
    expect(src).toMatch(/from\("leave_applications"\)[\s\S]{0,120}\.eq\("leave_type_id", id\)/);
    expect(src).toMatch(/from\("staff_leave_balances"\)[\s\S]{0,120}\.eq\("leave_type_id", id\)/);
    expect(src).toMatch(/data-testid="confirm-remove"/);
  });

  it("counts AGAIN inside the mutation, not trusting the open dialog", () => {
    // A type that gained its first application while the dialog sat open
    // must be switched off, not deleted.
    const body = page().split("const remove = useMutation")[1].split("const restore = useMutation")[0];
    expect(body).toMatch(/const fresh = await countUsage\(t\.id\)/);
    expect(body).toMatch(/const plan = removalPlan\(fresh\)/);
    expect(body).toMatch(/if \(plan\.action === "deactivate"\)/);
  });

  it("only ever deletes on the delete branch", () => {
    const body = page().split("const remove = useMutation")[1].split("const restore = useMutation")[0];
    const beforeDelete = body.split(".delete()")[0];
    expect(beforeDelete).toMatch(/is_active: false/);
    expect(body.match(/\.delete\(\)/g) ?? []).toHaveLength(1);
  });

  it("does not report a policy refusal as a removal", () => {
    // A DELETE or UPDATE refused by row-level security matches no rows and
    // is not an error, so both paths have to ask for the row back.
    const body = page().split("const remove = useMutation")[1].split("onSuccess:")[0];
    expect(body.match(/\.select\("id"\)/g) ?? []).toHaveLength(2);
    expect(body.match(/!data \|\| data\.length === 0/g) ?? []).toHaveLength(2);
  });

  it("keeps showing inactive types so they can be switched back on", () => {
    // The admin list must NOT filter is_active - that is the only place an
    // off type can be found again.
    const query = page().split("function useLeaveTypes")[1].split("export function LeaveTypesCard")[0];
    expect(query).toMatch(/from\("leave_types"\)\.select\("\*"\)\.order\("name"\)/);
    expect(query).not.toMatch(/is_active/);
  });
});

describe("the Apply Leave dropdown", () => {
  const page = () =>
    readFileSync("src/pages/LeaveManagement.tsx", "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

  it("stops offering a type that was switched off", () => {
    const src = page();
    expect(src).toMatch(/applicableLeaveTypes[\s\S]{0,200}\.filter\(\(lt\) => lt\.is_active !== false\)/);
    expect(src).toMatch(/\{applicableLeaveTypes\.map\(\(lt\) =>/);
  });

  it("leaves leave already applied for alone", () => {
    // The tables read the type name from the embedded row, not from the
    // dropdown's list, so switching a type off cannot blank out history.
    const src = page();
    expect(src).toMatch(/leave_types\(name\)/);
    expect(src).toMatch(/a\.leave_types\?\.name/);
  });
});
