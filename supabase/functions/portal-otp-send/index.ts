// Send a 6-digit WhatsApp OTP to the patient's registered phone for portal PIN reset.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Mirrors phoneKey in src/lib/portalPhoneLogin.ts - Deno cannot import from
 * the browser bundle. Keep the two in step: this decides who can log in.
 *
 * Returns "" rather than a short key for an incomplete number. A nine-digit
 * key would match the tail of other people's numbers.
 */
function cleanPhone(p: string): string {
  const digits = (p || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
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


/**
 * Everyone reachable on this number, newest registration first.
 *
 * Was `patients?select=...&limit=N` matched in JavaScript. PostgREST caps a
 * response at 1000 rows, so only the newest 1000 of 27,625 patients could
 * ever be found and the Forgot-PIN escape hatch failed for the same 96% of
 * people as the login itself. The database answers it now, against an
 * indexed column.
 *
 * A list, not one patient: a fifth of this clinic shares a phone with
 * somebody - families, up to fourteen on a number - and both the PIN and
 * the OTP belong to a person rather than to the phone.
 */
interface PortalPatient {
  id: string;
  first_name: string | null;
  last_name: string | null;
  portal_pin_hash: string | null;
  portal_pin_failed_attempts: number | null;
  portal_pin_locked_until: string | null;
}

async function patientsOnPhone(cleaned: string): Promise<PortalPatient[]> {
  if (cleaned.length < 10) return [];
  const res = await sb(`rpc/portal_patients_by_phone`, {
    method: "POST",
    body: JSON.stringify({ p_last10: cleaned }),
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as PortalPatient[];
  return Array.isArray(rows) ? rows : [];
}

/** The chosen patient, CHECKED against the number - never trusted from the
 *  request, or any uuid could be paired with any phone. */
function chosenPatient(candidates: PortalPatient[], patientId?: string): PortalPatient | null {
  if (candidates.length === 0) return null;
  if (!patientId) return candidates.length === 1 ? candidates[0] : null;
  return candidates.find((c) => c.id === patientId) ?? null;
}

const fullName = (p: PortalPatient) => `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { phone, patientId } = await req.json();
    if (!phone) return json({ error: "Phone required" }, 400);

    const cleaned = cleanPhone(phone);
    if (cleaned.length < 10) return json({ status: "incomplete_number" });

    const candidates = await patientsOnPhone(cleaned);
    if (candidates.length === 0) return json({ status: "not_registered" });

    // A family number: the code has to be sent to a person, so ask first.
    const patient = chosenPatient(candidates, patientId);
    if (!patient) {
      return json({
        status: "choose_patient",
        patients: candidates.map((c) => ({ id: c.id, name: fullName(c) })),
      });
    }

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