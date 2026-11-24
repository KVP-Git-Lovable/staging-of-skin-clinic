import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { corsHeaders, json, requireStaff, twilioCreds } from "../_shared/comms-auth.ts";
import { toE164IN } from "../_shared/comms-phone.ts";
import { patientGreeting } from "../_shared/patient-greeting.ts";
import {
  followupSessionParams,
  followupTemplateParams,
  FOLLOWUP_TEMPLATES,
  isDeletedTemplateError,
  isWithinServiceWindow,
  type FollowupKind,
} from "./template.ts";

/**
 * The 24-hour and 1-week post-treatment follow-ups.
 *
 * ── SWITCHED OFF since 10 Nov 2026, and deliberately not deleted ──
 *
 * The clinic deleted both approved Meta templates, so TWILIO_FOLLOWUP_24H_
 * TEMPLATE_SID and its sibling point at nothing and this returns a 503. The
 * buttons now open WhatsApp Web with the message typed instead - see
 * src/lib/followupSend.ts and src/components/appointments/FollowupButtons.tsx.
 *
 * Left in place exactly as send-google-review-whatsapp was: if templates are
 * ever approved again, pointing those two secrets at the new SIDs is all that
 * is needed. The wording in ./template.ts is held against the wording the
 * buttons use by a test, so the two cannot drift apart while this sleeps.
 *
 * One function for both, rather than two near-identical ones: the auth, the
 * patient scoping, the service-window branch and the recording are the whole
 * job, and only the template SID and the words differ.
 *
 * Shaped after send-google-review-whatsapp, which already solved this. The
 * parts that are not obvious and must not be simplified away:
 *
 *  - requireStaff, not just a valid JWT. Patients hold auth sessions too
 *    (the portal), so a signed-in patient could otherwise make the clinic's
 *    number send messages.
 *  - The patient is read through the CALLER's own access, so a doctor limited
 *    to their own patients cannot message somebody else's.
 *  - Inside the 24-hour window the same words go as ordinary text. Outside it,
 *    only the approved template will be delivered at all.
 */

const Body = z.object({
  patient_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullish(),
  kind: z.enum(["24h", "1week"]),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST to send a follow-up" }, 405);
  try {
    const denied = await requireStaff(req);
    if (denied) return denied;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ ok: false, error: "A valid patient ID and follow-up type are required" }, 400);

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return json({ ok: false, error: "Follow-up sender is not configured" }, 500);

    // Read through the caller's existing access policies, not the service role.
    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const { patient_id, appointment_id, kind } = parsed.data;
    const template = FOLLOWUP_TEMPLATES[kind as FollowupKind];

    const { data: patient, error: patientError } = await client
      .from("patients")
      .select("id, phone, first_name, last_name, gender")
      .eq("id", patient_id)
      .maybeSingle();
    if (patientError) return json({ ok: false, error: "Could not read this patient's record" }, 403);
    if (!patient) return json({ ok: false, error: "Patient not found or not accessible" }, 404);
    if (appointment_id) {
      const { data: appointment, error } = await client
        .from("appointments")
        .select("id")
        .eq("id", appointment_id)
        .eq("patient_id", patient_id)
        .maybeSingle();
      if (error || !appointment) {
        return json({ ok: false, error: "This appointment does not belong to the selected patient or is not accessible" }, 400);
      }
    }

    const phone = toE164IN(patient.phone);
    if (!phone) return json({ ok: false, error: "This patient has no usable phone number on their record." }, 400);

    // 153 patients have a phone number stored where their name should be.
    // Twilio rejects an empty substitution anyway, so this refuses here with
    // words a receptionist can act on rather than a Twilio error code.
    const greeting = patientGreeting(patient.first_name, patient.last_name, patient.gender);
    if (!greeting) {
      return json({ ok: false, error: "This patient's name is not usable in a message. Correct the name on their record first." }, 400);
    }

    const creds = twilioCreds();
    const from = Deno.env.get("TWILIO_WHATSAPP_FROM");
    const templateSid = Deno.env.get(template.secret);
    if (!creds || !from || !templateSid) {
      return json({ ok: false, error: `The ${template.label} is not configured yet. Please ask your administrator to add the approved template.` }, 503);
    }

    const admin = createClient(url, serviceKey);
    // If the patient wrote to us in the last 24 hours, send the same words as
    // an ordinary message: outside that window WhatsApp delivers nothing but
    // an approved template.
    const { data: lastInbound } = await admin
      .from("whatsapp_conversations")
      .select("created_at")
      .eq("phone", phone)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const inWindow = isWithinServiceWindow(lastInbound?.created_at);
    const params = inWindow
      ? followupSessionParams(phone, from, kind as FollowupKind, greeting)
      : followupTemplateParams(phone, from, templateSid, greeting);

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: creds.auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      // The deleted templates, said in words a receptionist can act on.
      //
      // Twilio answers a ContentSid that no longer exists with the bare string
      // "Content was not found", and relaying that put exactly those four
      // words in front of the front desk on 10 Nov - a message that names
      // nothing, blames nothing and suggests nothing. The two templates had
      // been deleted that morning, and this function cannot know that until
      // Twilio tells it.
      //
      // This branch is reachable only from a build that still calls this
      // function at all. The current buttons open WhatsApp directly and never
      // get here; an edge function reaches the clinic the moment it deploys,
      // with no publish, which is why it is worth saying properly here.
      const twilioSaid = String(result?.message || "");
      if (isDeletedTemplateError(result?.code, twilioSaid)) {
        return json({
          ok: false,
          error:
            `The approved WhatsApp template for the ${template.label} no longer exists, so it cannot be sent this way. ` +
            `Publish the app to get the updated buttons, which open WhatsApp with the message ready instead.`,
          code: result?.code ?? null,
        }, 502);
      }
      return json({ ok: false, error: twilioSaid || "WhatsApp could not accept the follow-up", code: result?.code ?? null }, 502);
    }
    if (!result?.sid) {
      return json({ ok: false, error: "WhatsApp did not confirm the follow-up. Check the delivery log before trying again." }, 502);
    }

    // Twilio usually returns no body for a template send, so the fallback text
    // is the common case. It carries the template label because the button
    // reads these rows back to show when a follow-up last went out.
    const { error: logError } = await admin.from("whatsapp_conversations").insert({
      phone,
      patient_id,
      direction: "outbound",
      role: "assistant",
      content: result.body || `${template.label} sent using the approved clinic template.`,
      message_sid: result.sid,
    });
    if (logError) console.error("Follow-up accepted but conversation recording failed");

    return json({ ok: true, messageSid: result.sid, recorded: !logError, mode: inWindow ? "session" : "template" });
  } catch {
    return json({ ok: false, error: "The follow-up could not be completed. Check the WhatsApp delivery log before trying again." }, 500);
  }
});
