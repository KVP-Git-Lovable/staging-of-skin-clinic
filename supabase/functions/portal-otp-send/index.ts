// Send a 6-digit WhatsApp OTP to the patient's registered phone for portal PIN reset.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function cleanPhone(p: string): string {
  return (p || "").replace(/\D/g, "").slice(-10);
}

function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length === 10) return `+91${cleaned}`;
  if (cleaned.length === 12 && cleaned.startsWith("91")) return `+${cleaned}`;
  return `+${cleaned}`;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sb(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { phone } = await req.json();
    if (!phone) return json({ error: "Phone required" }, 400);

    const cleaned = cleanPhone(phone);
    if (cleaned.length < 10) return json({ status: "not_registered" });

    const res = await sb(`patients?select=id,first_name,phone&limit=2000`);
    const rows = res.ok ? await res.json() : [];
    const patient = rows.find((r: any) => cleanPhone(r.phone || "") === cleaned);
    if (!patient) return json({ status: "not_registered" });

    // Throttle: latest unused OTP younger than 30s?
    const recent = await sb(
      `patient_portal_otps?patient_id=eq.${patient.id}&order=created_at.desc&limit=1`,
    );
    if (recent.ok) {
      const lastArr = await recent.json();
      const last = lastArr[0];
      if (last) {
        const ageSec = (Date.now() - new Date(last.created_at).getTime()) / 1000;
        if (ageSec < 30) {
          return json({ status: "throttled", retryAfter: Math.ceil(30 - ageSec) }, 429);
        }
      }
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = await sha256(`${patient.id}:${otp}`);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const ins = await sb(`patient_portal_otps`, {
      method: "POST",
      body: JSON.stringify({ patient_id: patient.id, otp_hash: otpHash, expires_at: expiresAt }),
    });
    if (!ins.ok) return json({ error: "Failed to create OTP" }, 500);

    // Send via Twilio WhatsApp
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromNumber = Deno.env.get("TWILIO_WHATSAPP_FROM");
    const templateSid =
      Deno.env.get("TWILIO_OTP_TEMPLATE_SID") ||
      "HXb2a9e20b46c0b3f0ae4d556bdc301192";

    if (!accountSid || !authToken || !fromNumber) {
      console.error("Missing Twilio credentials");
      return json({ error: "WhatsApp not configured" }, 500);
    }

    const toNumber = normalizePhone(patient.phone);
    if (!toNumber) return json({ error: "Invalid phone" }, 400);

    const fromFormatted = fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`;
    const toFormatted = `whatsapp:${toNumber}`;

    const body = new URLSearchParams({ To: toFormatted, From: fromFormatted });

    if (templateSid) {
      // Approved template flow with {{1}} = OTP
      body.set("ContentSid", templateSid);
      body.set("ContentVariables", JSON.stringify({ "1": otp }));
    } else {
      // Fallback: freeform message (works only within 24h customer service window)
      body.set("Body", `Your Skin Clinic portal verification code is: ${otp}. It expires in 10 minutes.`);
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = btoa(`${accountSid}:${authToken}`);
    const tw = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const twJson = await tw.json().catch(() => ({}));
    if (!tw.ok) {
      console.error("Twilio error", twJson);
      return json({ error: "Failed to send OTP", details: twJson }, 500);
    }

    return json({ status: "sent" });
  } catch (e: any) {
    console.error("portal-otp-send error:", e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});