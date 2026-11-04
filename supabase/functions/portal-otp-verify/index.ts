// Verify OTP and set new PIN.
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
    const { phone, otp, newPin, patientId } = await req.json();
    if (!phone || !otp || !newPin) return json({ error: "Missing fields" }, 400);
    if (!/^\d{4}$/.test(newPin)) return json({ error: "PIN must be 4 digits" }, 400);
    if (!/^\d{6}$/.test(otp)) return json({ error: "OTP must be 6 digits" }, 400);

    const cleaned = cleanPhone(phone);
    const candidates = await patientsOnPhone(cleaned);
    if (candidates.length === 0) return json({ error: "Not registered" }, 404);

    // The OTP was issued to one person on this number; the reset must land
    // on that same person and not on whoever happens to sort first.
    const patient = chosenPatient(candidates, patientId);
    if (!patient) return json({ error: "Choose who is resetting the PIN" }, 400);

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