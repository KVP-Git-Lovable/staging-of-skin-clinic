// One-off repair for patient-photos storage objects that were uploaded
// with a non-image content-type (e.g. application/octet-stream) - the
// image bytes themselves are fine, but browsers/<img> tags refuse to
// render them since they rely on the stored content-type, not the bytes,
// to decide how to handle a response (this is why the file downloads
// instead of displaying inline when the URL is opened directly).
//
// Fixes it by re-uploading every Salesforce-imported photo to the SAME
// path with the correct content-type (derived from its file extension)
// and upsert:true - entirely within Supabase Storage, no Salesforce calls
// needed, since the bytes don't need to change. Re-uploading an
// already-correct file is harmless, so this doesn't try to detect which
// ones are actually broken first - simpler and more reliable than
// querying storage.objects metadata directly.
//
// Query params:
//   offset - patient_photos rows already processed by prior calls, default 0
//   limit  - rows per call, default 150 (each does a download + upload)
//
// Call repeatedly, feeding each response's next_offset back in as the next
// call's offset, until it reports done: true.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

const BUCKET = "patient-photos";
const PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

const EXT_CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", heic: "image/heic", heif: "image/heif", bmp: "image/bmp",
  pdf: "application/pdf",
};

function extOf(name: string): string {
  const m = name.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : "";
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const offset = Math.max(0, Number(url.searchParams.get("offset") || "0"));
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || "150")));

  const results: any[] = [];
  const errors: any[] = [];

  try {
    const { data: rows, error: qErr } = await admin
      .from("patient_photos")
      .select("id, photo_url")
      .not("sf_id", "is", null)
      .not("photo_url", "is", null)
      .order("id")
      .range(offset, offset + limit - 1);
    if (qErr) throw new Error(`fetching patient_photos failed: ${qErr.message}`);

    const targets = (rows || [])
      .map((r: any) => {
        const url = String(r.photo_url);
        const path = url.startsWith(PREFIX) ? url.slice(PREFIX.length) : null;
        return { id: r.id, path };
      })
      .filter((t: any) => !!t.path);

    // Storage downloads/uploads are I/O bound, not CPU bound - process many
    // concurrently. Same deadline pattern as the sf-import-* functions:
    // stop scheduling new work at 90s so the invocation never runs into the
    // platform's own timeout; anything not reached this call is picked up
    // by the next one (its row is still within [offset, offset+limit), so
    // it's not skipped - just re-attempted on retry with the same offset).
    const deadline = Date.now() + 90_000;
    let stoppedEarly = false;
    await mapPool(targets, 20, async (t: any) => {
      if (Date.now() > deadline) { stoppedEarly = true; return; }
      try {
        const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(t.path);
        if (dlErr || !blob) throw new Error(dlErr?.message || "download returned no data");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const contentType = EXT_CONTENT_TYPE[extOf(t.path)] || "image/jpeg";
        const { error: upErr } = await admin.storage.from(BUCKET).upload(t.path, bytes, { contentType, upsert: true });
        if (upErr) throw new Error(upErr.message);
        results.push({ path: t.path, fixed_to: contentType });
      } catch (e) {
        const msg = (e as Error).message;
        results.push({ path: t.path, error: msg });
        errors.push({ path: t.path, error: msg });
      }
    });

    const rowsSeen = (rows || []).length;
    const done = rowsSeen < limit && !stoppedEarly;
    const nextOffset = stoppedEarly ? offset : offset + rowsSeen;

    return new Response(
      JSON.stringify({
        ok: true,
        processed: results.length,
        batch_size: targets.length,
        stopped_early: stoppedEarly,
        done,
        next_offset: done ? null : nextOffset,
        error_count: errors.length,
        errors,
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("fix-photo-content-types failed:", e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message, results, errors }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
