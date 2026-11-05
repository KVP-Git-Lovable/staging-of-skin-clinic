import { useAuth } from "@/hooks/useAuth";
import { canSeeBillingAmounts } from "@/lib/billingVisibility";

/**
 * True unless the signed-in user's role has had "Billing amounts & payment
 * modes" switched off. Use it to leave out invoice totals, amounts paid,
 * balances, revenue figures and payment modes. See lib/billingVisibility.ts.
 */
export function useCanSeeBillingAmounts(): boolean {
  const { isAdmin, permissions } = useAuth();
  return canSeeBillingAmounts({ isAdmin, permissions });
}
