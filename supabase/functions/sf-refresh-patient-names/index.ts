// Corrects patient names from Salesforce Patient__c.Patient_Name__c.
//
// Why this is needed: the 23 April bulk load created patients with the names in
// that file, then sf_link_patients_bulk attached Salesforce ids by matching phone
// numbers. That function only ever writes sf_id - it never touches the name. So
// 17,194 patients show the bulk file's name while Salesforce holds another, which
// is how one patient reads "Shizan" in Salesforce and "Suzna" here. Staff seeing
// the wrong name on a clinical record stop trusting everything else on the page.
//
// UPDATE ONLY, two columns. It calls sf_set_patient_name_bulk, which writes
// first_name/last_name onto rows whose sf_id already matches, and only where the
// name actually differs. It cannot create or delete a patient, cannot touch any
// other column, and re-running it costs nothing. Every pre-change name is in
// patients_name_backup_20260921.
//
// Keyset-paged over Patient__c ordered by Id, so it is resumable:
//   cursor - last Patient__c id processed (default "" = start)
//   pages  - Salesforce pages per invocation (default 6, 2000 rows each)
//   dry    - "true" to report how many names WOULD change, writing nothing
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

/** Mirrors the split sf_link_patients_bulk uses on insert: first word, then the rest. */
function splitName(name: string): { fn: string; ln: string } {
  const n = name.trim();
  const fn = n.split(" ")[0] ?? "";
  return { fn, ln: n.slice(fn.length).trim() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  let cursor = url.searchParams.get("cursor") || "";
  const maxPages = Math.max(1, Math.min(20, Number(url.searchParams.get("pages") || "6")));
  const dry = url.searchParams.get("dry") === "true";
  const deadline = Date.now() + 100_000;

  let scanned = 0, updated = 0, wouldUpdate = 0, pages = 0;
  const samples: { sf_id: string; from: string; to: string }[] = [];
  let done = false;

  try {
    while (pages < maxPages && Date.now() < deadline) {
      const soql =
        `SELECT Id, Patient_Name__c FROM Patient__c` +
        (cursor ? ` WHERE Id > '${cursor}'` : ``) +
        ` ORDER BY Id ASC LIMIT ${PAGE_ROWS}`;
      const rows = await sfQuery(soql, AbortSignal.timeout(30_000));
      pages++;
      if (!rows.length) { done = true; break; }
      scanned += rows.length;
      cursor = String(rows[rows.length - 1].Id);

      const payload: { sf_id: string; name: string }[] = [];
      for (const r of rows) {
        const sf_id = String(r.Id || "");
        const name = String(r.Patient_Name__c || "").trim();
        if (!sf_id || !name) continue;
        payload.push({ sf_id, name });
      }

      for (const batch of chunk(payload, BATCH)) {
        if (dry) {
          // Compare against what we hold, and keep a few examples so the run can
          // be eyeballed before anything is written.
          const { data, error } = await admin
            .from("patients")
            .select("sf_id, first_name, last_name")
            .in("sf_id", batch.map((b) => b.sf_id));
          if (error) throw new Error(`dry-run lookup: ${error.message}`);
          const here = new Map((data || []).map((p: any) => [p.sf_id, p]));
          for (const b of batch) {
            const p = here.get(b.sf_id);
            if (!p) continue;
            const { fn, ln } = splitName(b.name);
            const current = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
            if (p.first_name !== fn || (p.last_name ?? "") !== ln) {
              wouldUpdate++;
              if (samples.length < 25) samples.push({ sf_id: b.sf_id, from: current, to: `${fn} ${ln}`.trim() });
            }
          }
          continue;
        }
        const { data, error } = await admin.rpc("sf_set_patient_name_bulk", { payload: batch });
        if (error) throw new Error(`sf_set_patient_name_bulk: ${error.message}`);
        updated += Number(data || 0);
      }

      if (rows.length < PAGE_ROWS) { done = true; break; }
    }

    return new Response(
      JSON.stringify({ ok: true, dry, scanned, pages, updated, wouldUpdate, samples, done, cursor }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message, dry, scanned, updated, done: false, cursor }, null, 2),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
