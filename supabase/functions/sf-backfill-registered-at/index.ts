// Backfills patients.sf_registered_at from Salesforce Patient__c.CreatedDate.
//
// Why this exists: patients.created_at is when a row was loaded into this app,
// not when the person became a patient. The history arrived in bulk, so 98% of
// patients carry one of three import dates - 17,242 of them say 2026-04-23.
// Sorting the list newest-first therefore parks the most recent import at the
// top, and that cohort has nothing but a name and a phone number, so whatever
// column sits beside it looks empty. The real dates are in Salesforce.
//
// UPDATE ONLY, and only one column. It calls sf_set_patient_registered_bulk,
// which writes sf_registered_at onto rows whose sf_id already matches. It cannot
// create, delete or otherwise change a patient, and it never touches created_at.
// Rows that already hold the value are skipped, so a re-run costs nothing.
//
// Keyset-paged over Patient__c ordered by Id, so it is resumable and safe to
// stop and restart:
//   cursor - last Patient__c id processed (default "" = start)
//   pages  - Salesforce pages per invocation (default 6, 2000 rows each)
//   dry    - "true" to report what WOULD change without writing anything
// Response carries the next cursor; keep calling until done=true.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { describeSfFailure } from "./sfError.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SALESFORCE_API_KEY = Deno.env.get("SALESFORCE_API_KEY")!;
const GATEWAY = "https://connector-gateway.lovable.dev/salesforce";

const PAGE_ROWS = 2000;
const BATCH = 500;

async function sfQuery(soql: string, signal?: AbortSignal): Promise<any[]> {
  const res = await fetch(`${GATEWAY}/query?q=${encodeURIComponent(soql)}`, {
    signal,
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SALESFORCE_API_KEY,
    },
  });
  if (!res.ok) throw new Error(describeSfFailure(res.status, await res.text()));
  const payload = await res.json();
  return payload.records || [];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  let cursor = url.searchParams.get("cursor") || "";
  const maxPages = Math.max(1, Math.min(20, Number(url.searchParams.get("pages") || "6")));
  const dry = url.searchParams.get("dry") === "true";
  const deadline = Date.now() + 100_000;

  let scanned = 0, updated = 0, wouldUpdate = 0, pages = 0;
  let done = false;

  try {
    while (pages < maxPages && Date.now() < deadline) {
      // Ordered by Id so the cursor is a stable keyset. One row here is one
      // patient, so every row of a page counts - none may be dropped.
      const soql =
        `SELECT Id, CreatedDate FROM Patient__c` +
        (cursor ? ` WHERE Id > '${cursor}'` : ``) +
        ` ORDER BY Id ASC LIMIT ${PAGE_ROWS}`;
      const rows = await sfQuery(soql, AbortSignal.timeout(30_000));
      pages++;
      if (!rows.length) { done = true; break; }
      scanned += rows.length;
      cursor = String(rows[rows.length - 1].Id);

      const payload: { sf_id: string; registered_at: string }[] = [];
      for (const r of rows) {
        const sf_id = String(r.Id || "");
        const created = String(r.CreatedDate || "");
        if (!sf_id || !created) continue;
        payload.push({ sf_id, registered_at: created });
      }

      for (const batch of chunk(payload, BATCH)) {
        if (dry) {
          // Count how many of these we hold and have not already set, without writing.
          const { data, error } = await admin
            .from("patients")
            .select("sf_id")
            .is("sf_registered_at", null)
            .in("sf_id", batch.map((b) => b.sf_id));
          if (error) throw new Error(`dry-run lookup: ${error.message}`);
          wouldUpdate += (data || []).length;
          continue;
        }
        const { data, error } = await admin.rpc("sf_set_patient_registered_bulk", { payload: batch });
        if (error) throw new Error(`sf_set_patient_registered_bulk: ${error.message}`);
        updated += Number(data || 0);
      }

      if (rows.length < PAGE_ROWS) { done = true; break; }
    }

    return new Response(
      JSON.stringify({ ok: true, dry, scanned, pages, updated, wouldUpdate, done, cursor }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    // The cursor comes back on failure too, so a run resumes from where it
    // stopped rather than rescanning from the beginning.
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message, dry, scanned, updated, done: false, cursor }, null, 2),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
