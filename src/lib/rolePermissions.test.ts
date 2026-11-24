import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ALL_MODULES, MODULE_KEYS } from "./modules";
import { canViewModule, staffAccess } from "./staffAccess";

/**
 * What each role may see, and the four places that have to agree about it.
 *
 * Therapists and nurses are getting their own logins. Before this, the menu
 * showed everybody all 47 pages - AppSidebar's canView() was `return true`
 * with a note saying "for now" - while the route guard refused most of them.
 * A menu that disagrees with the guard is worse than no gating: it sends
 * people to Access Denied and teaches them the app is broken.
 *
 * So the module key now lives in exactly one list, and these tests hold the
 * four readers of it together: the registry, the route table, the menu and
 * the migration that fills in the rows. Any one of them drifting is silent
 * in production and loud here.
 */

const APP = () => readFileSync("src/App.tsx", "utf8");
const SIDEBAR = () => readFileSync("src/components/layout/AppSidebar.tsx", "utf8");
const MIGRATION = "supabase/migrations/20261113060000_what_each_role_may_see.sql";
const sql = () => readFileSync(MIGRATION, "utf8").replace(/^\s*--.*$/gm, "");

describe("the module registry", () => {
  it("names every key once", () => {
    expect(new Set(MODULE_KEYS).size).toBe(MODULE_KEYS.length);
  });

  it("carries the keys this change added", () => {
    for (const key of ["attendance", "attendance_admin", "trash"]) {
      expect(MODULE_KEYS, `${key} is missing from the registry`).toContain(key);
    }
  });

  it("no longer lives inside the page that edits it", () => {
    // It was declared in UserManagement.tsx, so the only thing that could read
    // it was the page that edits it - which is why the sidebar had no list to
    // gate against and gave up.
    const page = readFileSync("src/pages/UserManagement.tsx", "utf8");
    expect(page).not.toMatch(/^const ALL_MODULES = \[/m);
    expect(page).toContain('from "@/lib/modules"');
  });
});

describe("the route table and the registry agree", () => {
  it("guards every route with a key the registry knows", () => {
    const keys = [...APP().matchAll(/ProtectedRoute moduleKey="([a-z_]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(20);
    for (const k of new Set(keys)) {
      expect(MODULE_KEYS, `App.tsx guards a route with "${k}", which no role can be granted`).toContain(k);
    }
  });

  it("guards the three routes that had no guard at all", () => {
    const src = APP();
    // /attendance and /trash were bare elements: anybody signed in could open
    // them, whatever their role.
    expect(src).toContain('path="/attendance" element={<ProtectedRoute moduleKey="attendance">');
    expect(src).toContain('path="/trash" element={<ProtectedRoute moduleKey="trash">');
    // Everyone's attendance hung off "staff", which Receptionist holds in full.
    expect(src).toContain('path="/admin/attendance" element={<ProtectedRoute moduleKey="attendance_admin">');
    expect(src).not.toMatch(/path="\/admin\/attendance"[^\n]*moduleKey="staff"/);
  });
});

describe("the menu and the registry agree", () => {
  it("uses the shared decision rather than its own", () => {
    const src = SIDEBAR();
    expect(src).toContain("canViewModule({ isAdmin, permissions, moduleKey })");
    // The stub this replaced.
    expect(src).not.toMatch(/allow all logged-in users to view all modules/);
  });

  it("labels every entry with a key the registry knows", () => {
    const keys = [...SIDEBAR().matchAll(/moduleKey: "([a-z_]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(20);
    for (const k of new Set(keys)) {
      expect(MODULE_KEYS, `the menu offers "${k}", which no role can be granted`).toContain(k);
    }
  });

  it("gives Trash and My Attendance the keys their routes use", () => {
    const src = SIDEBAR();
    expect(src).toMatch(/url: "\/trash"[^\n]*moduleKey: "trash"/);
    expect(src).toMatch(/url: "\/attendance"[^\n]*moduleKey: "attendance"/);
  });

  it("gives the admin pages theirs, now that they live in their own list", () => {
    // The whole Admin group used to hang off "settings" with no keys on its
    // items, so it sat on a doctor's menu leading nowhere. The group is one
    // link now and the entries moved to src/lib/adminSections.ts, which keeps
    // a key per page; adminSections.test.ts checks each against its route.
    const admin = readFileSync("src/lib/adminSections.ts", "utf8");
    expect(admin).toMatch(/url: "\/user-management",[\s\S]{0,160}adminOnly: true/);
    expect(admin).toMatch(/url: "\/admin\/attendance",[\s\S]{0,160}moduleKey: "attendance_admin"/);
    expect(SIDEBAR()).not.toContain("adminSubItems");
  });

  it("labels every admin page with a key the registry knows too", () => {
    const admin = readFileSync("src/lib/adminSections.ts", "utf8");
    for (const k of new Set([...admin.matchAll(/moduleKey: "([a-z_]+)"/g)].map((m) => m[1]))) {
      expect(MODULE_KEYS, `Admin Home offers "${k}", which no role can be granted`).toContain(k);
    }
  });
});

describe("canViewModule is the one answer behind both", () => {
  const cases = [
    { isAdmin: true, permissions: {}, moduleKey: "patients" },
    { isAdmin: false, permissions: {}, moduleKey: "patients" },
    { isAdmin: false, permissions: { patients: { can_view: true } }, moduleKey: "patients" },
    { isAdmin: false, permissions: { patients: { can_view: false } }, moduleKey: "patients" },
    { isAdmin: false, permissions: { billing: { can_view: true } }, moduleKey: "patients" },
  ];

  it("gives the route guard exactly its own answer", () => {
    // The drift this refactor exists to prevent: if these two ever disagree,
    // the menu offers a page the guard refuses, or hides one it would allow.
    for (const c of cases) {
      const viaGuard = staffAccess({ hasSession: true, isStaff: true, staffDeactivated: false, ...c });
      expect(viaGuard === "allowed", JSON.stringify(c)).toBe(canViewModule(c));
    }
  });

  it("lets an admin through WITHOUT consulting the map", () => {
    // useAuth hands an admin an empty map today, so an admin would scrape
    // through on the empty-map rule even with the isAdmin line deleted. The
    // populated map is what tells the two apart: the Admin role really does
    // have rows in role_module_permissions, and the day anything starts
    // handing them over, the isAdmin line is the only thing still letting an
    // admin into a module their rows happen not to list.
    expect(canViewModule({
      isAdmin: true,
      permissions: { dashboard: { can_view: true } },
      moduleKey: "user_management",
    })).toBe(true);
    expect(canViewModule({ isAdmin: true, permissions: {}, moduleKey: "anything" })).toBe(true);
  });

  it("keeps a role nobody has configured yet fully open", () => {
    expect(canViewModule({ isAdmin: false, permissions: {}, moduleKey: "anything" })).toBe(true);
  });

  it("denies a configured role a module it was not given", () => {
    expect(canViewModule({
      isAdmin: false,
      permissions: { dashboard: { can_view: true } },
      moduleKey: "billing",
    })).toBe(false);
  });
});

describe("the migration fills in the rows the registry needs", () => {
  it("grants only keys the registry knows", () => {
    // A row for a key not in ALL_MODULES is deleted the next time anybody
    // presses Save on any role, because savePerms reinserts only these keys.
    const granted = [...sql().matchAll(/'([a-z_]+)',\s*(?:true|false|lower)/g)].map((m) => m[1]);
    const moduleish = granted.filter((k) => !["admin", "doctor", "receptionist", "pharmacist", "nurse", "therapist"].includes(k));
    expect(moduleish.length).toBeGreaterThan(0);
    for (const k of new Set(moduleish)) {
      expect(MODULE_KEYS, `the migration writes "${k}", which the registry does not list`).toContain(k);
    }
  });

  it("back-fills every key the registry added", () => {
    const src = sql();
    for (const key of ["attendance", "attendance_admin", "trash"]) {
      expect(src, `${key} has no back-fill, so every role is denied it`).toContain(`'${key}'`);
    }
  });

  it("is re-runnable", () => {
    const src = sql();
    const upserts = src.match(/on conflict \(role_id, module_key\) do update/g) ?? [];
    expect(upserts.length).toBeGreaterThanOrEqual(4);
  });

  it("switches everything off for a therapist and a nurse before granting", () => {
    // Naming what to remove would leave a module added later switched ON for
    // them. Off-by-default is the safe direction.
    const src = sql();
    expect(src).toMatch(/set can_view = false, can_create = false, can_edit = false, can_delete = false[\s\S]{0,200}lower\(r\.name\) in \('nurse','therapist'\)/);
  });

  it("gives them the dashboard, their attendance and appointments, and no more", () => {
    const src = sql();
    const block = /cross join \(values([\s\S]*?)\) as m\(module_key/.exec(src);
    expect(block).not.toBeNull();
    const keys = [...block![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(keys.sort()).toEqual(["appointments", "attendance", "dashboard"]);
  });

  it("does not let them create or delete an appointment", () => {
    // Booking and cancelling stay with reception and the doctors.
    const block = /cross join \(values([\s\S]*?)\) as m\(module_key/.exec(sql())![1];
    expect(block).toMatch(/\('appointments',\s*true,\s*false,\s*true\)/);
  });
});

describe("the migration shuts the leave tables", () => {
  it("replaces the blanket policies rather than adding beside them", () => {
    // leave_applications, leave_types and staff_leave_balances all still
    // carried USING (true) for every authenticated user, so any signed-in
    // person could read every colleague's leave and approve their own.
    const src = sql();
    expect(src).toContain("drop policy if exists \"Authenticated staff can read %1$s\"");
    expect(src).toContain("drop policy if exists \"Authenticated staff can update %1$s\"");
  });

  it("limits reading to your own rows unless you are an admin", () => {
    // Checked per policy by name. A single regex over the file passed while
    // one of the two tables had been opened back up to everyone, because the
    // other table still matched it.
    const src = sql();
    const own = /using \(\(select public\.is_admin_user\(\)\) or staff_id = \(select public\.current_staff_id\(\)\)\)/;
    for (const policy of ["Staff read own leave, admins read all", "Staff read own balance, admins read all"]) {
      const at = src.indexOf(`create policy "${policy}"`);
      expect(at, `${policy} is gone`).toBeGreaterThan(-1);
      expect(src.slice(at, at + 260), `${policy} no longer limits reading to your own rows`).toMatch(own);
    }
    // And nothing in the file hands a leave table back to everyone.
    expect(src).not.toMatch(/on public\.leave_applications for select to authenticated\s*\n\s*using \(true\)/);
    expect(src).not.toMatch(/on public\.staff_leave_balances for select to authenticated\s*\n\s*using \(true\)/);
  });

  it("lets an admin still apply on somebody's behalf", () => {
    // The published Leave page's Apply form makes you pick a staff member from
    // a dropdown of everyone. A bare own-rows check would have broken that
    // flow on the live clinic with no deploy.
    expect(sql()).toMatch(/for insert to authenticated\s*\n\s*with check \(\(select public\.is_admin_user\(\)\) or staff_id = \(select public\.current_staff_id\(\)\)\)/);
  });

  it("leaves approving and deleting to admins alone", () => {
    const src = sql();
    expect(src).toMatch(/"Only admins decide leave"[\s\S]{0,200}using \(\(select public\.is_admin_user\(\)\)\)/);
    expect(src).toMatch(/"Only admins delete leave"[\s\S]{0,160}using \(\(select public\.is_admin_user\(\)\)\)/);
  });

  it("hoists the helper calls, which this table's neighbours learned the hard way", () => {
    // 20260910160000 measured 7ms against 874ms over 50k rows for the same
    // predicate called per row instead of once.
    const src = sql();
    expect(src).not.toMatch(/using \(public\.is_admin_user\(\)/);
    expect(src).not.toMatch(/or staff_id = public\.current_staff_id\(\)/);
  });

  it("writes is_admin_user into the repo, where it never existed", () => {
    // Every attendance policy calls it and no migration defined it - it lived
    // only in the live database, so a fresh db reset would fail.
    expect(sql()).toContain("create or replace function public.is_admin_user()");
  });

  it("changes no table, column or constraint", () => {
    // AGENTS.md: the published build must keep working with no deploy.
    const src = sql();
    expect(src).not.toMatch(/alter table/i);
    expect(src).not.toMatch(/create table/i);
    expect(src).not.toMatch(/drop column/i);
  });
});

/**
 * A role added after the fact.
 *
 * Manager was created in Roles & Permissions on 13 November and arrived with
 * nothing but billing_amounts ticked - defaultsToVisible() switches that on
 * for every role the screen makes, and it is not a page. The clinic asked for
 * the same set a receptionist carries.
 */
describe("the migration that sets the Manager role", () => {
  const MANAGER = "supabase/migrations/20261115120000_what_a_manager_opens.sql";
  const managerSql = () => readFileSync(MANAGER, "utf8").replace(/^\s*--.*$/gm, "");

  it("leaves exactly the three a receptionist has", () => {
    expect(managerSql()).toMatch(/not in \('dashboard', 'attendance', 'leave'\)/);
  });

  it("keeps create on the two things they do for themselves", () => {
    // Marking your own day and applying for your own leave are both inserts.
    const src = managerSql();
    expect(src).toMatch(/set can_view = true, can_create = true[\s\S]*?module_key in \('attendance', 'leave'\)/);
    expect(src).toMatch(/set can_view = true, can_create = false[\s\S]*?module_key = 'dashboard'/);
  });

  it("never grants edit or delete", () => {
    expect(managerSql()).not.toMatch(/can_edit = true/);
    expect(managerSql()).not.toMatch(/can_delete = true/);
  });

  it("switches rows off rather than deleting them", () => {
    // Roles & Permissions has to keep listing every module with a box.
    expect(managerSql()).not.toMatch(/delete\s+from/i);
  });

  it("touches no other role", () => {
    // The point of a separate migration: re-running it cannot disturb what
    // was set for the roles configured earlier the same afternoon.
    const src = managerSql();
    for (const role of ["Receptionist", "Pharmacist", "Admin", "Doctor", "Nurse", "Therapist"]) {
      expect(src, `${role} must not appear`).not.toMatch(new RegExp(`'${role}'`));
    }
    expect((src.match(/r\.name = 'Manager'/g) ?? []).length).toBe(3);
  });

  it("gives the same three the receptionist migration does", () => {
    // Two files, one answer. If one is ever widened the other has to follow,
    // and this is what makes that loud.
    const receptionist = readFileSync(
      "supabase/migrations/20261115060000_what_a_receptionist_opens.sql", "utf8",
    ).replace(/^\s*--.*$/gm, "");
    const triples = (text: string) =>
      (text.match(/'dashboard', 'attendance', 'leave'|'attendance', 'leave'|= 'dashboard'/g) ?? []).join("|");
    expect(triples(managerSql())).toBe(triples(receptionist));
  });
});
