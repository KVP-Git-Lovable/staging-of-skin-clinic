// Sends one clinic expense to Zoho Books through the linked Zoho Books
// connector: find-or-create the vendor by name, then create the expense with
// the category's name as the Zoho expense account. Writes zoho_expense_id /
// zoho_synced_at only after Zoho accepts it; on refusal returns Zoho's message.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, requireStaffId } from "../_shared/comms-auth.ts";
import { buildZohoExpenseBody, findVendorId, zohoFailure, type ZohoAccount } from "../_shared/zoho-expense.ts";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/zoho_books";

type ZohoResult = { ok: true; data: any } | { ok: false; status: number; message: string };

async function zoho(path: string, init: { method?: string; body?: unknown } = {}): Promise<ZohoResult> {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      "X-Connection-Api-Key": Deno.env.get("ZOHO_BOOKS_API_KEY")!,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let payload: unknown = null;
  try { payload = JSON.parse(text); } catch { /* non-JSON error body */ }
  const failure = zohoFailure(res.status, payload, text);
  if (failure) {
    console.error(`Zoho ${init.method ?? "GET"} ${path.split("?")[0]} failed [${res.status}]: ${text}`);
    return { ok: false, status: res.status, message: failure };
  }
  return { ok: true, data: payload };
}

const refused = (r: { status: number; message: string }) =>
  json({ error: r.message, source: "zoho" }, r.status >= 400 && r.status < 600 ? r.status : 502);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireStaffId(req);
  if (auth instanceof Response) return auth;

  if (!Deno.env.get("LOVABLE_API_KEY") || !Deno.env.get("ZOHO_BOOKS_API_KEY")) {
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

  const orgs = await zoho("/organizations");
  if (!orgs.ok) return refused(orgs);
  const orgList = (orgs.data?.organizations ?? []) as { organization_id: string; is_default_org?: boolean }[];
  const org = orgList.find((o) => o.is_default_org) ?? orgList[0];
  if (!org) return json({ error: "No Zoho Books organisation found" }, 502);
  const q = `organization_id=${encodeURIComponent(org.organization_id)}`;

  // 1. Vendor: find by exact name, otherwise create it.
  let vendorId: string | null = null;
  const vendorName = (exp.vendor_name ?? "").trim();
  if (vendorName) {
    const found = await zoho(`/contacts?${q}&contact_type=vendor&contact_name=${encodeURIComponent(vendorName)}`);
    if (!found.ok) return refused(found);
    vendorId = findVendorId(found.data?.contacts, vendorName);
    if (!vendorId) {
      const created = await zoho(`/contacts?${q}`, { method: "POST", body: { contact_name: vendorName, contact_type: "vendor" } });
      if (!created.ok) return refused(created);
      vendorId = created.data?.contact?.contact_id ?? null;
    }
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
