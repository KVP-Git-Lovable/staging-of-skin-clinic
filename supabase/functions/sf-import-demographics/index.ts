// Imports the demographics Salesforce has held all along: Sex__c, Email_ID__c,
// Date_of_birth__c and Patient_source__c.
//
// Why this is needed: every Salesforce query this app makes for a patient asks
// for Id, Patient_Name__c and Mobile_Number__c and nothing else. Gender, email
// and date of birth have never been fetched, which is why a printed prescription
// reads "Sex: -" and "Email: -". Salesforce holds Sex__c for 100% of patients
// and Email_ID__c for 96.7%, against 63.7% and 60.6% here.
//
// Patient_source__c was added on 7 October. 9,866 patients read "salesforce" in
// their Source column - not a source, but the literal word sf-import-clinical
// stamps on a patient it creates (sf-import-clinical/index.ts:322, now null).
// Salesforce's own source field was never asked for here, which is why no sync
// has ever corrected them.
//
// FILL-ONLY on three columns. It calls sf_set_patient_demographics_bulk, which
// COALESCEs each column against what is already here: a value typed in this app
// is never replaced, and a null from Salesforce can never blank one. That matters
// most for date of birth, which Salesforce has for 6.7% of patients while this
// database has it for 29.2% - an overwrite would erase thousands of real birth
// dates. It cannot create or delete a patient and re-running it costs nothing.
// Every pre-change value is in patients_demographics_backup_20260921.
//
// Date of birth and source are the exceptions: Salesforce is the better source
// for both, so it wins there - with every change recorded, before and after, in
// patient_dob_corrections and patient_source_corrections. A null from Salesforce
// still never blanks a value here.
//
// Keyset-paged over Patient__c ordered by Id, so it is resumable:
//   cursor - last Patient__c id processed (default "" = start)
//   pages  - Salesforce pages per invocation (default 6, 2000 rows each)
//   dry    - "true" to report what WOULD be filled, writing nothing
//
// The dry run also returns a tally of the raw Sex__c and Patient_source__c values
// seen and a count of the email and birth-date values rejected as unusable. That
// is a shape report, not patient data: values are only counted, never attached to
// anybody, and the email tally is a count alone. It exists so an unrecognised
// spelling is mapped deliberately rather than silently dropped.
//
// Response carries the next cursor; keep calling until done=true.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { describeSfFailure } from "./sfError.ts";
import { normaliseDob, normaliseEmail, normaliseSex, normaliseSource } from "./demographics.ts";
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

  let scanned = 0, updated = 0, pages = 0;
  let wouldFillGender = 0, wouldFillEmail = 0, wouldFillDob = 0;
  let rejectedEmail = 0, rejectedDob = 0;
  // How many patients Salesforce can give a real source to, and how many of
  // those are the ones currently reading the literal word "salesforce".
  let wouldSetSource = 0, wouldReplaceStampedSource = 0, sourceHeldBlank = 0;
  const sexSeen: Record<string, number> = {};
  const sourceSeen: Record<string, number> = {};
  let done = false;

  try {
    while (pages < maxPages && Date.now() < deadline) {
      const soql =
        `SELECT Id, Sex__c, Email_ID__c, Date_of_birth__c, Patient_source__c FROM Patient__c` +
        (cursor ? ` WHERE Id > '${cursor}'` : ``) +
        ` ORDER BY Id ASC LIMIT ${PAGE_ROWS}`;
      const rows = await sfQuery(soql, AbortSignal.timeout(30_000));
      pages++;
      if (!rows.length) { done = true; break; }
      scanned += rows.length;
      cursor = String(rows[rows.length - 1].Id);

      const payload: {
        sf_id: string;
        gender: string | null;
        email: string | null;
        date_of_birth: string | null;
        source: string | null;
      }[] = [];
      for (const r of rows) {
        const sf_id = String(r.Id || "");
        if (!sf_id) continue;

        const rawSex = String(r.Sex__c ?? "").trim();
        if (rawSex) sexSeen[rawSex] = (sexSeen[rawSex] || 0) + 1;
        const gender = normaliseSex(rawSex);

        const email = normaliseEmail(r.Email_ID__c);
        if (!email && String(r.Email_ID__c ?? "").trim()) rejectedEmail++;

        const date_of_birth = normaliseDob(r.Date_of_birth__c);
        if (!date_of_birth && String(r.Date_of_birth__c ?? "").trim()) rejectedDob++;

        const rawSource = String(r.Patient_source__c ?? "").trim();
        if (rawSource) sourceSeen[rawSource] = (sourceSeen[rawSource] || 0) + 1;
        const source = normaliseSource(rawSource);

        if (!gender && !email && !date_of_birth && !source) continue;
        payload.push({ sf_id, gender, email, date_of_birth, source });
      }

      for (const batch of chunk(payload, BATCH)) {
        if (dry) {
          // Count only what is actually missing here - the point of the dry run
          // is to show that this fills gaps and overwrites nothing.
          const { data, error } = await admin
            .from("patients")
            .select("sf_id, gender, email, date_of_birth, source")
            .in("sf_id", batch.map((b) => b.sf_id));
          if (error) throw new Error(`dry-run lookup: ${error.message}`);
          const here = new Map((data || []).map((p: any) => [p.sf_id, p]));
          for (const b of batch) {
            const p = here.get(b.sf_id);
            if (!p) continue;
            if (b.gender && !String(p.gender ?? "").trim()) wouldFillGender++;
            if (b.email && !String(p.email ?? "").trim()) wouldFillEmail++;
            if (b.date_of_birth && !p.date_of_birth) wouldFillDob++;
            const held = String(p.source ?? "").trim();
            if (b.source && b.source !== held) {
              wouldSetSource++;
              if (held.toLowerCase() === "salesforce") wouldReplaceStampedSource++;
              if (!held) sourceHeldBlank++;
            }
          }
          continue;
        }
        const { data, error } = await admin.rpc("sf_set_patient_demographics_bulk", { payload: batch });
        if (error) throw new Error(`sf_set_patient_demographics_bulk: ${error.message}`);
        updated += Number(data || 0);
      }

      if (rows.length < PAGE_ROWS) { done = true; break; }
    }

    // Unrecognised Sex__c / Patient_source__c spellings, so they can be mapped
    // deliberately in demographics.ts rather than silently skipped.
    const unmappedSex = Object.entries(sexSeen)
      .filter(([raw]) => normaliseSex(raw) === null)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25);
    const unmappedSource = Object.entries(sourceSeen)
      .filter(([raw]) => normaliseSource(raw) === null)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25);

    return new Response(
      JSON.stringify({
        ok: true, dry, scanned, pages, updated,
        wouldFillGender, wouldFillEmail, wouldFillDob,
        wouldSetSource, wouldReplaceStampedSource, sourceHeldBlank,
        rejectedEmail, rejectedDob,
        sexValuesSeen: sexSeen, unmappedSex,
        sourceValuesSeen: sourceSeen, unmappedSource,
        done, cursor,
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message, scanned, pages, updated, cursor }, null, 2),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
