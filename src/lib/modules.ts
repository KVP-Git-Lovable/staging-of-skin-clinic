import { BILLING_AMOUNTS_KEY } from "@/lib/billingVisibility";

/**
 * Every module a role's permissions can be set for.
 *
 * This list used to live inside UserManagement.tsx, which meant the only thing
 * that could read it was the page that edits it. The sidebar needs the same
 * list to decide what to show, and the route guard needs the same keys, so it
 * moved here rather than being copied.
 *
 * ── Two things about this list are load-bearing ──
 *
 * 1. `savePerms` in User Management DELETES every row for a role and reinserts
 *    one row per entry here. A key that is removed from this list is therefore
 *    deleted from the database the next time anybody presses Save on any role.
 *    Removing an entry is a data change, not a tidy-up.
 *
 * 2. A key added here has no row on any existing role until a migration
 *    back-fills one, and `?? false` in the reader means "no row" reads as
 *    denied. So adding a key is always a pair: this list, and a migration.
 *
 * The keys are also what `ProtectedRoute moduleKey="..."` passes in src/App.tsx
 * and what the menu entries carry in AppSidebar.tsx. All three have to agree,
 * which is what src/lib/rolePermissions.test.ts checks.
 */
export interface ModuleDef {
  key: string;
  label: string;
  /** Rendered as a single View checkbox - it gates fields, not a page. */
  viewOnly?: boolean;
}

export const ALL_MODULES: ModuleDef[] = [
  { key: "dashboard", label: "Dashboard" },
  // Which dashboard, once it opens. Neither of these granted means the
  // person sees their own working day and nothing else - see
  // src/lib/dashboardScope.ts.
  { key: "dashboard_clinic", label: "Dashboard - clinic-wide figures" },
  { key: "dashboard_my_appointments", label: "Dashboard - my appointments today" },
  { key: "patients", label: "Patients" },
  { key: "appointments", label: "Appointments" },
  { key: "procedures", label: "Procedures" },
  { key: "photos", label: "Photos" },
  { key: "pharmacy", label: "Pharmacy" },
  { key: "billing", label: "Billing" },
  // Attendance, split into the day a person records for themselves and the
  // whole clinic's. There was no attendance key at all before this, and
  // /attendance had no route guard either, so everybody could open it; the
  // clinic-wide view at /admin/attendance was guarded by "staff", which
  // Receptionist holds in full.
  { key: "attendance", label: "My Attendance" },
  { key: "attendance_admin", label: "Attendance - everyone's" },
  { key: "leave", label: "Leave (apply for my own)" },
  { key: "leave_admin", label: "Leave - types, balances, approvals" },
  { key: "assets", label: "Assets" },
  { key: "portal_orders", label: "Portal Orders" },
  { key: "campaigns", label: "Campaigns" },
  { key: "leads", label: "Leads" },
  { key: "feedback_rca", label: "Root Cause Analysis" },
  { key: "communications", label: "Communications Center" },
  { key: "meta", label: "Meta" },
  { key: "meta_connection", label: "Meta Connection" },
  // Staging only (agentic marketing is not in production).
  { key: "agentic_marketing", label: "Agentic Marketing" },
  { key: "expenses", label: "Expenses" },
  { key: "staff", label: "Staff" },
  { key: "problem_areas", label: "Primary Concern" },
  { key: "reports", label: "Reports" },
  { key: "dashboards", label: "Dashboards" },
  { key: "report_builder", label: "Report Builder" },
  { key: "surveys", label: "Surveys" },
  { key: "services", label: "Services" },
  { key: "vendors", label: "Vendors" },
  { key: "unit_master", label: "Unit Master" },
  { key: "category_master", label: "Category Master" },
  { key: "settings", label: "Settings" },
  // Trash had no key and its route had no guard, so it sat on every menu.
  // Its own key rather than folding it into "settings": doctors reach Trash
  // today and keep it, and they have no settings permission.
  { key: "trash", label: "Trash" },
  { key: "user_management", label: "User Management" },
  // Not a module: a single switch. Untick View to hide invoice amounts, amounts
  // paid, revenue figures and payment modes from this role everywhere in the app.
  // A role with no row keeps seeing them (see lib/billingVisibility.ts), so the
  // editor treats a missing row as ticked.
  { key: BILLING_AMOUNTS_KEY, label: "Billing amounts & payment modes (untick to hide)", viewOnly: true },
];

/** Rows the editor shows ticked when the role has no row for them yet. */
export const defaultsToVisible = (key: string) => key === BILLING_AMOUNTS_KEY;

export const MODULE_KEYS: string[] = ALL_MODULES.map((m) => m.key);
