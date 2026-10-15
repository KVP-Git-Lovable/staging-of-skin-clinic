import { supabase } from "@/integrations/supabase/client";
import { readMetaApiError } from "@/lib/metaErrors";

/**
 * Ad-account billing helpers. Meta exposes billing read-only; money is added on
 * Meta's own payment page, which the app opens in a popup (see openMetaWindow).
 */

export type FundingSource = {
  id: string | null;
  type: number | null;
  display_string: string | null;
  coupon: unknown;
};

export type BillingAccount = {
  id: string;
  name: string | null;
  currency: string | null;
  account_status: number | null;
  disable_reason: number | null;
  is_prepay_account: boolean;
  amount_spent: number | null;
  balance: number | null;
  spend_cap: number | null;
  funding_source: FundingSource | null;
  expired_funding_source: FundingSource | null;
  business_name: string | null;
  checked_at: string;
};

export type BillingStatus = {
  account: BillingAccount;
  recharge_url: string;
  fallback_url: string;
};

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

/** Meta `account_status` codes. */
export const ACCOUNT_STATUS_LABELS: Record<number, { label: string; variant: BadgeVariant; hint: string }> = {
  1: { label: "Active", variant: "default", hint: "Ads can run." },
  2: { label: "Disabled", variant: "destructive", hint: "Meta has disabled this ad account. Check Account Quality in Ads Manager." },
  3: { label: "Unsettled", variant: "destructive", hint: "There is an unpaid balance. Add money or update the payment method." },
  7: { label: "Pending risk review", variant: "secondary", hint: "Meta is reviewing the account. Ads may not deliver until it completes." },
  8: { label: "Pending settlement", variant: "secondary", hint: "A payment is being processed by Meta." },
  9: { label: "In grace period", variant: "destructive", hint: "A payment failed. Add money or fix the payment method before ads stop." },
  100: { label: "Pending closure", variant: "secondary", hint: "The account is being closed." },
  101: { label: "Closed", variant: "secondary", hint: "The account is closed." },
};

export function accountStatusInfo(code: number | null | undefined) {
  if (code === null || code === undefined) return { label: "Unknown", variant: "outline" as BadgeVariant, hint: "" };
  return ACCOUNT_STATUS_LABELS[code] ?? { label: `Status ${code}`, variant: "outline" as BadgeVariant, hint: "" };
}

/** Meta `funding_source_details.type` codes. */
export const FUNDING_TYPE_LABELS: Record<number, string> = {
  0: "Not set",
  1: "Credit / debit card",
  2: "Facebook wallet",
  3: "Paid credit",
  4: "Extended credit (monthly invoicing)",
  5: "Order",
  6: "Invoice",
  7: "Facebook token",
  8: "External funding",
  12: "PayPal",
  13: "PayPal billing agreement",
  15: "External deposit",
  17: "Direct debit",
  19: "Alternative payment (UPI, net banking, Paytm)",
  20: "Stored balance",
};

export function fundingTypeLabel(type: number | null | undefined): string {
  if (type === null || type === undefined) return "Payment method";
  return FUNDING_TYPE_LABELS[type] ?? "Other payment method";
}

/** Meta reports amounts in minor units (paise for INR). */
export function formatMinor(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  const code = currency || "INR";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${code}`;
  }
}

export async function fetchBillingStatus(adAccountId?: string | null): Promise<BillingStatus> {
  const { data, error } = await supabase.functions.invoke("meta-api", {
    body: { action: "billing_status", payload: adAccountId ? { ad_account_id: adAccountId } : {} },
  });
  if (error || data?.error) throw new Error(await readMetaApiError(error, data));
  return { account: data.account as BillingAccount, recharge_url: String(data.recharge_url), fallback_url: String(data.fallback_url) };
}

/**
 * Opens a Meta page in a named popup (same shape as the Facebook login popup) and
 * calls `onClosed` once the user closes it. Returns a stop() for cleanup, or null
 * when the browser blocked the popup.
 */
export function openMetaWindow(url: string, name: string, onClosed: () => void): (() => void) | null {
  const popup = window.open(url, name, "width=1100,height=800");
  if (!popup) return null;
  try { popup.opener = null; } catch { /* ignore */ }
  try { popup.focus(); } catch { /* ignore */ }
  let stopped = false;
  const timer = window.setInterval(() => {
    if (stopped) return;
    if (popup.closed) {
      stopped = true;
      window.clearInterval(timer);
      onClosed();
    }
  }, 1000);
  return () => { stopped = true; window.clearInterval(timer); };
}
