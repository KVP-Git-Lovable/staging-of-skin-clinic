// Who may open a page of the clinic app. The database enforces the same rule
// (signed_in_must_be_staff), so this only decides what screen to show.
export type StaffAccess = "sign_in" | "deactivated" | "not_staff" | "allowed" | "denied";

export function staffAccess(input: {
  hasSession: boolean;
  isStaff: boolean;
  staffDeactivated: boolean;
  isAdmin: boolean;
  permissions: Record<string, { can_view?: boolean } | undefined>;
  moduleKey: string;
}): StaffAccess {
  if (!input.hasSession) return "sign_in";
  if (input.staffDeactivated) return "deactivated";
  // A signed-in account with no staff record (e.g. a patient) never gets in.
  if (!input.isStaff) return "not_staff";
  return canViewModule(input) ? "allowed" : "denied";
}

/**
 * Whether this person may see a module at all - the one answer behind both the
 * route guard above and the left-hand menu.
 *
 * It is a separate exported function, rather than the three lines inlined in
 * each place, because they were not the same three lines: AppSidebar's canView
 * was `return true` with a note saying "for now", so the menu offered all 47
 * pages to everyone and the route guard then refused most of them. A menu that
 * disagrees with the guard is worse than no menu gating at all - it sends
 * people to Access Denied and teaches them the app is broken.
 *
 * Two conventions it has to keep, both relied on elsewhere:
 *
 *   - An admin's permission map is EMPTY by design (useAuth sets `{}` and
 *     returns early), so admin is checked first and never through the map.
 *   - A non-admin with an empty map keeps full access. That is what a role
 *     nobody has configured yet looks like, and locking those people out of
 *     their own clinic on an upgrade would be the worse failure.
 */
export function canViewModule(input: {
  isAdmin: boolean;
  permissions: Record<string, { can_view?: boolean } | undefined>;
  moduleKey: string;
}): boolean {
  return canActOnModule({ ...input, action: "can_view" });
}

export type ModuleAction = "can_view" | "can_create" | "can_edit" | "can_delete";

/**
 * Whether this person may do a thing to a module - view, create, edit or
 * delete it.
 *
 * can_create, can_edit and can_delete have been stored on every role and
 * editable in User Management since the permission table was built, and
 * enforced NOWHERE: useCanEdit and its two siblings existed with not one
 * call site in the app. So a therapist's list offered New Appt, a pencil
 * and a delete button, and the only thing stopping them was that nobody
 * had tried.
 *
 * The same two conventions as viewing, and for the same reason - getting
 * either wrong does not show somebody too much, it locks real people out:
 *
 *   - an admin is decided first and never through the map, which useAuth
 *     leaves EMPTY for them on purpose;
 *   - a non-admin with an empty map is a role nobody has configured yet and
 *     keeps everything. The old useCanEdit read `?? false` here, which would
 *     have taken every button away from exactly those people.
 */
export function canActOnModule(input: {
  isAdmin: boolean;
  permissions: Record<string, { can_view?: boolean; can_create?: boolean; can_edit?: boolean; can_delete?: boolean } | undefined>;
  moduleKey: string;
  action: ModuleAction;
}): boolean {
  if (input.isAdmin) return true;
  if (input.permissions[input.moduleKey]?.[input.action]) return true;
  return Object.keys(input.permissions).length === 0;
}
