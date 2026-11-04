// Creates/links app patient records for every Salesforce patient that has at
// least one appointment but no matching patients.sf_id. Without this, those
// patients' appointments (and bills, procedures, therapy notes) can never be
// imported, because sf-import-clinical only ever walks patients that already
// exist here with an sf_id.
//
// Keyset-paged over Appointment__c ordered by Patient__c, so it is resumable:
//   cursor - last Patient__c id processed (default "" = start)
//   pages  - Salesforce pages per invocation (default 6, 2000 rows each)
// Response carries the next cursor; keep calling until done=true.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { describeSfFailure } from "./sfError.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SALESFORCE_API_KEY = Deno.env.get("SALESFORCE_API_KEY")!;
const GATEWAY = "https://connector-gateway.lovable.dev/salesforce";

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
  const startedAt = Date.now();
  const deadline = startedAt + 100_000;

  let scanned = 0, created = 0, linked = 0, existing = 0, pages = 0;
  let done = false;

  try {
    while (pages < maxPages && Date.now() < deadline) {
      const soql =
        `SELECT Patient__c, Patient__r.Patient_Name__c, Patient__r.Mobile_Number__c FROM Appointment__c` +
        (cursor ? ` WHERE Patient__c > '${cursor}'` : ``) +
        ` ORDER BY Patient__c ASC LIMIT 2000`;
      const rows = await sfQuery(soql, AbortSignal.timeout(30_000));
      pages++;
      if (!rows.length) { done = true; break; }
      scanned += rows.length;
      cursor = String(rows[rows.length - 1].Patient__c);

      // Unique patients in this page (drop the trailing id: it may be split
      // across the page boundary, the next cursor re-reads it anyway).
      const byId = new Map<string, { name: string; phone: string }>();
      for (const r of rows) {
        const id = String(r.Patient__c || "");
        if (!id || id === cursor) continue;
        const p = r.Patient__r || {};
        byId.set(id, {
          name: String(p.Patient_Name__c || "Unknown").trim(),
          phone: String(p.Mobile_Number__c || "").replace(/\D/g, "").slice(-10),
        });
      }

      // One round trip per page: per-patient phone lookups were the bottleneck
      // and pushed pages past the platform's 150s idle timeout.
      const payload = [...byId.entries()].map(([sf_id, info]) => ({
        sf_id,
        name: info.name,
        phone: info.phone.length === 10 ? info.phone : "",
      }));
      for (const batch of chunk(payload, 500)) {
        const { data, error } = await admin.rpc("sf_link_patients_bulk", { payload: batch });
        if (error) throw new Error(`sf_link_patients_bulk: ${error.message}`);
        const row = Array.isArray(data) ? data[0] : data;
        linked += Number(row?.linked || 0);
        created += Number(row?.created || 0);
        existing += batch.length - Number(row?.linked || 0) - Number(row?.created || 0);
      }

      if (rows.length < 2000) { done = true; break; }
    }

    return new Response(
      JSON.stringify({ ok: true, scanned, pages, created, linked, existing, done, cursor }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message, scanned, created, linked, done: false, cursor }, null, 2),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
