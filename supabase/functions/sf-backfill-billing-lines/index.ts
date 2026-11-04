// Pages the ENTIRE Billing_Line_Item__c object into public.sf_billing_line_items.
//
// Why this exists: sf-import-clinical only stages line items for patients it
// walks, so the 46,913 invoices imported before line items existed have no
// staged lines. This walks the object itself, independent of patients.
//
// READ-AND-STAGE ONLY. It never touches invoices or line_items - it writes one
// table, sf_billing_line_items, upserting on sf_id. Values are stored exactly
// as Salesforce sends them: blanks are NOT coerced to zero and nothing is
// rounded, so a NULL tax ("Salesforce recorded nothing") stays distinct from a
// zero tax ("Salesforce recorded that no tax was charged"). The reconciliation
// depends on telling those apart.
//
// Resumable, because one invocation cannot finish inside the platform timeout:
//   cursor - a CreatedDate; resumes from WHERE CreatedDate > cursor
// It stops cleanly at ~90s and returns { staged, last_created_date, done };
// feed last_created_date back in as cursor until done = true.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SALESFORCE_API_KEY = Deno.env.get("SALESFORCE_API_KEY")!;
const GATEWAY = "https://connector-gateway.lovable.dev/salesforce";

const SELECT =
  "SELECT Id, Billing__c, Service1__c, Products__c, Quantity__c, MRP_Per_Unit__c, " +
  "Total_Price__c, GST__c, Tax_Amount__c, CGST_SGST__c, Tax_applicable__c, CreatedDate " +
  "FROM Billing_Line_Item__c";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function sfGet(path: string, signal?: AbortSignal): Promise<any> {
  const res = await fetch(`${GATEWAY}${path}`, {
    signal,
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SALESFORCE_API_KEY,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Salesforce query failed (HTTP ${res.status}): ${body.slice(0, 200)}`);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const cursor = (url.searchParams.get("cursor") || "").trim();
  const deadline = Date.now() + 90_000;

  let staged = 0;
  let lastCreatedDate: string | null = cursor || null;
  let done = false;

  try {
    // CreatedDate literals are unquoted in SOQL. The cursor only ever comes
    // back from a previous run of this function, but validate it anyway so
    // nothing else can be injected into the query.
    if (cursor && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(cursor)) {
      throw new Error(`cursor must be an ISO datetime, got: ${cursor}`);
    }

    const soql = `${SELECT}${cursor ? ` WHERE CreatedDate > ${cursor}` : ""} ORDER BY CreatedDate`;
    let payload = await sfGet(`/query?q=${encodeURIComponent(soql)}`, AbortSignal.timeout(60_000));

    while (true) {
      const records: any[] = payload.records || [];
      if (records.length) {
        const rows = records.map((l) => ({
          sf_id: l.Id,
          billing_sf_id: l.Billing__c,
          service_name: l.Service1__c,
          product_name: l.Products__c,
          quantity: l.Quantity__c,
          mrp_per_unit: l.MRP_Per_Unit__c,
          total_price: l.Total_Price__c,
          gst_rate: l.GST__c,
          tax_amount: l.Tax_Amount__c,
          cgst_sgst: l.CGST_SGST__c,
          tax_applicable: l.Tax_applicable__c,
          sf_created_at: l.CreatedDate,
        }));
        for (const batch of chunk(rows, 200)) {
          const { error } = await admin.from("sf_billing_line_items").upsert(batch, { onConflict: "sf_id" });
          if (error) throw new Error(`sf_billing_line_items upsert: ${error.message}`);
          staged += batch.length;
        }
        // Ordered by CreatedDate, so the last record of the last page written
        // is a safe resume point. Re-reading a row is harmless - the upsert
        // is idempotent.
        lastCreatedDate = String(records[records.length - 1].CreatedDate);
      }

      if (payload.done || !payload.nextRecordsUrl) { done = true; break; }
      if (Date.now() > deadline) break;

      // The gateway base already carries /services/data/v62.0, so strip that
      // prefix off Salesforce's nextRecordsUrl before appending it.
      const next = String(payload.nextRecordsUrl).replace(/^\/services\/data\/v\d+\.\d+/, "");
      payload = await sfGet(next, AbortSignal.timeout(60_000));
    }

    return new Response(
      JSON.stringify({ ok: true, staged, last_created_date: lastCreatedDate, done }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    // The cursor comes back on failure too, so a run resumes from where it
    // stopped rather than starting over.
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message, staged, last_created_date: lastCreatedDate, done: false }, null, 2),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
