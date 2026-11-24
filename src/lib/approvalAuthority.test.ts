import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Who may answer a leave request or an attendance correction.
 *
 * Being told one arrived and being allowed to answer it were two different
 * settings, and only the first was narrow. Notifications already went to the
 * two people the clinic named; deciding asked is_admin_user(), true for any
 * active Admin-role staff member - which included the shared The Skin Clinic
 * account the clinic has now asked to keep out of it.
 */

const MIGRATION = "supabase/migrations/20261114120000_only_those_two_decide.sql";
const sql = () => readFileSync(MIGRATION, "utf8").replace(/^\s*--.*$/gm, "");
const page = () => readFileSync("src/pages/LeaveManagement.tsx", "utf8").replace(/^\s*\/\/.*$/gm, "");
const auth = () =>
  readFileSync("src/hooks/useAuth.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("may_decide_requests", () => {
  it("asks for the flag, on an active staff row", () => {
    const src = sql();
    expect(src).toMatch(/where s\.auth_user_id = auth\.uid\(\)\s*\n\s*and s\.is_active is not false\s*\n\s*and s\.approves_requests/);
  });

  it("falls back to any admin ONLY when nobody is named", () => {
    // There is no screen for ticking approves_requests yet, so a clinic that
    // cleared both approvers would reach a state where no leave can ever be
    // approved and nobody inside the clinic could undo it. Same reasoning as
    // has_full_data_scope defaulting open.
    const src = sql();
    expect(src).toMatch(/or not exists \(\s*\n\s*select 1 from public\.staff s2\s*\n\s*where s2\.approves_requests/);
    expect(src).toContain("and public.is_admin_user();");
  });

  it("is not reachable by anon", () => {
    expect(sql()).toContain("revoke all on function public.may_decide_requests() from public, anon;");
  });
});

describe("the two decisions move onto it", () => {
  it("repoints approving leave and approving a correction", () => {
    const src = sql();
    for (const t of ["leave_applications", "attendance_regularisations"]) {
      const at = src.indexOf(`on public.${t} for update to authenticated`);
      expect(at, `${t} has no update policy`).toBeGreaterThan(-1);
      const body = src.slice(at, at + 220);
      expect(body, `${t} still decides by admin alone`).toContain("may_decide_requests()");
      expect(body, `${t} still names is_admin_user`).not.toContain("is_admin_user()");
    }
  });

  it("drops the policy it replaces, so the old one cannot linger beside it", () => {
    // Permissive policies are OR'd. Leaving the admin one in place would
    // have changed nothing at all.
    const src = sql();
    expect(src).toContain('drop policy if exists "Only admins decide leave" on public.leave_applications;');
    expect(src).toContain('drop policy if exists "Only admins decide a regularisation" on public.attendance_regularisations;');
  });

  it("leaves configuring and deleting where they were", () => {
    // Leave types, balances and the delete policies are administration, not
    // approval, and the clinic asked about approving.
    const src = sql();
    expect(src).not.toMatch(/leave_types/);
    expect(src).not.toMatch(/staff_leave_balances/);
    expect(src).not.toMatch(/for delete/);
  });

  it("hoists the predicate", () => {
    expect(sql()).not.toMatch(/using \(public\.may_decide_requests\(\)\)/);
  });

  it("changes no table or column", () => {
    const src = sql();
    expect(src).not.toMatch(/alter table/i);
    expect(src).not.toMatch(/create table/i);
  });
});

describe("the buttons match", () => {
  it("hides Approve and Reject from an admin who is not an approver", () => {
    const src = page();
    expect(src).toContain("const mayDecide = approvesRequests;");
    expect(src).toMatch(/\{mayDecide && <>[\s\S]{0,200}data-testid="approve-leave"/);
    expect(src).toContain("{canDecide(r.status) && mayDecide && (");
  });

  it("keeps seeing separate from deciding", () => {
    // The Skin Clinic stays an admin and still sees every pending request;
    // it simply has nothing to press. Hiding the tabs would take away more
    // than was asked for.
    const src = page();
    expect(src).toContain('canViewModule({ isAdmin, permissions, moduleKey: "leave_admin" })');
    expect(src).not.toContain("const canAdminLeave = approvesRequests");
  });
});

describe("useAuth carries the flag", () => {
  it("looks it up on its own, not in the long-standing select", () => {
    // The select at the head of loadStaffProfile is deliberately limited to
    // columns that have always existed: a failed select there returns no
    // row, which is indistinguishable from "not a staff user" and would
    // strip every permission the person has.
    const src = auth();
    expect(src).toMatch(/\.select\("approves_requests"\)/);
    expect(src).not.toMatch(/\.select\("id, first_name[^"]*approves_requests/);
  });

  it("defaults to NO, unlike the two beside it", () => {
    // dataScope and reportPeriodLimit answer "how much may this person see",
    // where unknown must mean unrestricted or an upgrade locks people out.
    // This answers "may this person decide for somebody else".
    const src = auth();
    expect(src).toContain("let approver = false;");
    expect(src).toContain("approvesRequests: false,");
  });

  it("is on the context, so a screen can ask", () => {
    const src = auth();
    expect(src).toContain("approvesRequests: boolean;");
    expect(src).toMatch(/dataScope, approvesRequests, reportPeriodLimit/);
  });

  it("still selects every field the profile is built from", () => {
    expect(auth()).toContain(
      '.select("id, first_name, last_name, email, phone, role_id, is_active, force_password_change, user_roles_config(id, name)")',
    );
  });
});
