import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { roleDeleteState } from "./roleDelete";

/**
 * Which roles may be deleted, and the two screens that changed with it.
 *
 * The rule that matters: staff.role_id is ON DELETE SET NULL, so deleting a
 * role somebody holds blanks their role without a word. Nobody would notice
 * until four nurses found half the app missing, and the id that said which
 * role it was is the very thing erased, so there is nothing to put back from.
 */

const custom = { id: "r1", name: "Pharmacistsd", is_system: false };
const system = { id: "a0000000-0000-0000-0000-000000000001", name: "Admin", is_system: true };

describe("roleDeleteState", () => {
  it("allows a custom role nobody holds", () => {
    expect(roleDeleteState({ role: custom, staffCount: 0 })).toEqual({ canDelete: true, reason: "" });
  });

  it("refuses a role somebody still holds, and says how many", () => {
    // "You cannot delete this" without the number sends somebody hunting
    // through the Users tab for who it is.
    const state = roleDeleteState({ role: { id: "r2", name: "Nurse", is_system: false }, staffCount: 4 });
    expect(state.canDelete).toBe(false);
    expect(state.reason).toContain("4 staff");
    expect(state.reason).toContain("Users tab");
  });

  it("counts one person as one, not as '1 staff'", () => {
    const state = roleDeleteState({ role: custom, staffCount: 1 });
    expect(state.reason).toContain("1 staff member");
    expect(state.reason).toContain("has this role");
  });

  it("refuses every system role, even with nobody on it", () => {
    // The app seeds Admin, Doctor, Receptionist and Pharmacist and assigns
    // them by name. A clinic that deleted Admin could not make another
    // administrator.
    const state = roleDeleteState({ role: system, staffCount: 0 });
    expect(state.canDelete).toBe(false);
    expect(state.reason).toContain("system role");
    expect(state.reason).toContain("Admin");
  });

  it("refuses a system role that people hold, on the system ground", () => {
    expect(roleDeleteState({ role: system, staffCount: 6 }).reason).toContain("system role");
  });

  it("refuses when no role is selected", () => {
    expect(roleDeleteState({ role: null, staffCount: 0 }).canDelete).toBe(false);
    expect(roleDeleteState({ role: { name: "ghost" }, staffCount: 0 }).canDelete).toBe(false);
  });

  it("treats a missing or junk count as nobody, never as permission", () => {
    expect(roleDeleteState({ role: custom, staffCount: NaN }).canDelete).toBe(true);
    expect(roleDeleteState({ role: custom, staffCount: -1 }).canDelete).toBe(true);
  });
});

describe("the User Management screen", () => {
  const src = () => readFileSync("src/pages/UserManagement.tsx", "utf8");

  it("asks roleDeleteState rather than deciding inline", () => {
    const text = src();
    expect(text).toContain("roleDeleteState({ role: selectedRole, staffCount: staffOnSelectedRole })");
    expect(text).toContain("disabled={!roleDelete.canDelete");
  });

  it("offers no delete button at all for a system role", () => {
    expect(src()).toMatch(/selectedRole && !selectedRole\.is_system && \(\s*<Button/);
  });

  it("shows the reason, so a greyed-out button is never a dead end", () => {
    expect(src()).toMatch(
      /data-testid="role-delete-reason"[\s\S]{0,80}\{roleDelete\.reason\}/,
    );
  });

  it("puts the reason on the disabled button too", () => {
    expect(src()).toContain("title={roleDelete.canDelete ?");
    expect(src()).toContain(": roleDelete.reason}");
  });

  it("counts the holders from the staff list already loaded", () => {
    expect(src()).toMatch(/staff\.filter\([\s\S]{0,80}x\.role_id === selectedRoleId,?\s*\)\s*\.length/);
  });

  it("asks before deleting, and never leaves the page on a role that is gone", () => {
    const text = src();
    expect(text).toContain('data-testid="confirm-delete-role"');
    expect(text).toMatch(/const next = roles\.find[\s\S]{0,100}setSelectedRoleId/);
  });
});

describe("the database refuses it too", () => {
  const sql = () =>
    readFileSync("supabase/migrations/20261111120000_a_role_somebody_still_holds.sql", "utf8");

  it("refuses a system role", () => {
    expect(sql()).toMatch(/coalesce\(old\.is_system, false\)[\s\S]{0,120}raise exception/);
  });

  it("refuses a role staff still point at", () => {
    const text = sql();
    expect(text).toContain("from public.staff where role_id = old.id");
    expect(text).toMatch(/v_holders > 0[\s\S]{0,160}raise exception/);
  });

  it("fires before the delete, not after it", () => {
    // After the row is gone, staff.role_id has already been blanked by the
    // ON DELETE SET NULL - there would be nothing left to refuse.
    expect(sql()).toContain("before delete on public.user_roles_config");
  });

  it("counts holders as its definer, so a role cannot look free", () => {
    // A caller who cannot see the staff rows must not get a count of zero.
    expect(sql()).toContain("security definer");
  });

  it("is re-runnable", () => {
    const text = sql();
    expect(text).toContain("create or replace function");
    expect(text).toContain("drop trigger if exists");
  });
});

describe("Add Staff no longer demands a last name", () => {
  const staffPage = () => readFileSync("src/pages/StaffManagement.tsx", "utf8");

  it("drops the asterisk and the Save block", () => {
    const text = staffPage();
    expect(text).toContain("<Label>Last Name</Label>");
    expect(text).not.toContain("<Label>Last Name *</Label>");
    expect(text).toContain("disabled={!form.first_name || saveMutation.isPending}");
  });

  it("still requires a first name", () => {
    expect(staffPage()).toContain("<Label>First Name *</Label>");
  });

  it('stores "-" when it is left blank, because the column is NOT NULL', () => {
    // The same fallback CreateUserDialog and EditUserDialog already use, so
    // the three forms agree rather than inventing three answers.
    expect(staffPage()).toContain('last_name: form.last_name.trim() || "-",');
    for (const f of ["src/components/users/CreateUserDialog.tsx", "src/components/users/EditUserDialog.tsx"]) {
      expect(readFileSync(f, "utf8"), `${f} no longer uses the same fallback`).toContain('|| "-"');
    }
  });
});
