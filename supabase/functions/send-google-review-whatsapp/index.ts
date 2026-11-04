import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { corsHeaders, json, requireStaff, twilioCreds } from "../_shared/comms-auth.ts";
import { toE164IN } from "../_shared/comms-phone.ts";
import { isWithinServiceWindow, reviewSessionParams, reviewTemplateParams } from "./template.ts";

const Body = z.object({
  patient_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullish(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST to send a review request" }, 405);
  try {
    const denied = await requireStaff(req);
    if (denied) return denied;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ ok: false, error: "A valid patient ID is required" }, 400);

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return json({ ok: false, error: "Review sender is not configured" }, 500);
    // Read through the caller's existing access policies, not the service role.
    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const { patient_id, appointment_id } = parsed.data;
    const { data: patient, error: patientError } = await client.from("patients")
      .select("id, phone").eq("id", patient_id).maybeSingle();
    if (patientError) return json({ ok: false, error: "Could not read this patient's record" }, 403);
    if (!patient) return json({ ok: false, error: "Patient not found or not accessible" }, 404);
    if (appointment_id) {
      const { data: appointment, error } = await client.from("appointments")
        .select("id").eq("id", appointment_id).eq("patient_id", patient_id).maybeSingle();
      if (error || !appointment) return json({ ok: false, error: "This appointment does not belong to the selected patient or is not accessible" }, 400);
    }
    const phone = toE164IN(patient.phone);
    if (!phone) return json({ ok: false, error: "This patient has no usable phone number on their record." }, 400);
    const creds = twilioCreds();
    const from = Deno.env.get("TWILIO_WHATSAPP_FROM");
    const templateSid = Deno.env.get("TWILIO_GOOGLE_REVIEW_TEMPLATE_SID");
    if (!creds || !from || !templateSid) return json({ ok: false, error: "The WhatsApp review sender is not configured. Please ask your administrator to check its settings." }, 503);

    const admin = createClient(url, serviceKey);
    // If the patient wrote to us in the last 24 hours, send the same words as an
    // ordinary message: Meta's marketing-template cap (63049) does not apply then.
    const { data: lastInbound } = await admin.from("whatsapp_conversations")
      .select("created_at").eq("phone", phone).eq("direction", "inbound")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const inWindow = isWithinServiceWindow(lastInbound?.created_at);
    const params = inWindow ? reviewSessionParams(phone, from) : reviewTemplateParams(phone, from, templateSid);

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: creds.auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      return json({ ok: false, error: String(result?.message || "WhatsApp could not accept the review request"), code: result?.code ?? null }, 502);
    }
    if (!result?.sid) return json({ ok: false, error: "WhatsApp did not confirm the review request. Check the delivery log before trying again." }, 502);
    const { error: logError } = await admin.from("whatsapp_conversations").insert({
      phone, patient_id, direction: "outbound", role: "assistant",
      content: result.body || "Google review request sent using the approved clinic template.",
      message_sid: result.sid,
    });
    if (logError) console.error("Review request accepted but conversation recording failed");
    return json({ ok: true, messageSid: result.sid, recorded: !logError, mode: inWindow ? "session" : "template" });
  } catch {
    return json({ ok: false, error: "The review request could not be completed. Check the WhatsApp delivery log before trying again." }, 500);
  }
});