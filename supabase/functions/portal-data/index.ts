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

/** The columns the portal's Feedback tab reads. */
interface FeedbackRow {
  id: string;
  appointment_id: string | null;
  nps_score: number | null;
  service_rating: number | null;
  comments: string | null;
  created_at: string;
  updated_at: string | null;
  last_edited_by: string | null;
  answers: unknown;
}

/** The visit a piece of feedback is about. */
interface FeedbackVisit {
  id: string;
  start_time: string | null;
  service: string | null;
  doctor_name: string | null;
  reason_for_consultation: string | null;
}

/**
 * Is the Feedback module switched on?
 *
 * The flag lives in portal_settings and the portal hides the tab when it is
 * off, but a hidden tab is not a closed door: the browser could still call
 * these actions. Both of them ask here first, so switching Feedback off in
 * Admin really does stop patients reading and editing feedback.
 *
 * Absent or null counts as OFF, matching src/lib/portalModules.ts - this is
 * the one module that is opt-in.
 */
async function feedbackEnabled(): Promise<boolean> {
  try {
    const row = (await rows(`portal_settings?select=feedback_enabled&limit=1`))[0];
    return row?.feedback_enabled === true;
  } catch {
    return false;
  }
}

/**
 * Is the Shop module switched on? Absent or null counts as ON, matching
 * src/lib/portalModules.ts (shop is one of the original default-on modules).
 * Orders are patient data, so the flag is enforced here as well as in the UI.
 */
async function shopEnabled(): Promise<boolean> {
  try {
    const row = (await rows(`portal_settings?select=shop_enabled&limit=1`))[0];
    return row?.shop_enabled !== false;
  } catch {
    return false;
  }
}

const UUID_RE = /^[0-9a-fA-F-]{36}$/;
const clip = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

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
            `appointments?select=*,staff:staff!appointments_staff_id_fkey(first_name,last_name)&patient_id=eq.${pid}&order=start_time.desc`,
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

      case "orders": {
        if (!(await shopEnabled())) return json({ data: [] });
        return json({
          data: await rows(
            `portal_orders?select=*,portal_order_items(*)&patient_id=eq.${pid}&order=created_at.desc`,
          ),
        });
      }

      case "create_order": {
        if (!(await shopEnabled())) return json({ error: "The shop is not available right now" }, 403);
        const rawItems = Array.isArray(p.items) ? p.items : [];
        if (rawItems.length === 0 || rawItems.length > 50) return json({ error: "Your cart is empty" }, 400);
        const wanted = new Map<string, number>();
        for (const it of rawItems) {
          const id = String(it?.productId || "");
          const qty = Math.floor(Number(it?.quantity));
          if (!UUID_RE.test(id) || !Number.isFinite(qty) || qty < 1 || qty > 100) {
            return json({ error: "Invalid cart item" }, 400);
          }
          wanted.set(id, (wanted.get(id) || 0) + qty);
        }
        const deliveryMethod = p.deliveryMethod === "delivery" ? "delivery" : "pickup";
        const delivery = deliveryMethod === "delivery";
        const address = delivery ? clip(p.address, 300) : null;
        const city = delivery ? clip(p.city, 100) : null;
        const pincode = delivery ? clip(p.pincode, 12) : null;
        if (delivery && (!address || !city || !pincode)) {
          return json({ error: "Please fill in your delivery address" }, 400);
        }

        // Names and prices come from the catalogue, never from the browser.
        const ids = [...wanted.keys()];
        const products = await rows(
          `pharma_products?select=id,name,selling_price,gst_percent&id=in.(${ids.join(",")})`,
        );
        if (products.length !== ids.length) return json({ error: "A product in your cart is no longer available" }, 400);
        const items = products.map((pr: any) => {
          const quantity = wanted.get(pr.id)!;
          const unit = Number(pr.selling_price) || 0;
          return { pr, quantity, unit, line: unit * quantity, gst: (unit * quantity * (Number(pr.gst_percent) || 0)) / 100 };
        });
        const total = items.reduce((s, i) => s + i.line + i.gst, 0);

        const patient = (await rows(`patients?select=first_name,last_name,phone&id=eq.${pid}&limit=1`))[0];
        const patientName = patient ? [patient.first_name, patient.last_name].filter(Boolean).join(" ") : null;

        const orderRes = await sb(`portal_orders`, {
          method: "POST",
          body: JSON.stringify({
            patient_id: pid,
            patient_name: patientName,
            delivery_method: deliveryMethod,
            address,
            city,
            state: delivery ? clip(p.state, 100) : null,
            pincode,
            phone: clip(p.phone, 20) || patient?.phone || null,
            total_amount: Math.round(total * 100) / 100,
            notes: clip(p.notes, 1000),
          }),
        });
        if (!orderRes.ok) {
          console.error("create_order: order insert failed", await orderRes.text());
          return json({ error: "Could not place your order. Please try again." }, 500);
        }
        const order = (await orderRes.json())[0];
        const itemsRes = await sb(`portal_order_items`, {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(items.map((i) => ({
            order_id: order.id,
            product_id: i.pr.id,
            product_name: i.pr.name,
            quantity: i.quantity,
            unit_price: i.unit,
            total_price: i.line,
          }))),
        });
        if (!itemsRes.ok) {
          console.error("create_order: items insert failed", await itemsRes.text());
          await sb(`portal_orders?id=eq.${order.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
          return json({ error: "Could not place your order. Please try again." }, 500);
        }
        return json({ data: { id: order.id } });
      }

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

      case "feedback": {
        if (!(await feedbackEnabled())) return json({ error: "Feedback is not enabled", code: "disabled" }, 403);
        const list = (await rows(
          `patient_feedback?select=id,appointment_id,nps_score,service_rating,comments,answers,created_at,updated_at,last_edited_by&patient_id=eq.${pid}&order=created_at.desc`,
        )) as FeedbackRow[];
        // The visit each one is about, fetched separately rather than embedded:
        // patient_feedback.appointment_id is reachable through more than one
        // route (the appointments table and the visits_needing_review view),
        // and an implicit embed on an ambiguous column fails outright.
        const ids = list
          .map((f) => f.appointment_id)
          .filter((v, i, a): v is string => !!v && a.indexOf(v) === i);
        const visits: Record<string, FeedbackVisit> = {};
        if (ids.length) {
          const appts = (await rows(
            `appointments?select=id,start_time,service,doctor_name,reason_for_consultation&id=in.(${ids.join(",")})`,
          )) as FeedbackVisit[];
          for (const a of appts) visits[a.id] = a;
        }
        return json({
          data: list.map((f) => ({
            ...f,
            appointment: f.appointment_id ? visits[f.appointment_id] ?? null : null,
          })),
        });
      }

      // A separate action, deliberately. The published portal build calls
      // "feedback" and expects a bare array, so adding the questions to that
      // response would break the build the clinic is running right now.
      case "feedback_questions": {
        if (!(await feedbackEnabled())) return json({ error: "Feedback is not enabled", code: "disabled" }, 403);
        const res = await sb(`feedback_questions?select=id,question_text,help_text,question_type,options,sort_order,is_active,is_required,builtin&is_active=eq.true&order=sort_order.asc`);
        if (!res.ok) return json({ error: await res.text() }, 500);
        return json({ data: await res.json() });
      }

      case "update_feedback": {
        if (!(await feedbackEnabled())) return json({ error: "Feedback is not enabled", code: "disabled" }, 403);
        const id = String(p.id || "");
        if (!/^[0-9a-fA-F-]{36}$/.test(id)) return json({ error: "Invalid feedback" }, 400);

        // Both scores are required and must be in range. The table has no
        // CHECK constraint on either, so this is the only thing standing
        // between a crafted request and an NPS of 400 in the clinic's report.
        const nps = Number(p.npsScore);
        const rating = Number(p.serviceRating);
        if (!Number.isInteger(nps) || nps < 0 || nps > 10) {
          return json({ error: "Score must be a whole number from 0 to 10" }, 400);
        }
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
          return json({ error: "Rating must be a whole number from 1 to 5" }, 400);
        }
        let comments: string | null = null;
        if (p.comments !== null && p.comments !== undefined) {
          if (typeof p.comments !== "string") return json({ error: "Invalid comments" }, 400);
          const trimmed = p.comments.trim();
          if (trimmed.length > 2000) return json({ error: "Comments are too long" }, 400);
          comments = trimmed || null;
        }

        // Scoped to this session's patient, so a patient cannot edit anybody
        // else's feedback even knowing its id. An empty response means the row
        // is not theirs (or does not exist) - never a silent success.
        //
        // The previous answers are kept: patient_feedback_snapshot copies them
        // into patient_feedback_revisions before this write lands, and stamps
        // updated_at. Nothing here needs to remember to do that.
        // Answers to the clinic's own questions. Absent means "not sent",
        // which is what the published build does - it is left untouched rather
        // than wiped. Present means it is checked against the question list
        // here, for the same reason the two scores are: this is the only thing
        // between a crafted request and nonsense in the clinic's reports.
        let answers: Record<string, unknown> | undefined;
        if (p.answers !== undefined && p.answers !== null) {
          if (typeof p.answers !== "object" || Array.isArray(p.answers)) {
            return json({ error: "Invalid answers" }, 400);
          }
          const qRes = await sb(`feedback_questions?select=id,question_type,options,is_active&is_active=eq.true`);
          if (!qRes.ok) return json({ error: await qRes.text() }, 500);
          const questions = (await qRes.json()) as { id: string; question_type: string; options: Record<string, unknown> }[];
          const byId = new Map(questions.map((q) => [q.id, q]));
          answers = {};
          for (const [key, value] of Object.entries(p.answers as Record<string, unknown>)) {
            const q = byId.get(key);
            // A key for a question that is not asked is dropped, not an error:
            // a question switched off while a patient had the form open must
            // not stop them saving the rest.
            if (!q) continue;
            if (value === null) { answers[key] = null; continue; }
            const type = q.question_type;
            if (type === "stars" || type === "emoji" || type === "scale_10") {
              const n = Number(value);
              const max = type === "scale_10" ? Number(q.options?.max ?? 10) : type === "emoji" ? 5 : Number(q.options?.max ?? 5);
              const min = type === "scale_10" ? Number(q.options?.min ?? 0) : 1;
              if (!Number.isInteger(n) || n < min || n > max) return json({ error: "An answer is out of range" }, 400);
              answers[key] = n;
            } else if (type === "yes_no") {
              if (typeof value !== "boolean") return json({ error: "An answer is invalid" }, 400);
              answers[key] = value;
            } else if (type === "choice_one" || type === "choice_many") {
              const allowed = Array.isArray(q.options?.choices) ? (q.options.choices as unknown[]).map(String) : [];
              if (type === "choice_one") {
                if (typeof value !== "string" || !allowed.includes(value)) return json({ error: "An answer is invalid" }, 400);
                answers[key] = value;
              } else {
                if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || !allowed.includes(v))) {
                  return json({ error: "An answer is invalid" }, 400);
                }
                answers[key] = value;
              }
            } else {
              if (typeof value !== "string") return json({ error: "An answer is invalid" }, 400);
              const trimmed = value.trim();
              if (trimmed.length > 2000) return json({ error: "An answer is too long" }, 400);
              answers[key] = trimmed || null;
            }
          }
        }

        // Merged into what is stored, never a replacement: an answer to a
        // question that has since been switched off is not in this payload,
        // and dropping it would quietly erase it from the clinic's record.
        if (answers !== undefined) {
          const current = await rows(`patient_feedback?select=answers&id=eq.${id}&patient_id=eq.${pid}`);
          if (!current.length) return json({ error: "Feedback not found" }, 404);
          const stored = current[0].answers;
          const base = stored && typeof stored === "object" && !Array.isArray(stored) ? stored as Record<string, unknown> : {};
          answers = { ...base, ...answers };
        }

        const res = await sb(`patient_feedback?id=eq.${id}&patient_id=eq.${pid}`, {
          method: "PATCH",
          body: JSON.stringify({
            nps_score: nps,
            service_rating: rating,
            comments,
            ...(answers === undefined ? {} : { answers }),
            last_edited_by: "patient",
          }),
        });
        if (!res.ok) return json({ error: await res.text() }, 500);
        const updated = (await res.json())[0];
        if (!updated) return json({ error: "Feedback not found" }, 404);
        return json({ data: updated });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e: any) {
    console.error("portal-data error:", e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});
