// Verify OTP and set new PIN.
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

// Same session issuing as portal-auth: store only the hash, hand the raw
// token to the browser for use with the portal-data function.
const SESSION_DAYS = 30;

async function createSession(patientId: string): Promise<string> {
  const token = crypto.randomUUID();
  const tokenHash = await sha256(token);
  await sb(`portal_sessions`, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      patient_id: patientId,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    }),
  });
  return token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { phone, otp, newPin } = await req.json();
    if (!phone || !otp || !newPin) return json({ error: "Missing fields" }, 400);
    if (!/^\d{4}$/.test(newPin)) return json({ error: "PIN must be 4 digits" }, 400);
    if (!/^\d{6}$/.test(otp)) return json({ error: "OTP must be 6 digits" }, 400);

    const cleaned = cleanPhone(phone);
    const res = await sb(`patients?select=id,first_name,last_name,phone&limit=2000`);
    const rows = res.ok ? await res.json() : [];
    const patient = rows.find((r: any) => cleanPhone(r.phone || "") === cleaned);
    if (!patient) return json({ error: "Not registered" }, 404);

    const otpHash = await sha256(`${patient.id}:${otp}`);
    const otpRes = await sb(
      `patient_portal_otps?patient_id=eq.${patient.id}&otp_hash=eq.${otpHash}&used=eq.false&order=created_at.desc&limit=1`,
    );
    const otpRows = otpRes.ok ? await otpRes.json() : [];
    const otpRow = otpRows[0];
    if (!otpRow) return json({ error: "Invalid OTP" }, 400);
    if (new Date(otpRow.expires_at) < new Date()) return json({ error: "OTP expired" }, 400);

    const pinHash = await sha256(`${patient.id}:${newPin}`);
    await sb(`patient_portal_otps?id=eq.${otpRow.id}`, {
      method: "PATCH",
      body: JSON.stringify({ used: true }),
    });
    const upd = await sb(`patients?id=eq.${patient.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        portal_pin_hash: pinHash,
        portal_pin_failed_attempts: 0,
        portal_pin_locked_until: null,
      }),
    });
    if (!upd.ok) return json({ error: "Failed to update PIN" }, 500);

    return json({
      status: "ok",
      patientId: patient.id,
      patientName: `${patient.first_name} ${patient.last_name}`,
      sessionToken: await createSession(patient.id),
    });
  } catch (e: any) {
    console.error("portal-otp-verify error:", e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});