import { canViewModule } from "@/lib/staffAccess";

/**
 * Which dashboard a person gets.
 *
 * The dashboard had no idea who was looking at it. In 805 lines of
 * src/pages/Index.tsx the only role-derived value was canSeeBilling, which
 * hides money and nothing else - so a therapist signing in landed on the
 * clinic's whole day: 39 appointments, every doctor's name, the NPS score
 * and the pending invoices.
 *
 * ── Why permission keys rather than role names ──
 *
 * `roleName === "Therapist"` would work today and break the first time the
 * clinic makes a role of their own, or renames one. These are two ordinary
 * rows in role_module_permissions, so they appear in the User Management
 * matrix for free and the clinic can move somebody between dashboards
 * without a deploy.
 *
 * The two conventions from canViewModule are kept exactly, because breaking
 * either locks real people out of their own clinic:
 *
 *   - an admin is decided first and never through the map, which useAuth
 *     leaves EMPTY for them on purpose;
 *   - a non-admin with an empty map is a role nobody has configured yet, and
 *     keeps everything.
 */

export type DashboardScope =
  /** The clinic's figures: KPIs, charts, filters, pending invoices. */
  | "full"
  /** Their own working day, and the appointments assigned to them. */
  | "my_day"
  /** Their own working day, and nothing else. */
  | "attendance_only";

/** The clinic-wide figures. */
export const DASHBOARD_CLINIC_KEY = "dashboard_clinic";
/** Today's appointments assigned to the person looking. */
export const DASHBOARD_MY_APPOINTMENTS_KEY = "dashboard_my_appointments";

export function dashboardScope(input: {
  isAdmin: boolean;
  permissions: Record<string, { can_view?: boolean } | undefined>;
}): DashboardScope {
  const may = (moduleKey: string) => canViewModule({ ...input, moduleKey });
  // Checked first: somebody holding both is being shown the clinic, and the
  // smaller list would be a strange way to express "and also everything".
  if (may(DASHBOARD_CLINIC_KEY)) return "full";
  if (may(DASHBOARD_MY_APPOINTMENTS_KEY)) return "my_day";
  return "attendance_only";
}
