// Pure helpers for pushing a clinic expense to Zoho Books. Kept free of I/O so
// the rules (exact-name account matching, no fallback, Zoho's own error text)
// can be unit-tested.
import { findContactId, zohoFailure } from "./zoho-books.ts";

export { zohoFailure };

export interface ZohoAccount {
  account_id: string;
  account_name: string;
}

// The "paid from" account Zoho requires on every expense. Resolved by exact
// name from Zoho's own paid-through list; if it is missing, nothing is
// substituted and Zoho's refusal is shown.
export const PAID_THROUGH_ACCOUNT_NAME = "Petty Cash";

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

// Exact (trimmed, case-insensitive) name match only. Never a "closest" account.
export function findAccountIdByName(accounts: ZohoAccount[] | null | undefined, name: string | null | undefined): string | null {
  const wanted = norm(name);
  if (!wanted) return null;
  const hit = (accounts ?? []).find((a) => norm(a.account_name) === wanted);
  return hit?.account_id ?? null;
}

export function findVendorId(
  contacts: { contact_id: string; contact_name: string; contact_type?: string }[] | null | undefined,
  vendorName: string,
): string | null {
  return findContactId(contacts, vendorName, "vendor");
}

export function zohoDescription(title: string, description: string | null | undefined): string {
  const t = (title ?? "").trim();
  const d = (description ?? "").trim();
  return d ? `${t} - ${d}` : t;
}

export interface ExpenseForZoho {
  amount: number | string;
  expense_date: string;
  title: string;
  description: string | null;
  categoryName: string | null;
}

// Builds the Zoho expense body. When the category name matches a Zoho expense
// account its id is used (Zoho rejects account_name even for a real account);
// when it does not, the name is sent as-is so Zoho returns its own refusal
// ("Please enter valid expense account") instead of us picking another account.
export function buildZohoExpenseBody(
  exp: ExpenseForZoho,
  expenseAccounts: ZohoAccount[],
  paidThroughAccounts: ZohoAccount[],
  vendorId: string | null,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    date: exp.expense_date,
    amount: Number(exp.amount),
    description: zohoDescription(exp.title, exp.description),
  };
  const accountId = findAccountIdByName(expenseAccounts, exp.categoryName);
  if (accountId) body.account_id = accountId;
  else body.account_name = (exp.categoryName ?? "").trim();
  const paidThroughId = findAccountIdByName(paidThroughAccounts, PAID_THROUGH_ACCOUNT_NAME);
  if (paidThroughId) body.paid_through_account_id = paidThroughId;
  if (vendorId) body.vendor_id = vendorId;
  return body;
}
