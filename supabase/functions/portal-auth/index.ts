// Portal authentication: check phone, set PIN, verify PIN
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  return res;
}

/**
 * Everyone reachable on this number, newest registration first.
 *
 * This used to fetch `patients?...&order=created_at.desc&limit=5000` and
 * match in JavaScript. PostgREST caps a response at 1000 rows, so the
 * function only ever saw the newest 1000 of 27,625 patients and told the
 * other 26,625 that their number was not registered. The cap is documented
 * twice elsewhere in this repo - sf-match-phones and supabasePaginate.ts
 * both page around it.
 *
 * The question is now asked of the database, against an indexed column, so
 * there is no page to run off the end of.
 *
 * It returns a LIST because a fifth of this clinic's patients share a phone
 * with somebody else - families, up to fourteen on one number - and the PIN
 * is per patient. Picking one silently is what locked the rest of a family
 * out.
 */
async function patientsOnPhone(phone: string): Promise<PortalPatient[]> {
  const cleaned = cleanPhone(phone);
  if (cleaned.length < 10) return [];

  const res = await sb(`rpc/portal_patients_by_phone`, {
    method: "POST",
    body: JSON.stringify({ p_last10: cleaned }),
  });
  if (!res.ok) {
    console.error(`[portal-auth] Lookup failed with status ${res.status}`);
    return [];
  }
  const rows = (await res.json()) as PortalPatient[];
  // Count only. This used to log five patients' names and phone numbers on
  // every single login attempt, into a log the clinic does not control.
  console.log(`[portal-auth] ${rows.length} patient(s) on that number`);
  return Array.isArray(rows) ? rows : [];
}

interface PortalPatient {
  id: string;
  first_name: string | null;
  last_name: string | null;
  portal_pin_hash: string | null;
  portal_pin_failed_attempts: number | null;
  portal_pin_locked_until: string | null;
}

const fullName = (p: PortalPatient) =>
  `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();

/**
 * The patient this request is about.
 *
 * `patientId` arrives only after the chooser has been shown, and it is
 * CHECKED against the candidates for the phone rather than trusted. Without
 * that check, passing any patient's uuid alongside any phone number would
 * let somebody set a PIN on a record that is not theirs.
 */
function chosenPatient(candidates: PortalPatient[], patientId?: string): PortalPatient | null {
  if (candidates.length === 0) return null;
  if (!patientId) return candidates.length === 1 ? candidates[0] : null;
  return candidates.find((c) => c.id === patientId) ?? null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Issue a portal session. Only the hash is stored, so a leaked database row
// can't be replayed as a login; the raw token lives only in the patient's
// browser and is exchanged for data through the portal-data function.
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
    const { action, phone, pin, patientId } = await req.json();
    // The number typed is not logged: it identifies a patient.
    console.log(`[portal-auth] Request: action=${action}`);

    if (!action || !phone) return json({ error: "Missing action or phone" }, 400);

    // Said plainly rather than as "not registered", which sent people to the
    // clinic to check a number that was simply half-typed.
    if (cleanPhone(phone).length < 10) {
      return json({ status: "incomplete_number" }, 200);
    }

    const candidates = await patientsOnPhone(phone);
    if (candidates.length === 0) {
      return json({ status: "not_registered" }, 200);
    }

    // Check also acts on the selected patient: validate the id against this
    // phone before deciding which PIN screen to show.
    const patient = chosenPatient(candidates, patientId);
    if (!patient) {
      return json({ status: "choose_patient",
        patients: candidates.map((c) => ({ id: c.id, name: fullName(c) })) }, 200);
    }

    if (action === "check") {
      return json({
        status: patient.portal_pin_hash ? "pin_required" : "set_pin",
        patientId: patient.id,
        patientName: fullName(patient),
      });
    }

    if (action === "set_pin") {
      if (!pin || !/^\d{4}$/.test(pin)) return json({ error: "PIN must be 4 digits" }, 400);
      if (patient.portal_pin_hash) return json({ error: "PIN already set. Use Forgot PIN to reset." }, 400);
      const hash = await sha256(`${patient.id}:${pin}`);
      const upd = await sb(`patients?id=eq.${patient.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          portal_pin_hash: hash,
          portal_pin_failed_attempts: 0,
          portal_pin_locked_until: null,
        }),
      });
      if (!upd.ok) return json({ error: "Failed to save PIN" }, 500);
      console.log(`[portal-auth] PIN set`);
      return json({
        status: "ok",
        patientId: patient.id,
        patientName: fullName(patient),
        sessionToken: await createSession(patient.id),
      });
    }

    if (action === "verify") {
      if (!pin || !/^\d{4}$/.test(pin)) return json({ error: "PIN must be 4 digits" }, 400);
      if (!patient.portal_pin_hash) return json({ status: "set_pin", patientId: patient.id }, 200);

      // Locked?
      if (patient.portal_pin_locked_until && new Date(patient.portal_pin_locked_until) > new Date()) {
        console.log(`[portal-auth] Account locked until ${patient.portal_pin_locked_until}`);
        return json(
          {
            status: "locked",
            lockedUntil: patient.portal_pin_locked_until,
          },
          200,
        );
      }

      const hash = await sha256(`${patient.id}:${pin}`);
      if (hash === patient.portal_pin_hash) {
        await sb(`patients?id=eq.${patient.id}`, {
          method: "PATCH",
          body: JSON.stringify({ portal_pin_failed_attempts: 0, portal_pin_locked_until: null }),
        });
        console.log(`[portal-auth] PIN verified`);
        return json({
          status: "ok",
          patientId: patient.id,
          patientName: fullName(patient),
          sessionToken: await createSession(patient.id),
        });
      }

      const attempts = (patient.portal_pin_failed_attempts || 0) + 1;
      const lockNow = attempts >= 3;
      const lockedUntil = lockNow ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
      await sb(`patients?id=eq.${patient.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          portal_pin_failed_attempts: lockNow ? 0 : attempts,
          portal_pin_locked_until: lockedUntil,
        }),
      });
      console.log(`[portal-auth] Wrong PIN, attempt ${attempts}`);
      return json(
        {
          status: lockNow ? "locked" : "wrong_pin",
          lockedUntil,
          attemptsLeft: lockNow ? 0 : 3 - attempts,
        },
        200,
      );
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    console.error("[portal-auth] Exception:", e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});
