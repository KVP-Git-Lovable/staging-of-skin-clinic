/**
 * Whether the signed-in user may see billing amounts and payment modes.
 *
 * It is a permission row like any module's: role_module_permissions with
 * module_key 'billing_amounts'. Only an explicit can_view = false hides money.
 * A role with no such row - every role that existed before this key did - keeps
 * seeing everything, so adding it changes nothing for anyone until an
 * administrator unticks it for a role (the Therapist role ships unticked).
 *
 * Mirrors the conventions in ProtectedRoute / AppSidebar:
 *   - an administrator is never restricted;
 *   - an empty permissions map (not a staff login, or still loading) is not a
 *     restriction either.
 *
 * This hides money in the application. It is not a database rule: the invoices
 * table is still readable by any signed-in staff account.
 */
export const BILLING_AMOUNTS_KEY = "billing_amounts";

type PermLike = { can_view?: boolean | null };

/**
 * True when a line of free text (such as an AI-written insight) talks about
 * money: a currency symbol or "Rs" amount, or words like lifetime value, spend,
 * revenue, billed, paid, payment, invoice, price. Used to drop such lines for a
 * role that may not see billing amounts, since generated text can quote figures
 * that no column controls.
 */
const MONEY_TEXT =
  /₹|\brs\.?\s*\d|\binr\b|\blakh\b|\blifetime\s+(value|spend|billing)\b|\b(spen[dt]|spending|revenue|billed|billing|invoice[sd]?|paid|payments?|prices?|pricing|outstanding|balance due|discount(ed)?)\b/i;

export function mentionsMoney(text: unknown): boolean {
  return typeof text === "string" && MONEY_TEXT.test(text);
}

export function canSeeBillingAmounts(args: {
  isAdmin: boolean;
  permissions: Record<string, PermLike | undefined>;
}): boolean {
  const { isAdmin, permissions } = args;
  if (isAdmin) return true;
  if (Object.keys(permissions).length === 0) return true;
  const row = permissions[BILLING_AMOUNTS_KEY];
  if (!row) return true;
  return row.can_view !== false;
}
