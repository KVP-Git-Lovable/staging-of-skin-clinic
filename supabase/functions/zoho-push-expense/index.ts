// Sends one clinic expense to Zoho Books through the linked Zoho Books
// connector: find-or-create the vendor by name, then create the expense with
// the category's name as the Zoho expense account. Writes zoho_expense_id /
// zoho_synced_at only after Zoho accepts it; on refusal returns Zoho's message.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, requireStaffId } from "../_shared/comms-auth.ts";
import { findOrCreateZohoContact, zoho, zohoConfigured, zohoOrgQuery, zohoRefused as refused } from "../_shared/zoho-books.ts";
import { buildZohoExpenseBody, type ZohoAccount } from "../_shared/zoho-expense.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireStaffId(req);
  if (auth instanceof Response) return auth;

  if (!zohoConfigured()) {
    return json({ error: "Zoho Books is not connected to this app" }, 500);
  }

  let expenseId: unknown;
  try { ({ expenseId } = await req.json()); } catch { /* handled below */ }
  if (typeof expenseId !== "string" || !/^[0-9a-f-]{36}$/i.test(expenseId)) {
    return json({ error: "expenseId is required" }, 400);
  }

  // Caller-scoped client: the expense is read and marked under the staff
  // member's own access, not with elevated rights.
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization")! } },
  });
  const { data: exp, error: readErr } = await db
    .from("expenses")
    .select("id, title, description, amount, expense_date, vendor_name, zoho_expense_id, zoho_synced_at, expense_categories(name)")
    .eq("id", expenseId)
    .maybeSingle();
  if (readErr) return json({ error: readErr.message }, 500);
  if (!exp) return json({ error: "Expense not found" }, 404);
  if (exp.zoho_expense_id) {
    return json({ error: "This expense is already in Zoho Books", zoho_expense_id: exp.zoho_expense_id, zoho_synced_at: exp.zoho_synced_at }, 409);
  }

  const org = await zohoOrgQuery();
  if (!org.ok) return refused(org);
  const q = org.q;

  // 1. Vendor: find by exact name, otherwise create it.
  let vendorId: string | null = null;
  const vendorName = (exp.vendor_name ?? "").trim();
  if (vendorName) {
    const vendor = await findOrCreateZohoContact(q, vendorName, "vendor");
    if (!vendor.ok) return refused(vendor);
    vendorId = vendor.id;
  }

  // 2. Expense: account resolved by the category's exact name.
  const page = await zoho(`/expenses/editpage?${q}`);
  if (!page.ok) return refused(page);
  const category = Array.isArray(exp.expense_categories) ? exp.expense_categories[0] : exp.expense_categories;
  const body = buildZohoExpenseBody(
    {
      amount: exp.amount,
      expense_date: exp.expense_date,
      title: exp.title,
      description: exp.description,
      categoryName: (category as { name?: string } | null)?.name ?? null,
    },
    (page.data?.expense_accounts ?? []) as ZohoAccount[],
    (page.data?.paidthrough_accounts_list ?? []) as ZohoAccount[],
    vendorId,
  );
  const created = await zoho(`/expenses?${q}`, { method: "POST", body });
  if (!created.ok) return refused(created);
  const zohoExpenseId = created.data?.expense?.expense_id as string | undefined;
  if (!zohoExpenseId) return json({ error: "Zoho Books did not return an expense id" }, 502);

  const syncedAt = new Date().toISOString();
  const { data: marked, error: markErr } = await db
    .from("expenses")
    .update({ zoho_expense_id: zohoExpenseId, zoho_synced_at: syncedAt })
    .eq("id", expenseId)
    .is("zoho_expense_id", null)
    .select("id")
    .maybeSingle();
  if (markErr || !marked) {
    console.error(`Expense ${expenseId} created in Zoho as ${zohoExpenseId} but not marked: ${markErr?.message ?? "already marked"}`);
    return json({ error: `Created in Zoho Books (expense ${zohoExpenseId}) but could not be marked here: ${markErr?.message ?? "already marked"}` }, 500);
  }

  return json({ zoho_expense_id: zohoExpenseId, zoho_synced_at: syncedAt });
});
