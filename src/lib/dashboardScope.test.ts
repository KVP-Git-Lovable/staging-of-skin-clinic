import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MODULE_KEYS } from "./modules";
import {
  DASHBOARD_CLINIC_KEY, DASHBOARD_MY_APPOINTMENTS_KEY, dashboardScope,
} from "./dashboardScope";

/**
 * Which dashboard a person gets.
 *
 * A therapist signing in landed on the clinic's whole day - 39 appointments,
 * every doctor's name, the NPS score, the pending invoices - because in 805
 * lines of Index.tsx nothing ever asked who was looking. The only
 * role-derived value in the file was canSeeBilling, which hides money and
 * nothing else.
 *
 * The two conventions below are the ones that matter. Breaking either does
 * not show somebody too much; it locks real people out of their own clinic.
 */

const clinic = { [DASHBOARD_CLINIC_KEY]: { can_view: true } };
const mine = { [DASHBOARD_MY_APPOINTMENTS_KEY]: { can_view: true } };

describe("dashboardScope", () => {
  it("gives an admin the clinic, without consulting the map", () => {
    // useAuth hands an admin an EMPTY map and returns early, so an admin
    // would scrape through on the empty-map rule even with the isAdmin line
    // gone. The populated map is what tells the two apart.
    expect(dashboardScope({ isAdmin: true, permissions: {} })).toBe("full");
    expect(dashboardScope({ isAdmin: true, permissions: { dashboard: { can_view: true } } })).toBe("full");
  });

  it("gives a role nobody has configured the clinic, not a blank screen", () => {
    // An empty map for a non-admin means "not set up yet". Dropping those
    // people to attendance-only on an upgrade would be the worse failure.
    expect(dashboardScope({ isAdmin: false, permissions: {} })).toBe("full");
  });

  it("gives the clinic to whoever holds the clinic key", () => {
    expect(dashboardScope({ isAdmin: false, permissions: clinic })).toBe("full");
  });

  it("gives their own appointments to whoever holds that key", () => {
    expect(dashboardScope({ isAdmin: false, permissions: mine })).toBe("my_day");
  });

  it("falls back to attendance alone when neither is held", () => {
    // Reception and the pharmacy, by the clinic's own instruction.
    expect(dashboardScope({
      isAdmin: false,
      permissions: { dashboard: { can_view: true }, appointments: { can_view: true } },
    })).toBe("attendance_only");
  });

  it("prefers the clinic when somebody holds both", () => {
    // Holding both means "and also everything"; the smaller list would be a
    // strange way to read it.
    expect(dashboardScope({ isAdmin: false, permissions: { ...clinic, ...mine } })).toBe("full");
  });

  it("treats a key switched off as not held", () => {
    expect(dashboardScope({
      isAdmin: false,
      permissions: { [DASHBOARD_CLINIC_KEY]: { can_view: false }, ...mine },
    })).toBe("my_day");
    expect(dashboardScope({
      isAdmin: false,
      permissions: {
        [DASHBOARD_CLINIC_KEY]: { can_view: false },
        [DASHBOARD_MY_APPOINTMENTS_KEY]: { can_view: false },
      },
    })).toBe("attendance_only");
  });
});

describe("the dashboard page branches on it", () => {
  const src = () => readFileSync("src/pages/Index.tsx", "utf8").replace(/^\s*\/\/.*$/gm, "");

  it("picks the dashboard before the clinic one's queries run", () => {
    const text = src();
    expect(text).toContain("const scope = dashboardScope({ isAdmin, permissions });");
    expect(text).toContain('if (scope === "full") return <ClinicDashboard />;');
    expect(text).toContain('<MyDashboard withAppointments={scope === "my_day"} />');
  });

  it("renders only the loading screen while auth is still loading", () => {
    // While it resolves, permissions is {} and the empty-map rule reads as
    // "full" - so without this a therapist watches the clinic dashboard
    // flash past, and all eleven of its queries have already been sent.
    expect(src()).toMatch(/const \{ isAdmin, permissions, loading \} = useAuth\(\);\s*\n\s*if \(loading\) return <AppLoadingScreen \/>;/);
  });

  it("keeps the clinic dashboard as its own component", () => {
    // Separate components, not an early return inside one: the branch sits
    // above eleven useQuery calls, and a conditional return above hooks
    // changes the hook count between renders.
    const text = src();
    expect(text).toContain("const ClinicDashboard = () => {");
    expect(text).not.toContain("const Index = () => {\n  const [selectedStaff");
  });
});

describe("the migration", () => {
  const sql = () =>
    readFileSync("supabase/migrations/20261113180000_a_dashboard_that_fits_the_person.sql", "utf8")
      .replace(/^\s*--.*$/gm, "");

  it("grants only keys the registry knows", () => {
    for (const key of [DASHBOARD_CLINIC_KEY, DASHBOARD_MY_APPOINTMENTS_KEY]) {
      expect(sql(), `${key} is not back-filled`).toContain(`'${key}'`);
      expect(MODULE_KEYS, `${key} is missing from the registry`).toContain(key);
    }
  });

  it("gives the clinic figures to admins and doctors only", () => {
    expect(sql()).toMatch(/'dashboard_clinic',\s*\n?\s*lower\(r\.name\) in \('admin','doctor'\)/);
  });

  it("gives my-appointments to therapists and nurses only", () => {
    expect(sql()).toMatch(/'dashboard_my_appointments',\s*\n?\s*lower\(r\.name\) in \('therapist','nurse'\)/);
  });

  it("writes a row for EVERY role, not only the ones it grants", () => {
    // User Management's Save deletes every row for a role and reinserts only
    // the registry's keys, so a key with no row anywhere has nothing to tick.
    const text = sql();
    expect(text).not.toMatch(/from public\.user_roles_config r\s*\n\s*where/);
  });

  it("is re-runnable", () => {
    expect((sql().match(/on conflict \(role_id, module_key\) do update/g) ?? []).length).toBe(2);
  });

  it("changes no table, column or policy", () => {
    const text = sql();
    expect(text).not.toMatch(/alter table/i);
    expect(text).not.toMatch(/create policy/i);
  });
});
