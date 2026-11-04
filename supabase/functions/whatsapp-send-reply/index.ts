// Sends one typed reply from the clinic to a patient on WhatsApp, and records
// it so it appears in the conversation thread beside everything else.
//
// The front desk could read a patient saying "I called and nobody answered"
// and had no way to answer back without picking up a phone. This is that
// reply: what a person types, sent from the clinic's own number.
//
// Two rules it must respect, neither of them ours:
//
// 1. WhatsApp only delivers a freely written message within 24 hours of the
//    patient's last message. Outside that, Twilio refuses with error 63016 and
//    only an approved template may be sent. The screen already greys the box
//    out; if one gets here anyway, Twilio's own words come back so the front
//    desk is told why rather than shown a number.
// 2. The clinic's number is not an open relay. A caller must be signed in -
//    the same check whatsapp-delivery-sync makes.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.object({
  phone: z.string().min(6),
  message: z.string().trim().min(1).max(1500),
});

/** The same shape the webhook sends with, so both halves of a thread match. */
const asWhatsApp = (value: string) => (value.startsWith("whatsapp:") ? value : `whatsapp:${value}`);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !u?.user) return json({ error: "Unauthorized" }, 401);

    let raw: unknown;
    try { raw = await req.json(); } catch { return json({ error: "A phone number and a message are needed" }, 400); }
    const parsed = Body.safeParse(raw);
    if (!parsed.success) return json({ error: "A phone number and a message are needed" }, 400);
    const { phone, message } = parsed.data;

    const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const tok = Deno.env.get("TWILIO_AUTH_TOKEN");
    const from = Deno.env.get("TWILIO_WHATSAPP_FROM");
    if (!sid || !tok || !from) return json({ error: "WhatsApp service not configured" }, 500);

    const params = new URLSearchParams({
      To: asWhatsApp(phone),
      From: asWhatsApp(from),
      Body: message,
    });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${sid}:${tok}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const result = await res.json();

    if (!res.ok) {
      console.error("[whatsapp-send-reply] Twilio refused:", result);
      // 63016 is the 24-hour window. Say what it means; the code is kept for
      // anyone reading the logs.
      const outsideWindow = Number(result?.code) === 63016;
      return json({
        error: outsideWindow
          ? "WhatsApp will not deliver a typed message more than 24 hours after the patient's last one. They have to write again first."
          : String(result?.message || "The message could not be sent"),
        code: result?.code ?? null,
      }, 400);
    }

    // The patient this number belongs to, matched on the last ten digits as
    // the webhook matches, so the reply is filed against the same record.
    const last10 = phone.replace(/\D/g, "").slice(-10);
    let patientId: string | null = null;
    if (last10.length === 10) {
      const { data: patient } = await admin
        .from("patients")
        .select("id")
        .or(`phone.eq.${phone},phone.ilike.%${last10}`)
        .limit(1);
      patientId = patient?.[0]?.id ?? null;
    }

    // Recorded as outbound, which is all the thread reads. `role` is one of
    // user/assistant/system/tool by the table's own rule, so a person's reply
    // is stored as assistant - the clinic speaking, which is what it is.
    const { error: logErr } = await admin.from("whatsapp_conversations").insert({
      phone: phone.replace(/^whatsapp:/, ""),
      patient_id: patientId,
      direction: "outbound",
      role: "assistant",
      content: message,
      message_sid: result.sid ?? null,
    });
    // The message is already with the patient, so a failure to write it down
    // is not a failed send: say it went, and leave the trace in the logs.
    if (logErr) console.error("[whatsapp-send-reply] sent but not recorded:", logErr);

    return json({ sid: result.sid ?? null, recorded: !logErr });
  } catch (e) {
    console.error("[whatsapp-send-reply] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
