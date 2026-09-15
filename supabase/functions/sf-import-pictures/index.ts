// Salesforce -> Lovable Cloud import of before/after photos
// (Notes_Pictures__c where Document_Type__c = 'Pictures') for every
// patient with a Salesforce Id that hasn't been processed by this sync yet
// (patients.sf_pictures_synced_at IS NULL). Each call handles one bounded
// batch and marks each patient it successfully processes, so the UI's
// "Sync from Salesforce" button can just keep calling this until it
// reports 0 patients processed.
//
// Query params:
//   limit - patients per call, default 12 (each patient can pull and
//           upload several image files)
//   only  - name substring or patient UUID, for spot-checking one patient
//           regardless of its synced_at marker
//   reset - "true" to delete this run's target patients' previously
//           Salesforce-imported photos (sf_id IS NOT NULL only - never
//           touches photos taken directly in the app) and clear their
//           synced_at marker before re-importing. Off by default.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SALESFORCE_API_KEY = Deno.env.get("SALESFORCE_API_KEY")!;

const GATEWAY = "https://connector-gateway.lovable.dev/salesforce";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

interface Target { lovable_id: string; sf_id: string; name: string }

// Cap SF Notes_Pictures records fetched per patient per run.
const PICTURES_PER_PATIENT = 500;

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

async function sfDownload(versionId: string, ext?: string, signal?: AbortSignal): Promise<{ bytes: Uint8Array; contentType: string }> {
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
    ? (EXT_CONTENT_TYPE[(ext || "").toLowerCase()] || "image/jpeg")
    : raw;
  return { bytes, contentType };
}

async function fetchTargets(only: string, limit: number): Promise<Target[]> {
  if (only) {
    const { data, error } = await admin
      .from("patients").select("id, sf_id, first_name, last_name").not("sf_id", "is", null);
    if (error) throw error;
    return (data || [])
      .filter((p) => p.id === only || `${p.first_name} ${p.last_name}`.toLowerCase().includes(only.toLowerCase()))
      .map((p) => ({ lovable_id: p.id, sf_id: p.sf_id as string, name: `${p.first_name} ${p.last_name}`.trim() }));
  }
  const { data, error } = await admin
    .from("patients").select("id, sf_id, first_name, last_name").not("sf_id", "is", null)
    .is("sf_pictures_synced_at", null)
    .order("created_at", { ascending: true }).limit(limit);
  if (error) throw error;
  return (data || []).map((p) => ({ lovable_id: p.id, sf_id: p.sf_id as string, name: `${p.first_name} ${p.last_name}`.trim() }));
}

// Run `fn` over `items` with at most `concurrency` in flight at once.
async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function syncPatient(p: Target, signal?: AbortSignal): Promise<{ imported: number; skipped: number; items: any[]; note?: string }> {
  const patientLog: { imported: number; skipped: number; items: any[]; note?: string } = { imported: 0, skipped: 0, items: [] };

  const { data: existingRows } = await admin
    .from("patient_photos").select("sf_id").eq("patient_id", p.lovable_id).not("sf_id", "is", null);
  const existing = new Set((existingRows || []).map((r: any) => r.sf_id as string));

  const npQ = await sfQuery(
    `SELECT Id, Name, Notes_if_any__c, CreatedDate FROM Notes_Pictures__c WHERE Patient_ID__c = '${p.sf_id}' AND Document_Type__c = 'Pictures' ORDER BY CreatedDate DESC LIMIT ${PICTURES_PER_PATIENT}`,
    signal,
  );
  const npRecords = (npQ.records || []) as any[];
  if (npRecords.length === 0) {
    patientLog.note = "No Pictures records in Salesforce";
    return patientLog;
  }

  const npIds = npRecords.map((r) => `'${r.Id}'`).join(",");
  const cdlQ = await sfQuery(
    `SELECT LinkedEntityId, ContentDocument.Title, ContentDocument.FileExtension, ContentDocument.FileType, ContentDocument.LatestPublishedVersionId FROM ContentDocumentLink WHERE LinkedEntityId IN (${npIds})`,
    signal,
  );
  const cdlByNp = new Map<string, any[]>();
  for (const link of cdlQ.records || []) {
    const arr = cdlByNp.get(link.LinkedEntityId) || [];
    arr.push(link);
    cdlByNp.set(link.LinkedEntityId, arr);
  }

  for (const np of npRecords) {
    const links = cdlByNp.get(np.Id) || [];
    if (links.length === 0) {
      patientLog.items.push({ np_id: np.Id, status: "no-attachment" });
      continue;
    }

    await Promise.all(links.map(async (link: any) => {
      const versionId = link.ContentDocument?.LatestPublishedVersionId;
      const ext = (link.ContentDocument?.FileExtension || link.ContentDocument?.FileType || "jpg").toLowerCase();
      if (!versionId) {
        patientLog.items.push({ np_id: np.Id, status: "no-version" });
        return;
      }

      if (existing.has(versionId)) {
        patientLog.skipped++;
        patientLog.items.push({ np_id: np.Id, cv_id: versionId, status: "already-imported" });
        return;
      }

      const { bytes, contentType } = await sfDownload(versionId, ext, signal);
      const path = `${p.lovable_id}/sf-${np.Id}-${versionId}.${ext}`;
      const { error: upErr } = await admin.storage
        .from("patient-photos")
        .upload(path, bytes, { contentType, upsert: true });
      if (upErr) throw upErr;

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/patient-photos/${path}`;
      const notesText = [`Imported from Salesforce (${np.Name})`, np.Notes_if_any__c || null].filter(Boolean).join("\n");

      const { error: insErr } = await admin.from("patient_photos").insert({
        patient_id: p.lovable_id,
        photo_url: publicUrl,
        photo_type: "before",
        taken_at: np.CreatedDate,
        notes: notesText,
        sf_id: versionId,
      });
      if (insErr) throw insErr;

      patientLog.imported++;
      patientLog.items.push({ np_id: np.Id, cv_id: versionId, status: "imported", url: publicUrl });
    }));
  }

  return patientLog;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const results: any[] = [];
  const errors: any[] = [];
  const url = new URL(req.url);
  const reset = url.searchParams.get("reset") === "true";
  const only = url.searchParams.get("only") || "";
  // The fetch limit can be generous - it's just a cheap indexed query, and
  // the deadline below (not this number) is what actually bounds how much
  // work one invocation attempts. Anything not reached this call is simply
  // left for the next one (sf_pictures_synced_at stays NULL).
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || "25")));

  try {
    const targets = await fetchTargets(only, limit);

    if (reset) {
      for (const p of targets) {
        await admin.from("patient_photos").delete().eq("patient_id", p.lovable_id).not("sf_id", "is", null);
      }
      if (only) {
        await admin.from("patients").update({ sf_pictures_synced_at: null }).in("id", targets.map((t) => t.lovable_id));
      }
    }

    // Patients are independent - process several concurrently. Hard time
    // budget: merely refusing to start new work isn't enough, since an
    // in-flight Salesforce request can otherwise run until the platform's
    // idle timeout kills the whole invocation (and everything in it that
    // hadn't finished yet). Stop scheduling new patients at 90s and abort
    // any individual patient's Salesforce calls after at most 20s - a
    // deferred patient just gets picked up again by the next call, nothing
    // is lost.
    const deadline = Date.now() + 90_000;
    let stoppedEarly = false;
    await mapPool(targets, 10, async (p) => {
      if (Date.now() > deadline) { stoppedEarly = true; return; }
      const remainingMs = Math.max(1, deadline - Date.now());
      const patientTimeoutMs = Math.min(20_000, remainingMs);
      try {
        const patientLog = await syncPatient(p, AbortSignal.timeout(patientTimeoutMs));
        results.push({ patient: p.name, lovable_id: p.lovable_id, sf_id: p.sf_id, ...patientLog });
        if (!only) {
          await admin.from("patients").update({ sf_pictures_synced_at: new Date().toISOString() }).eq("id", p.lovable_id);
        }
      } catch (e) {
        const msg = (e as Error).name === "TimeoutError" || (e as Error).name === "AbortError"
          ? `Patient sync exceeded ${Math.ceil(patientTimeoutMs / 1000)}s and was safely deferred`
          : (e as Error).message;
        results.push({ patient: p.name, lovable_id: p.lovable_id, sf_id: p.sf_id, error: msg });
        errors.push({ patient: p.name, error: msg });
      }
    });

    return new Response(
      JSON.stringify({ ok: true, processed: results.length, batch_size: targets.length, stopped_early: stoppedEarly, results, error_count: errors.length, errors }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("sf-import-pictures failed:", e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message, results, errors }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
