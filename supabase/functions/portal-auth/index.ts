// Portal authentication: check phone, set PIN, verify PIN
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function cleanPhone(p: string): string {
  return (p || "").replace(/\D/g, "").slice(-10);
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

async function findPatientByPhone(phone: string) {
  const cleaned = cleanPhone(phone);
  console.log(`[portal-auth] Looking for phone: ${phone} (cleaned: ${cleaned})`);

  if (cleaned.length < 10) {
    console.log(`[portal-auth] Phone too short: ${cleaned.length} digits`);
    return null;
  }

  try {
    // Fetch patients with a large limit to handle all records
    console.log(`[portal-auth] Querying patients table...`);
    const res = await sb(
      `patients?select=id,first_name,last_name,phone,portal_pin_hash,portal_pin_failed_attempts,portal_pin_locked_until&order=created_at.desc&limit=5000`,
    );

    if (!res.ok) {
      console.error(`[portal-auth] Query failed with status ${res.status}`);
      const errorText = await res.text();
      console.error(`[portal-auth] Error body: ${errorText}`);
      return null;
    }

    const rows = await res.json();
    console.log(`[portal-auth] Found ${rows.length} total patients in database`);

    if (rows.length === 0) {
      console.log(`[portal-auth] Database is empty!`);
      return null;
    }

    // Log first 5 patients for debugging
    console.log(`[portal-auth] First 5 patients in DB:`);
    rows.slice(0, 5).forEach((r: any, i: number) => {
      console.log(
        `  [${i}] ${r.first_name} ${r.last_name} | Phone: "${r.phone}" | Cleaned: "${cleanPhone(r.phone || "")}"`,
      );
    });

    // Find patient with matching cleaned phone (handle various formats)
    const found = rows.find((r: any) => {
      const storedCleaned = cleanPhone(r.phone || "");
      const match = storedCleaned === cleaned;
      if (match) {
        console.log(
          `[portal-auth] ✓ MATCH FOUND: ${r.first_name} ${r.last_name} (stored: "${r.phone}" -> cleaned: "${storedCleaned}")`,
        );
      }
      return match;
    });

    if (!found) {
      console.log(`[portal-auth] ✗ NO MATCH: Phone ${cleaned} not found in any of ${rows.length} patients`);
    }

    return found || null;
  } catch (err: any) {
    console.error(`[portal-auth] Exception in findPatientByPhone:`, err);
    return null;
  }
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
    const { action, phone, pin } = await req.json();
    console.log(`[portal-auth] Request: action=${action}, phone=${phone}`);

    if (!action || !phone) return json({ error: "Missing action or phone" }, 400);

    const patient = await findPatientByPhone(phone);
    if (!patient) {
      console.log(`[portal-auth] Patient not found, returning not_registered`);
      return json({ status: "not_registered" }, 200);
    }

    console.log(`[portal-auth] Patient found: ${patient.first_name} ${patient.last_name}`);

    if (action === "check") {
      console.log(`[portal-auth] Check action - has PIN: ${!!patient.portal_pin_hash}`);
      return json({
        status: patient.portal_pin_hash ? "pin_required" : "set_pin",
        patientId: patient.id,
        patientName: `${patient.first_name} ${patient.last_name}`,
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
      console.log(`[portal-auth] PIN set for ${patient.first_name} ${patient.last_name}`);
      return json({
        status: "ok",
        patientId: patient.id,
        patientName: `${patient.first_name} ${patient.last_name}`,
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
        console.log(`[portal-auth] ✓ PIN verified for ${patient.first_name} ${patient.last_name}`);
        return json({
          status: "ok",
          patientId: patient.id,
          patientName: `${patient.first_name} ${patient.last_name}`,
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
      console.log(`[portal-auth] ✗ Wrong PIN attempt ${attempts} for ${patient.first_name} ${patient.last_name}`);
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
