// Sends one clinic invoice to Zoho Books through the shared Zoho client:
// find-or-create the customer by patient name, create the invoice (lines,
// total, invoice number as reference, due date), issue it, and record any
// amount already paid as a customer payment against it.
//
// Cancelled and merged invoices are refused. zoho_invoice_id is written as
// soon as Zoho has created the invoice - from then on a resend would
// duplicate the bill, so if issuing it or recording the payment fails
// afterwards that is returned as a warning, not as a failure.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, requireStaffId } from "../_shared/comms-auth.ts";
import { findOrCreateZohoContact, zoho, zohoConfigured, zohoOrgQuery, zohoRefused as refused } from "../_shared/zoho-books.ts";
import { buildZohoInvoiceBody, buildZohoPaymentBody, zohoInvoiceBlocker, type InvoiceForZoho } from "../_shared/zoho-invoice.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireStaffId(req);
  if (auth instanceof Response) return auth;

  if (!zohoConfigured()) {
    return json({ error: "Zoho Books is not connected to this app" }, 500);
  }

  let invoiceId: unknown;
  try { ({ invoiceId } = await req.json()); } catch { /* handled below */ }
  if (typeof invoiceId !== "string" || !/^[0-9a-f-]{36}$/i.test(invoiceId)) {
    return json({ error: "invoiceId is required" }, 400);
  }

  // Caller-scoped client: read and marked under the staff member's own access.
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization")! } },
  });
  const { data: row, error: readErr } = await db
    .from("invoices")
    .select("id, invoice_number, patient_name, created_at, due_date, total_amount, paid_amount, tax_amount, line_items, services, payment_mode, payment_splits, status, cancelled_at, merged_into_invoice_id, zoho_invoice_id, zoho_invoice_synced_at")
    .eq("id", invoiceId)
    .maybeSingle();
  if (readErr) return json({ error: readErr.message }, 500);
  if (!row) return json({ error: "Invoice not found" }, 404);
  const inv = row as unknown as InvoiceForZoho & { patient_name: string | null; zoho_invoice_synced_at: string | null };

  const blocker = zohoInvoiceBlocker(inv);
  if (blocker) {
    return json({ error: blocker, zoho_invoice_id: inv.zoho_invoice_id, zoho_invoice_synced_at: inv.zoho_invoice_synced_at }, inv.zoho_invoice_id ? 409 : 422);
  }
  const customerName = (inv.patient_name ?? "").trim();
  if (!customerName) return json({ error: "This invoice has no patient name, so there is no Zoho Books customer to bill" }, 422);

  const org = await zohoOrgQuery();
  if (!org.ok) return refused(org);
  const q = org.q;

  // 1. Customer: find by exact patient name, otherwise create it.
  const customer = await findOrCreateZohoContact(q, customerName, "customer");
  if (!customer.ok) return refused(customer);
  if (!customer.id) return json({ error: "Zoho Books did not return a customer id" }, 502);

  // 2. Invoice.
  const created = await zoho(`/invoices?${q}`, { method: "POST", body: buildZohoInvoiceBody(inv, customer.id) });
  if (!created.ok) return refused(created);
  const zohoInvoiceId = created.data?.invoice?.invoice_id as string | undefined;
  if (!zohoInvoiceId) return json({ error: "Zoho Books did not return an invoice id" }, 502);

  const syncedAt = new Date().toISOString();
  const { data: marked, error: markErr } = await db
    .from("invoices")
    .update({ zoho_invoice_id: zohoInvoiceId, zoho_invoice_synced_at: syncedAt })
    .eq("id", invoiceId)
    .is("zoho_invoice_id", null)
    .select("id")
    .maybeSingle();
  if (markErr || !marked) {
    console.error(`Invoice ${invoiceId} created in Zoho as ${zohoInvoiceId} but not marked: ${markErr?.message ?? "already marked"}`);
    return json({ error: `Created in Zoho Books (invoice ${zohoInvoiceId}) but could not be marked here: ${markErr?.message ?? "already marked"}` }, 500);
  }

  const warnings: string[] = [];

  // 3. Issue it, so an unpaid balance shows as outstanding rather than draft.
  const issued = await zoho(`/invoices/${zohoInvoiceId}/status/sent?${q}`, { method: "POST" });
  if (!issued.ok) warnings.push(`Zoho Books kept it as a draft: ${issued.message}`);

  // 4. What was already paid, as a customer payment against the invoice.
  const payment = buildZohoPaymentBody(inv, customer.id, zohoInvoiceId);
  if (payment) {
    const paid = await zoho(`/customerpayments?${q}`, { method: "POST", body: payment });
    if (!paid.ok) warnings.push(`The payment of ₹${payment.amount} was not recorded in Zoho Books: ${paid.message}`);
  }

  return json({
    zoho_invoice_id: zohoInvoiceId,
    zoho_invoice_synced_at: syncedAt,
    ...(warnings.length ? { warning: warnings.join(" ") } : {}),
  });
});
