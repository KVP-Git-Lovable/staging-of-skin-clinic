/**
 * Whether a role may be deleted, decided here rather than in the screen.
 *
 * ── The hazard this exists for ──
 *
 * `staff.role_id` is ON DELETE SET NULL. Delete a role somebody holds and the
 * database does not complain: it blanks their role. Those people keep their
 * logins and quietly lose their permissions, with nothing on screen to say
 * why, and nothing to put it back from - the old role_id is gone.
 *
 * So a role in use is refused, and refused by name and number, because "you
 * cannot delete this" without saying who is on it sends somebody hunting
 * through the Users tab.
 *
 * The same rule is enforced again by a trigger on user_roles_config
 * (20261111120000). This is the half that explains itself; that is the half
 * that holds when this one is wrong or bypassed.
 *
 * Same shape as reviewRequestState and followupShareState: the component
 * renders a decision instead of making one, which is the only way it can be
 * tested without mounting the whole User Management page.
 */

export interface DeletableRole {
  id?: string | null;
  name?: string | null;
  /** Admin, Doctor, Receptionist and Pharmacist. Seeded, and depended on. */
  is_system?: boolean | null;
}

export interface RoleDeleteState {
  canDelete: boolean;
  /** Shown when the button is disabled. Empty when it is not. */
  reason: string;
}

/** "4 staff" / "1 staff member" - the count is the whole point of the message. */
function peopleOn(count: number): string {
  return count === 1 ? "1 staff member" : `${count} staff`;
}

export function roleDeleteState(input: {
  role: DeletableRole | null | undefined;
  staffCount: number;
}): RoleDeleteState {
  const { role } = input;
  if (!role?.id) {
    return { canDelete: false, reason: "Select a role first." };
  }
  if (role.is_system) {
    // Not a judgement about tidiness: the app seeds these four and new staff
    // are given them by name, so a clinic that deleted Admin could not make
    // another administrator.
    return {
      canDelete: false,
      reason: `${role.name || "This role"} is a system role and cannot be deleted.`,
    };
  }
  const count = Number(input.staffCount) || 0;
  if (count > 0) {
    return {
      canDelete: false,
      reason: `${peopleOn(count)} still ${count === 1 ? "has" : "have"} this role. Move them to another role on the Users tab first.`,
    };
  }
  return { canDelete: true, reason: "" };
}
