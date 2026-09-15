// Patient-portal data gateway.
//
// The portal is not a Supabase-auth app: patients sign in with a phone + PIN,
// so every browser request would otherwise run as the anonymous role. Patient,
// billing and clinical tables are (correctly) closed to that role, so the
// portal reads and writes its data here instead: the caller presents the
// session token issued at login, this function validates it server-side and
// then queries with the service role, strictly scoped to that one patient.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

async function rows(path: string): Promise<any[]> {
  const res = await sb(path);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Query failed (${res.status}): ${body}`);
  }
  return await res.json();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resolveSession(token: unknown): Promise<{ patientId: string } | null> {
  if (typeof token !== "string" || !/^[0-9a-fA-F-]{36}$/.test(token)) return null;
  const hash = await sha256(token);
  const found = await rows(
    `portal_sessions?select=id,patient_id,expires_at&token_hash=eq.${hash}&limit=1`,
  );
  const row = found[0];
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) return null;
  // Best-effort touch; never block the request on it.
  sb(`portal_sessions?id=eq.${row.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_used_at: new Date().toISOString() }),
  }).catch(() => {});
  return { patientId: row.patient_id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { token, action, payload } = body as {
      token?: string;
      action?: string;
      payload?: Record<string, any>;
    };

    if (!action || typeof action !== "string") return json({ error: "Missing action" }, 400);

    const session = await resolveSession(token);
    if (!session) return json({ error: "Session expired", code: "unauthorized" }, 401);
    const pid = session.patientId;
    const p = payload || {};

    switch (action) {
      case "profile":
        return json({ data: (await rows(`patients?select=*&id=eq.${pid}&limit=1`))[0] ?? null });

      case "shop_address":
        return json({
          data:
            (await rows(
              `patients?select=address,city,state,pincode,phone&id=eq.${pid}&limit=1`,
            ))[0] ?? null,
        });

      case "appointments":
        return json({
          data: await rows(
            `appointments?select=*,staff(first_name,last_name)&patient_id=eq.${pid}&order=start_time.desc`,
          ),
        });

      case "procedures":
        return json({
          data: await rows(
            `procedures?select=*,staff:staff!procedures_staff_id_fkey(first_name,last_name),prescriptions(*)&patient_id=eq.${pid}&order=procedure_date.desc`,
          ),
        });

      case "photos":
        return json({
          data: await rows(
            `patient_photos?select=*,procedures(service_name)&patient_id=eq.${pid}&order=taken_at.desc`,
          ),
        });

      case "invoices":
        return json({
          data: await rows(`invoices?select=*&patient_id=eq.${pid}&order=created_at.desc`),
        });

      case "invoice_pdf_url": {
        const invoiceId = String(p.invoiceId || "");
        if (!/^[0-9a-fA-F-]{36}$/.test(invoiceId)) return json({ error: "Invalid invoice" }, 400);
        const inv = (
          await rows(`invoices?select=id,pdf_url,updated_at&id=eq.${invoiceId}&patient_id=eq.${pid}&limit=1`)
        )[0];
        if (!inv) return json({ error: "Invoice not found" }, 404);
        return json({ data: { pdf_url: inv.pdf_url ?? null } });
      }

      case "pharma_requests":
        return json({
          data: await rows(
            `patient_pharma_requests?select=*&patient_id=eq.${pid}&order=created_at.desc`,
          ),
        });

      case "staff":
        return json({
          data: await rows(
            `staff?select=id,first_name,last_name,role,specialization&is_active=eq.true&order=first_name.asc`,
          ),
        });

      case "assigned_surveys":
        return json({
          data: await rows(
            `survey_assignments?select=*,survey_templates(id,name,description)&patient_id=eq.${pid}&status=eq.pending&order=created_at.desc`,
          ),
        });

      case "create_appointment_request": {
        const { patientName, service, startTime, endTime } = p;
        if (!service || !startTime || !endTime) return json({ error: "Missing appointment details" }, 400);
        const res = await sb(`appointments`, {
          method: "POST",
          body: JSON.stringify({
            patient_id: pid,
            patient_name: patientName || null,
            service,
            start_time: startTime,
            end_time: endTime,
            status: "Requested",
            source: "portal",
          }),
        });
        if (!res.ok) return json({ error: await res.text() }, 500);
        return json({ data: (await res.json())[0] ?? null });
      }

      case "create_pharma_request": {
        const { productId, productName, quantity, notes } = p;
        if (!productId) return json({ error: "Missing product" }, 400);
        const res = await sb(`patient_pharma_requests`, {
          method: "POST",
          body: JSON.stringify({
            patient_id: pid,
            product_id: productId,
            product_name: productName || "",
            quantity: Number(quantity) || 1,
            notes: notes || null,
          }),
        });
        if (!res.ok) return json({ error: await res.text() }, 500);
        return json({ data: (await res.json())[0] ?? null });
      }

      case "submit_survey": {
        const { templateId, answers, aiRecommendation, aiProducts, aiServices, assignmentId } = p;
        if (!templateId) return json({ error: "Missing survey template" }, 400);
        const res = await sb(`survey_responses`, {
          method: "POST",
          body: JSON.stringify({
            template_id: templateId,
            patient_id: pid,
            appointment_id: null,
            answers: answers || {},
            ai_recommendation: aiRecommendation || {},
            ai_products: aiProducts || [],
            ai_services: aiServices || [],
            dr_status: "pending_review",
          }),
        });
        if (!res.ok) return json({ error: await res.text() }, 500);
        const inserted = (await res.json())[0];
        if (assignmentId) {
          await sb(`survey_assignments?id=eq.${assignmentId}&patient_id=eq.${pid}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ status: "completed", response_id: inserted?.id }),
          });
        }
        return json({ data: inserted ?? null });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e: any) {
    console.error("portal-data error:", e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});
