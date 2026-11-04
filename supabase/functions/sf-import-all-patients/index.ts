// Creates an app patient record for EVERY Salesforce patient, including those
// with no appointment, bill or diagnosis.
//
// Why this exists alongside sf-link-missing-patients: that function walks
// `FROM Appointment__c`, so it can only ever find patients who appear on an
// appointment. Salesforce has 27,006 patients but only 19,972 of them appear on
// one, which is why ~3,670 patients were never created here and could not be
// found in the app at all. This walks Patient__c itself, so nothing is skipped
// for having no visit history.
//
// INSERT ONLY. It calls the same sf_link_patients_bulk RPC the appointment-based
// import uses, which:
//   * drops any sf_id already present locally, so re-running creates nothing
//     twice and never touches an existing patient's data;
//   * links a Salesforce id onto an existing local patient only when exactly one
//     unlinked local patient shares that 10-digit phone (never on an ambiguous
//     match - families here share a household number);
//   * inserts the rest as new patients.
// Nothing is updated, deleted or overwritten.
//
// Keyset-paged over Patient__c ordered by Id, so it is resumable and safe to
// stop and restart:
//   cursor - last Patient__c id processed (default "" = start)
//   pages  - Salesforce pages per invocation (default 6, 2000 rows each)
//   dry    - "true" to report what WOULD be created without writing anything
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

  let scanned = 0, created = 0, linked = 0, existing = 0, wouldCreate = 0, pages = 0;
  let done = false;

  try {
    while (pages < maxPages && Date.now() < deadline) {
      // Ordered by Id so the cursor is a stable keyset. Unlike the
      // appointment-based walk, one row here IS one patient, so the last row of
      // a page is complete and must be processed - dropping it the way that
      // function does would skip a patient on every page boundary.
      const soql =
        `SELECT Id, Patient_Name__c, Mobile_Number__c FROM Patient__c` +
        (cursor ? ` WHERE Id > '${cursor}'` : ``) +
        ` ORDER BY Id ASC LIMIT ${PAGE_ROWS}`;
      const rows = await sfQuery(soql, AbortSignal.timeout(30_000));
      pages++;
      if (!rows.length) { done = true; break; }
      scanned += rows.length;
      cursor = String(rows[rows.length - 1].Id);

      const payload: { sf_id: string; name: string; phone: string }[] = [];
      for (const r of rows) {
        const sf_id = String(r.Id || "");
        if (!sf_id) continue;
        const phone = String(r.Mobile_Number__c || "").replace(/\D/g, "").slice(-10);
        payload.push({
          sf_id,
          name: String(r.Patient_Name__c || "Unknown").trim() || "Unknown",
          phone: phone.length === 10 ? phone : "",
        });
      }

      for (const batch of chunk(payload, BATCH)) {
        if (dry) {
          // Count how many of these are already here, without writing.
          const { data, error } = await admin
            .from("patients")
            .select("sf_id")
            .in("sf_id", batch.map((b) => b.sf_id));
          if (error) throw new Error(`dry-run lookup: ${error.message}`);
          const present = (data || []).length;
          existing += present;
          wouldCreate += batch.length - present;
          continue;
        }
        const { data, error } = await admin.rpc("sf_link_patients_bulk", { payload: batch });
        if (error) throw new Error(`sf_link_patients_bulk: ${error.message}`);
        const row = Array.isArray(data) ? data[0] : data;
        linked += Number(row?.linked || 0);
        created += Number(row?.created || 0);
        existing += batch.length - Number(row?.linked || 0) - Number(row?.created || 0);
      }

      if (rows.length < PAGE_ROWS) { done = true; break; }
    }

    return new Response(
      JSON.stringify(
        { ok: true, dry, scanned, pages, created, linked, existing, wouldCreate, done, cursor },
        null,
        2,
      ),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    // The cursor is returned on failure too, so a run can resume from where it
    // stopped rather than rescanning from the beginning.
    return new Response(
      JSON.stringify(
        { ok: false, error: (e as Error).message, dry, scanned, created, linked, done: false, cursor },
        null,
        2,
      ),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
