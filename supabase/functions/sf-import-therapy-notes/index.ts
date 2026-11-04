// Salesforce -> Lovable Cloud import of Therapy Notes (Therapy_Note__c) into
// the appointment Notes tab (appointment_sticky_notes).
//
// Each note carries a Patient and (99% of the time) an Appointment lookup, so
// notes are attached to the matching visit. Where the appointment lookup is
// empty we fall back to the patient's visit on the note's own Date__c.
//
// Paging is a keyset cursor on CreatedDate: each call works through as many
// pages as fit inside its time budget and returns the cursor to resume from,
// so the caller just keeps calling until `done` is true. Inserts are keyed by
// the Therapy Note's Salesforce Id (appointment_sticky_notes.sf_id, unique),
// so re-running never duplicates and never touches notes typed in the app.
//
// Query params:
//   cursor - ISO CreatedDate to resume after (omit to start from the beginning)
//   page   - Salesforce records per page, default 200
//   limit  - max records to process in this call, default 4000

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { describeSfFailure } from "./sfError.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SALESFORCE_API_KEY = Deno.env.get("SALESFORCE_API_KEY")!;

const GATEWAY = "https://connector-gateway.lovable.dev/salesforce";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

async function sfQuery(soql: string, signal?: AbortSignal): Promise<any[]> {
  const response = await fetch(`${GATEWAY}/query?q=${encodeURIComponent(soql)}`, {
    signal,
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SALESFORCE_API_KEY,
    },
  });
  if (!response.ok) throw new Error(describeSfFailure(response.status, await response.text()));
  const payload = await response.json();
  return payload.records || [];
}

/** Salesforce 18-char ids are the 15-char id plus a checksum suffix. */
const id15 = (id: string) => (id || "").slice(0, 15);

/** The clinic works in IST, so a visit's calendar date is its IST date. */
const istDate = (iso: string) =>
  new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

function noteTitle(doctor: string | null | undefined): string {
  const name = (doctor || "").trim();
  return name ? `Therapy note - ${name}` : "Therapy note";
}

function noteContent(treatment: string, assistedBy: string | null | undefined): string {
  const assisted = (assistedBy || "").trim();
  return assisted ? `${treatment.trim()}\n\nAssisted by: ${assisted}` : treatment.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const pageSize = Math.max(1, Math.min(500, Number(url.searchParams.get("page") || "200")));
  const maxRecords = Math.max(1, Math.min(20000, Number(url.searchParams.get("limit") || "4000")));
  let cursor = url.searchParams.get("cursor") || "1900-01-01T00:00:00.000Z";

  let scanned = 0;
  let imported = 0;
  let skipped = 0;
  let unmatched = 0;
  let blank = 0;
  const unmatchedSamples: any[] = [];
  const deadline = Date.now() + 90_000;

  try {
    let done = false;

    while (Date.now() < deadline && scanned < maxRecords) {
      const soql =
        `SELECT Id, Treatment__c, Date__c, CreatedDate, Assisted_By__c, Appointment__c, Patient__c, Doctor__r.Name ` +
        `FROM Therapy_Note__c WHERE CreatedDate > ${cursor} ORDER BY CreatedDate ASC LIMIT ${pageSize}`;
      const records = await sfQuery(soql, AbortSignal.timeout(Math.max(1, deadline - Date.now())));
      if (records.length === 0) { done = true; break; }
      scanned += records.length;
      cursor = records[records.length - 1].CreatedDate;
      if (records.length < pageSize) done = true;

      // Which of this page's notes are already in?
      const sfIds = records.map((r: any) => r.Id as string);
      const { data: existingRows } = await admin
        .from("appointment_sticky_notes").select("sf_id").in("sf_id", sfIds);
      const existing = new Set((existingRows || []).map((r: any) => r.sf_id as string));

      const pending = records.filter((r: any) => !existing.has(r.Id));
      skipped += records.length - pending.length;

      const withText = pending.filter((r: any) => (r.Treatment__c || "").trim());
      blank += pending.length - withText.length;
      if (withText.length === 0) { if (done) break; else continue; }

      // Resolve appointments by Salesforce id (compare on the 15-char prefix so
      // 15/18-char variants both match).
      const apptKeys = Array.from(new Set(withText.map((r: any) => r.Appointment__c).filter(Boolean).map(id15)));
      const apptByKey = new Map<string, { id: string; patient_id: string }>();
      if (apptKeys.length) {
        const { data: appts } = await admin
          .from("appointments").select("id, sf_id, patient_id")
          .or(apptKeys.map((k) => `sf_id.like.${k}%`).join(","));
        for (const a of appts || []) apptByKey.set(id15(a.sf_id as string), { id: a.id, patient_id: a.patient_id });
      }

      // Fallback path: patient + date.
      const needFallback = withText.filter((r: any) => !r.Appointment__c || !apptByKey.get(id15(r.Appointment__c)));
      const patientByKey = new Map<string, string>();
      const fallbackAppt = new Map<string, string>();
      if (needFallback.length) {
        const patientKeys = Array.from(new Set(needFallback.map((r: any) => r.Patient__c).filter(Boolean).map(id15)));
        if (patientKeys.length) {
          const { data: pats } = await admin
            .from("patients").select("id, sf_id")
            .or(patientKeys.map((k) => `sf_id.like.${k}%`).join(","));
          for (const p of pats || []) patientByKey.set(id15(p.sf_id as string), p.id);

          const patientIds = Array.from(new Set(Array.from(patientByKey.values())));
          const dates = Array.from(new Set(needFallback.map((r: any) => r.Date__c).filter(Boolean)));
          if (patientIds.length && dates.length) {
            const sorted = [...dates].sort();
            const from = `${sorted[0]}T00:00:00+05:30`;
            const toDate = new Date(`${sorted[sorted.length - 1]}T00:00:00+05:30`);
            toDate.setDate(toDate.getDate() + 1);
            const { data: appts } = await admin
              .from("appointments").select("id, patient_id, start_time")
              .in("patient_id", patientIds)
              .gte("start_time", from).lt("start_time", toDate.toISOString());
            for (const a of appts || []) {
              const key = `${a.patient_id}|${istDate(a.start_time as string)}`;
              if (!fallbackAppt.has(key)) fallbackAppt.set(key, a.id);
            }
          }
        }
      }

      const rows: any[] = [];
      for (const r of withText) {
        let appointmentId: string | undefined;
        if (r.Appointment__c) appointmentId = apptByKey.get(id15(r.Appointment__c))?.id;
        if (!appointmentId && r.Patient__c && r.Date__c) {
          const patientId = patientByKey.get(id15(r.Patient__c));
          if (patientId) appointmentId = fallbackAppt.get(`${patientId}|${r.Date__c}`);
        }
        if (!appointmentId) {
          unmatched++;
          if (unmatchedSamples.length < 10) {
            unmatchedSamples.push({ sf_id: r.Id, appointment: r.Appointment__c, patient: r.Patient__c, date: r.Date__c });
          }
          continue;
        }
        rows.push({
          appointment_id: appointmentId,
          title: noteTitle(r.Doctor__r?.Name),
          content: noteContent(r.Treatment__c, r.Assisted_By__c),
          created_at: r.CreatedDate,
          updated_at: r.CreatedDate,
          sf_id: r.Id,
        });
      }

      if (rows.length) {
        const { error } = await admin
          .from("appointment_sticky_notes")
          .upsert(rows as any, { onConflict: "sf_id", ignoreDuplicates: true });
        if (error) throw error;
        imported += rows.length;
      }

      if (done) break;
    }

    return new Response(
      JSON.stringify({ ok: true, scanned, imported, skipped, unmatched, blank, done, cursor, unmatched_samples: unmatchedSamples }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("sf-import-therapy-notes failed:", e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message, scanned, imported, skipped, unmatched, cursor }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
