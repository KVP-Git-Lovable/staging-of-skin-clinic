import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length === 10) return `+91${cleaned}`;
  if (cleaned.length === 12 && cleaned.startsWith("91")) return `+${cleaned}`;
  return `+${cleaned}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { patient_id, template_name, response_id } = await req.json();
    if (!patient_id || !template_name) {
      return new Response(JSON.stringify({ error: "patient_id and template_name required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: patient } = await supabase
      .from("patients")
      .select("first_name, last_name, phone")
      .eq("id", patient_id)
      .single();

    if (!patient?.phone) {
      console.log("No phone for patient", patient_id);
      return new Response(JSON.stringify({ success: false, reason: "no_phone" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromNumber = Deno.env.get("TWILIO_WHATSAPP_FROM");
    const templateSid =
      Deno.env.get("SURVEY_WHATSAPP_TEMPLATE_SID") ||
      "HXbe9d1829421018953ce89df065820c40";

    if (!accountSid || !authToken || !fromNumber) {
      console.error("Missing Twilio credentials");
      return new Response(JSON.stringify({ error: "Twilio not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const toNumber = normalizePhone(patient.phone);
    if (!toNumber) {
      return new Response(JSON.stringify({ error: "Invalid phone" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fromFormatted = fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`;
    const toFormatted = `whatsapp:${toNumber}`;
    const patientName = `${patient.first_name || ""} ${patient.last_name || ""}`.trim();

    const params: Record<string, string> = {
      To: toFormatted,
      From: fromFormatted,
    };

    if (templateSid) {
      params.ContentSid = templateSid;
      params.ContentVariables = JSON.stringify({
        "1": patientName,
        "2": template_name,
        "3": "https://clinic.quickapp.ai/portal/surveys",
      });
    } else {
      params.Body = `Hi ${patientName}, please fill the "${template_name}" survey here: https://clinic.quickapp.ai/portal/surveys`;
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = btoa(`${accountSid}:${authToken}`);

    const twilioRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params).toString(),
    });

    const result = await twilioRes.json();
    if (!twilioRes.ok) {
      console.error("Twilio error:", result);
      return new Response(JSON.stringify({ error: "Twilio failed", details: result }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Survey WhatsApp sent:", { sid: result.sid, to: toFormatted, response_id });
    return new Response(JSON.stringify({ success: true, messageSid: result.sid }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-survey-whatsapp error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});