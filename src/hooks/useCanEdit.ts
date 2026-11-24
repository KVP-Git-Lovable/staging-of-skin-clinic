import { useAuth } from "@/hooks/useAuth";
import { canActOnModule } from "@/lib/staffAccess";

/**
 * May this person create, edit or delete in a module?
 *
 * These three existed from the day the permission table was built and had
 * not one call site, so can_create / can_edit / can_delete were stored on
 * every role, editable in User Management, and enforced nowhere. They
 * answer through canActOnModule now rather than reading the map themselves:
 * they used to return `?? false` for a missing row, which is wrong for a
 * role nobody has configured yet - an empty map means "not set up", and
 * those people keep everything.
 */
export function useCanEdit(moduleKey: string): boolean {
  const { isAdmin, permissions } = useAuth();
  return canActOnModule({ isAdmin, permissions, moduleKey, action: "can_edit" });
}

export function useCanCreate(moduleKey: string): boolean {
  const { isAdmin, permissions } = useAuth();
  return canActOnModule({ isAdmin, permissions, moduleKey, action: "can_create" });
}

export function useCanDelete(moduleKey: string): boolean {
  const { isAdmin, permissions } = useAuth();
  return canActOnModule({ isAdmin, permissions, moduleKey, action: "can_delete" });
}
