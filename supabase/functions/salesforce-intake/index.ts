// Salesforce -> Make.com -> Lovable Cloud unified intake webhook.
// One endpoint that routes records (patient, procedure, prescription,
// invoice, photo, attachment, note) into the right tables and storage
// buckets. Authenticated via shared header X-Make-Token.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-make-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type IntakeType =
  | "patient"
  | "procedure"
  | "prescription"
  | "invoice"
  | "photo"
  | "attachment"
  | "note";

interface IntakePayload {
  type: IntakeType;
  sf_id?: string;
  // Patient lookup hints (used when data.patient_id is not provided)
  patient_phone?: string;
  patient_email?: string;
  patient_sf_id?: string;
  // Record fields for the target table
  data?: Record<string, any>;
  // Photo / attachment only:
  binary_url?: string;     // remote URL to download
  binary_base64?: string;  // OR base64-encoded bytes
  filename?: string;       // optional, used to derive extension
  content_type?: string;   // e.g. image/jpeg, application/pdf
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXPECTED_TOKEN = Deno.env.get("MAKE_WEBHOOK_TOKEN") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

async function resolvePatientId(p: IntakePayload): Promise<string | null> {
  const direct = p.data?.patient_id;
  if (direct) return direct as string;

  if (p.patient_phone) {
    const { data } = await admin
      .from("patients")
      .select("id")
      .eq("phone", p.patient_phone)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  if (p.patient_email) {
    const { data } = await admin
      .from("patients")
      .select("id")
      .eq("email", p.patient_email)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  if (p.patient_sf_id) {
    const { data } = await admin
      .from("patients")
      .select("id, notes")
      .ilike("notes", `%sf_id=${p.patient_sf_id}%`)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function fetchBinary(p: IntakePayload): Promise<{ bytes: Uint8Array; contentType: string; ext: string }> {
  let bytes: Uint8Array;
  let contentType = p.content_type || "application/octet-stream";

  if (p.binary_base64) {
    bytes = decodeBase64(p.binary_base64);
  } else if (p.binary_url) {
    const r = await fetch(p.binary_url);
    if (!r.ok) throw new Error(`Failed to fetch binary: ${r.status}`);
    contentType = r.headers.get("content-type") || contentType;
    bytes = new Uint8Array(await r.arrayBuffer());
  } else {
    throw new Error("Photo/attachment requires binary_url or binary_base64");
  }

  const fromName = p.filename?.split(".").pop()?.toLowerCase();
  const fromMime = contentType.split("/")[1]?.split(";")[0]?.toLowerCase();
  const ext = (fromName || fromMime || "bin").replace(/[^a-z0-9]/g, "") || "bin";
  return { bytes, contentType, ext };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const token = req.headers.get("x-make-token");
  if (!EXPECTED_TOKEN || token !== EXPECTED_TOKEN) {
    return json(401, { error: "Invalid or missing X-Make-Token header" });
  }

  let payload: IntakePayload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  if (!payload?.type) return json(400, { error: "Missing 'type' field" });
  const data = { ...(payload.data || {}) };

  try {
    switch (payload.type) {
      case "patient": {
        if (!data.first_name || !data.last_name) {
          return json(400, { error: "patient requires first_name and last_name" });
        }
        // Append sf_id traceability into notes
        if (payload.sf_id) {
          const tag = `sf_id=${payload.sf_id}`;
          data.notes = data.notes ? `${data.notes}\n${tag}` : tag;
        }

        // Upsert by phone if provided, else insert
        if (data.phone) {
          const { data: existing } = await admin
            .from("patients").select("id").eq("phone", data.phone).maybeSingle();
          if (existing?.id) {
            const { data: upd, error } = await admin
              .from("patients").update(data).eq("id", existing.id).select().single();
            if (error) throw error;
            return json(200, { ok: true, action: "updated", record: upd });
          }
        }
        const { data: ins, error } = await admin
          .from("patients").insert(data).select().single();
        if (error) throw error;
        return json(200, { ok: true, action: "inserted", record: ins });
      }

      case "note": {
        const patient_id = await resolvePatientId(payload);
        if (!patient_id) return json(404, { error: "Patient not found" });
        const allowed = (({ medical_history, allergies, current_medications, notes }) =>
          ({ medical_history, allergies, current_medications, notes }))(data);
        const { data: upd, error } = await admin
          .from("patients").update(allowed).eq("id", patient_id).select().single();
        if (error) throw error;
        return json(200, { ok: true, record: upd });
      }

      case "procedure": {
        const patient_id = await resolvePatientId(payload);
        if (!patient_id) return json(404, { error: "Patient not found for procedure" });
        data.patient_id = patient_id;
        if (payload.sf_id) {
          const tag = `sf_id=${payload.sf_id}`;
          data.notes = data.notes ? `${data.notes}\n${tag}` : tag;
        }
        const { data: ins, error } = await admin
          .from("procedures").insert(data).select().single();
        if (error) throw error;
        return json(200, { ok: true, record: ins });
      }

      case "prescription": {
        if (!data.procedure_id) {
          return json(400, { error: "prescription requires data.procedure_id" });
        }
        const { data: ins, error } = await admin
          .from("prescriptions").insert(data).select().single();
        if (error) throw error;
        return json(200, { ok: true, record: ins });
      }

      case "invoice": {
        const patient_id = await resolvePatientId(payload);
        if (patient_id) data.patient_id = patient_id;
        if (payload.sf_id) {
          const tag = `sf_id=${payload.sf_id}`;
          data.notes = data.notes ? `${data.notes}\n${tag}` : tag;
        }
        const { data: ins, error } = await admin
          .from("invoices").insert(data).select().single();
        if (error) throw error;
        return json(200, { ok: true, record: ins });
      }

      case "photo":
      case "attachment": {
        const patient_id = await resolvePatientId(payload);
        if (!patient_id) return json(404, { error: "Patient not found" });

        const isPhoto = payload.type === "photo";
        const bucket = isPhoto ? "patient-photos" : "procedure-attachments";
        const { bytes, contentType, ext } = await fetchBinary(payload);
        const path = `${patient_id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

        const { error: upErr } = await admin.storage
          .from(bucket)
          .upload(path, bytes, { contentType, upsert: false });
        if (upErr) throw upErr;

        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

        if (isPhoto) {
          const row: Record<string, any> = {
            patient_id,
            photo_url: publicUrl,
            photo_type: data.photo_type || "before",
            notes: data.notes || null,
            appointment_id: data.appointment_id || null,
            procedure_id: data.procedure_id || null,
          };
          const { data: ins, error } = await admin
            .from("patient_photos").insert(row).select().single();
          if (error) throw error;
          return json(200, { ok: true, record: ins, public_url: publicUrl });
        } else {
          if (!data.procedure_id) {
            return json(400, { error: "attachment requires data.procedure_id" });
          }
          const row: Record<string, any> = {
            procedure_id: data.procedure_id,
            file_url: publicUrl,
            file_name: payload.filename || path.split("/").pop(),
            notes: data.notes || null,
          };
          const { data: ins, error } = await admin
            .from("procedure_attachments").insert(row).select().single();
          if (error) throw error;
          return json(200, { ok: true, record: ins, public_url: publicUrl });
        }
      }

      default:
        return json(400, { error: `Unknown type: ${payload.type}` });
    }
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});