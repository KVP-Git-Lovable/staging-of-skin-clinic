const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Appointment confirmation template with "Confirm" / "I need to modify" /
// "I want to cancel" quick-reply buttons. Takes 2 variables: name and
// date+time. The button labels are load-bearing - whatsapp-webhook matches
// replies against that exact text - so a future revision must keep them.
//
// Read from the environment so the next revision is a secret change rather than
// a deploy (Twilio cannot edit an approved template, so every reword means a new
// id). Same shape as portal-otp-send.
const TEMPLATE_SID =
  Deno.env.get("TWILIO_APPOINTMENT_TEMPLATE_SID") ||
  "HX2c965add7f2cc9d16757d594cd30f04c";

function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  if (cleaned.startsWith("+")) return cleaned;
  // Indian numbers: 10 digits => prefix +91
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
    const { phone, patientName, appointmentDate, appointmentTime, serviceName, patientGender } = await req.json();

    if (!phone || !patientName || !appointmentDate || !appointmentTime) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: phone, patientName, appointmentDate, appointmentTime" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromNumber = Deno.env.get("TWILIO_WHATSAPP_FROM");

    if (!accountSid || !authToken || !fromNumber) {
      console.error("Missing Twilio credentials");
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

    const title = titleFromGender(patientGender);
    const namedPatient = title ? `${title} ${patientName}`.trim() : patientName;

    // Format date as "Friday, 23 May 2026"
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const d = new Date(appointmentDate);
    let dayAndDate = appointmentDate;
    if (!isNaN(d.getTime())) {
      const dayName = dayNames[d.getDay()];
      const day = d.getDate();
      const month = monthNames[d.getMonth()];
      const year = d.getFullYear();
      dayAndDate = `${dayName}, ${day} ${month} ${year}`;
    }

    const dateAndTime = `${dayAndDate} at ${ensureIstTime(appointmentTime)}`;

    // Exactly as many variables as the template declares - Twilio rejects the
    // send outright on a mismatch. serviceName is still accepted in the request
    // body (callers pass it) but the template no longer names the service.
    const contentVariables = JSON.stringify({
      "1": namedPatient,
      "2": dateAndTime,
    });

    const body = new URLSearchParams({
      To: toFormatted,
      From: fromFormatted,
      ContentSid: TEMPLATE_SID,
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
      // Naming the template here is what identifies a parameter-count mismatch,
      // and tells us which version of this function is actually deployed.
      console.error("Twilio API error:", { template: TEMPLATE_SID, result });
      return new Response(
        JSON.stringify({ error: "Failed to send WhatsApp message", details: result }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("WhatsApp sent:", { sid: result.sid, template: TEMPLATE_SID, to: toFormatted, patientName });

    return new Response(
      JSON.stringify({ success: true, messageSid: result.sid, templateSid: TEMPLATE_SID }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-appointment-whatsapp error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});