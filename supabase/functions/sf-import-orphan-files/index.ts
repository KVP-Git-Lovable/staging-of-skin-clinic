// Salesforce -> Lovable Cloud import of photo/document files whose
// Notes_Pictures__c parent has no Patient link (Patient_ID__c IS NULL) but
// does name an appointment (Appointment_ID__c). The per-patient importers
// (sf-import-pictures / sf-import-attachments) walk patients, so these
// records are invisible to them and never arrive.
//
// The patient is resolved through the appointment: Appointment_ID__c ->
// appointments.sf_id -> appointments.patient_id.
//
// Query params:
//   cursor - CreatedDate keyset cursor returned by the previous call
//   pages  - Notes_Pictures__c records to walk per call (default 200)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SALESFORCE_API_KEY = Deno.env.get("SALESFORCE_API_KEY")!;

const GATEWAY = "https://connector-gateway.lovable.dev/salesforce";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

const DOC_TYPE_MAP: Record<string, string> = {
  "Consent": "Consent Form",
  "Lab reports": "Lab Report",
  "Prescription": "Prescription",
  "Skin Clinic Doctor Notes": "Previous Doctor Report",
};

const EXT_CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", heic: "image/heic", heif: "image/heif", bmp: "image/bmp",
  pdf: "application/pdf",
};

async function sfQuery(soql: string, signal?: AbortSignal): Promise<any> {
  const r = await fetch(`${GATEWAY}/query?q=${encodeURIComponent(soql)}`, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SALESFORCE_API_KEY,
    },
    signal,
  });
  if (!r.ok) throw new Error(`SF query failed [${r.status}]: ${await r.text()}`);
  return r.json();
}

async function sfDownload(versionId: string, ext?: string, signal?: AbortSignal) {
  const r = await fetch(`${GATEWAY}/sobjects/ContentVersion/${versionId}/VersionData`, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SALESFORCE_API_KEY,
    },
    signal,
  });
  if (!r.ok) throw new Error(`SF download failed [${r.status}]: ${await r.text()}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  const raw = r.headers.get("content-type") || "";
  const contentType = (!raw || raw.includes("octet-stream"))
    ? (EXT_CONTENT_TYPE[(ext || "").toLowerCase()] || "application/octet-stream")
    : raw;
  return { bytes, contentType };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") || "";
  const pages = Math.max(1, Math.min(500, Number(url.searchParams.get("pages") || "200")));
  const deadline = Date.now() + 90_000;

  let imported = 0, skipped = 0, unresolved = 0, noFile = 0, errors = 0;
  const errorSamples: any[] = [];
  let lastCreated = cursor;

  try {
    const where = [
      "Patient_ID__c = null",
      "Appointment_ID__c != null",
      cursor ? `CreatedDate > ${cursor}` : "",
    ].filter(Boolean).join(" AND ");
    const npQ = await sfQuery(
      `SELECT Id, Name, Document_Type__c, Notes_if_any__c, Appointment_ID__c, CreatedDate FROM Notes_Pictures__c WHERE ${where} ORDER BY CreatedDate ASC LIMIT ${pages}`,
    );
    const records = (npQ.records || []) as any[];

    if (records.length === 0) {
      return new Response(JSON.stringify({ ok: true, scanned: 0, imported, skipped, unresolved, done: true, cursor }, null, 2),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Resolve appointments -> patients in one round trip.
    const apptIds = Array.from(new Set(records.map((r) => String(r.Appointment_ID__c))));
    const prefixes = Array.from(new Set(apptIds.map((a) => a.slice(0, 15))));
    const apptMap = new Map<string, { id: string; patient_id: string }>();
    for (let i = 0; i < prefixes.length; i += 200) {
      const chunk = prefixes.slice(i, i + 200);
      const { data } = await admin.from("appointments").select("id, patient_id, sf_id").in("sf_id", chunk);
      for (const a of data || []) {
        if (a.sf_id && a.patient_id) apptMap.set(String(a.sf_id).slice(0, 15), { id: a.id, patient_id: a.patient_id });
      }
      // Salesforce ids are stored 18-char in some rows; retry a prefix match for those.
      const missing = chunk.filter((p) => !apptMap.has(p));
      if (missing.length) {
        for (const p of missing) {
          const { data: d2 } = await admin.from("appointments").select("id, patient_id, sf_id").like("sf_id", `${p}%`).limit(1);
          const a = (d2 || [])[0];
          if (a?.patient_id) apptMap.set(p, { id: a.id, patient_id: a.patient_id });
        }
      }
    }

    const npIds = records.map((r) => `'${r.Id}'`).join(",");
    const cdlQ = await sfQuery(
      `SELECT LinkedEntityId, ContentDocument.Title, ContentDocument.FileExtension, ContentDocument.FileType, ContentDocument.LatestPublishedVersionId FROM ContentDocumentLink WHERE LinkedEntityId IN (${npIds})`,
    );
    const cdlByNp = new Map<string, any[]>();
    for (const link of cdlQ.records || []) {
      const arr = cdlByNp.get(link.LinkedEntityId) || [];
      arr.push(link);
      cdlByNp.set(link.LinkedEntityId, arr);
    }

    for (const np of records) {
      if (Date.now() > deadline) break;
      lastCreated = np.CreatedDate;
      const appt = apptMap.get(String(np.Appointment_ID__c).slice(0, 15));
      if (!appt) { unresolved++; continue; }
      const links = cdlByNp.get(np.Id) || [];
      if (!links.length) { noFile++; continue; }
      const isPicture = np.Document_Type__c === "Pictures";

      for (const link of links) {
        const versionId = link.ContentDocument?.LatestPublishedVersionId;
        if (!versionId) { noFile++; continue; }
        const ext = (link.ContentDocument?.FileExtension || link.ContentDocument?.FileType || (isPicture ? "jpg" : "bin")).toLowerCase();

        const table = isPicture ? "patient_photos" : "procedure_attachments";
        const { data: dup } = await admin.from(table).select("id").eq("sf_id", versionId).limit(1);
        if (dup && dup.length) { skipped++; continue; }

        try {
          const { bytes, contentType } = await sfDownload(versionId, ext, AbortSignal.timeout(20_000));
          const path = `${appt.patient_id}/sf-${isPicture ? "" : "att-"}${np.Id}-${versionId}.${ext}`;
          const { error: upErr } = await admin.storage.from("patient-photos").upload(path, bytes, { contentType, upsert: true });
          if (upErr) throw upErr;
          const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/patient-photos/${path}`;

          if (isPicture) {
            const notesText = [`Imported from Salesforce (${np.Name})`, np.Notes_if_any__c || null].filter(Boolean).join("\n");
            const { error } = await admin.from("patient_photos").insert({
              patient_id: appt.patient_id,
              appointment_id: appt.id,
              photo_url: publicUrl,
              photo_type: "before",
              taken_at: np.CreatedDate,
              notes: notesText,
              sf_id: versionId,
            } as any);
            if (error) throw error;
          } else {
            const title = link.ContentDocument?.Title || np.Name || "attachment";
            const baseName = (np.Name && String(np.Name).trim()) || title;
            const fileName = /\.[A-Za-z0-9]{2,5}$/.test(baseName) ? baseName : `${baseName}.${ext}`;
            const { error } = await admin.from("procedure_attachments").insert({
              patient_id: appt.patient_id,
              appointment_id: appt.id,
              file_name: fileName,
              file_url: publicUrl,
              document_type: DOC_TYPE_MAP[np.Document_Type__c] || "Other",
              notes: np.Notes_if_any__c || null,
              sf_id: versionId,
              created_at: np.CreatedDate,
            } as any);
            if (error) throw error;
          }
          imported++;
        } catch (e) {
          errors++;
          if (errorSamples.length < 5) errorSamples.push({ np_id: np.Id, cv_id: versionId, error: (e as Error).message });
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true, scanned: records.length, imported, skipped, unresolved, no_file: noFile,
      errors, error_samples: errorSamples, done: records.length < pages, cursor: lastCreated,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("sf-import-orphan-files failed:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message, imported, skipped }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
