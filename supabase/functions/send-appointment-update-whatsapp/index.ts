import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UPDATE_TEMPLATE_SID = "HX1750d865022c866cf68dc134cd93c6eb";
const CANCEL_TEMPLATE_SID = "HX5abaead3d3ff7822e498705bd132d708";

function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length === 10) return `+91${cleaned}`;
  if (cleaned.length === 12 && cleaned.startsWith("91")) return `+${cleaned}`;
  return `+${cleaned}`;
}

function titleFromGender(gender?: string | null): string {
  if (!gender) return "";
  const g = gender.toLowerCase();
  if (g.startsWith("m")) return "Mr.";
  if (g.startsWith("f")) return "Ms.";
  return "";
}

// If an ISO timestamp is passed instead of a pre-formatted string, render it
// in IST (Asia/Kolkata). Already-formatted strings like "12:00 PM" pass through.
function ensureIstTime(value: string): string {
  if (!value) return value;
  if (!/T\d{2}:\d{2}/.test(value)) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      phone,
      patientName,
      status,
      appointmentDate,
      appointmentTime,
      doctorName,
      serviceName,
      kind,
      patientGender,
    } = await req.json();

    if (!phone || !patientName || !appointmentDate || !appointmentTime) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromNumber = Deno.env.get("TWILIO_WHATSAPP_FROM");

    if (!accountSid || !authToken || !fromNumber) {
      return new Response(
        JSON.stringify({ error: "Twilio not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const toNumber = normalizePhone(phone);
    if (!toNumber) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const fromFormatted = fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`;
    const toFormatted = `whatsapp:${toNumber}`;

    let templateSid: string;
    let contentVariables: string;

    if (kind === "cancelled") {
      templateSid = CANCEL_TEMPLATE_SID;
      contentVariables = JSON.stringify({
        "1": patientName,
        "2": appointmentDate,
        "3": ensureIstTime(appointmentTime),
      });
    } else {
      templateSid = UPDATE_TEMPLATE_SID;

      // Fetch clinic phone + city from clinic_settings
      let clinicPhone = "";
      let clinicCity = "";
      try {
        const supaUrl = Deno.env.get("SUPABASE_URL")!;
        const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supa = createClient(supaUrl, supaKey);
        const { data: clinic } = await supa
          .from("clinic_settings")
          .select("phone, city")
          .limit(1)
          .maybeSingle();
        clinicPhone = clinic?.phone || "";
        clinicCity = clinic?.city || "";
      } catch (e) {
        console.error("clinic_settings fetch failed", e);
      }

      const title = titleFromGender(patientGender);
      const namedPatient = title ? `${title} ${patientName}`.trim() : patientName;

      contentVariables = JSON.stringify({
        "1": namedPatient,
        "2": ensureIstTime(appointmentTime),
        "3": serviceName || "Consultation",
        "4": clinicPhone || "-",
        "5": clinicCity || "-",
      });
    }

    const body = new URLSearchParams({
      To: toFormatted,
      From: fromFormatted,
      ContentSid: templateSid,
      ContentVariables: contentVariables,
    });

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = btoa(`${accountSid}:${authToken}`);

    const twilioRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const result = await twilioRes.json();

    if (!twilioRes.ok) {
      console.error("Twilio API error:", result);
      return new Response(
        JSON.stringify({ error: "Failed to send WhatsApp message", details: result }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("Appointment update WhatsApp sent:", { sid: result.sid, kind, to: toFormatted });

    return new Response(
      JSON.stringify({ success: true, messageSid: result.sid }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-appointment-update-whatsapp error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});