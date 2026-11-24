/**
 * What "remove this leave type" is allowed to mean.
 *
 * staff_leave_balances.leave_type_id and leave_applications.leave_type_id are
 * both ON DELETE CASCADE, and leave_types is not in trash_allowed_object().
 * So a plain delete of Casual Leave takes every Casual Leave application and
 * every balance with it, approved history included, with nothing to restore
 * from. Nobody pressing a button labelled Remove expects that.
 *
 * The rule is therefore decided by what actually points at the row:
 *
 *   nothing does   delete it - there is nothing to lose
 *   something does switch it off - hidden from Apply Leave and from the bulk
 *                  allowance update, every row of history left alone, and
 *                  reversible
 *
 * It lives here, pure, because the dialog and the mutation must not be able
 * to disagree about what is about to happen: the dialog says "12
 * applications reference this, so it will be switched off", and the mutation
 * re-counts and asks this same function again before it writes.
 */

export interface LeaveTypeUsage {
  applications: number;
  balances: number;
}

export type RemovalAction = "delete" | "deactivate";

export interface RemovalPlan {
  action: RemovalAction;
  /** The sentence shown before anything happens. */
  reason: string;
  /** The word on the button that carries it out. */
  confirmLabel: string;
}

const count = (n: unknown): number => {
  const v = Number(n ?? 0);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
};

/** Plural that reads correctly at 1, which "1 applications" does not. */
export function usageLabel(usage: LeaveTypeUsage): string {
  const a = count(usage?.applications);
  const b = count(usage?.balances);
  const parts: string[] = [];
  if (a > 0) parts.push(`${a} leave application${a === 1 ? "" : "s"}`);
  if (b > 0) parts.push(`${b} balance${b === 1 ? "" : "s"}`);
  if (parts.length === 0) return "nothing";
  return parts.join(" and ");
}

export function removalPlan(usage: LeaveTypeUsage): RemovalPlan {
  const used = count(usage?.applications) + count(usage?.balances) > 0;
  if (!used) {
    return {
      action: "delete",
      reason:
        "Nothing refers to this leave type, so it will be deleted outright. " +
        "No leave record is affected.",
      confirmLabel: "Delete it",
    };
  }
  return {
    action: "deactivate",
    reason:
      `${usageLabel(usage)} refer to this leave type, so it will be switched ` +
      "off rather than deleted. It disappears from Apply Leave and from the " +
      "allowance update; every existing record stays exactly as it is, and " +
      "you can switch it back on here.",
    confirmLabel: "Switch it off",
  };
}

/** Whether a type is currently switched off. Absent means on, as the column defaults. */
export function isRetired(type: { is_active?: boolean | null } | null | undefined): boolean {
  return type?.is_active === false;
}
