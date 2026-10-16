import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, requireStaffId } from "../_shared/comms-auth.ts";
import { resolveAudience, validateAudienceConfig } from "../_shared/comms-audience.ts";
import { parseCanvas, validateCanvas, findEntry, nextNodeId } from "../_shared/comms-journey-graph.ts";

const JOURNEYS = "comms_journeys";
const APPROVER_ROLE = /admin|manager/i;

type Body = Record<string, unknown>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireStaffId(req);
  if (auth instanceof Response) return auth;
  const me = auth.staffId;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = ((await req.json().catch(() => ({}))) ?? {}) as Body;
  const action = String(body.action ?? "");

  const loadJourney = async () => {
    const { data } = await admin.from(JOURNEYS).select("*").eq("id", String(body.journey_id ?? "")).maybeSingle();
    return data;
  };

  try {
    if (action === "audience-preview") {
      const r = await resolveAudience(admin, body.audience_config);
      const result: Record<string, unknown> = { per_segment: r.perSegment, total: r.total, without_phone: r.withoutPhone };
      if (body.include_rows === true) {
        // Staff whose role is limited to their own records see counts only, never other patients' details.
        const { data: roleRow } = await admin.from("staff").select("user_roles_config(data_scope)").eq("id", me).maybeSingle();
        const scope = (roleRow?.user_roles_config as { data_scope?: string } | null)?.data_scope;
        result.can_view_rows = scope !== "own";
        if (result.can_view_rows) {
          result.rows = r.patients.slice(0, 50).map((p) => ({
            id: p.id,
            name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
            phone: p.phone ?? null,
            email: p.email ?? null,
            date_of_birth: p.date_of_birth ?? null,
            city: p.city ?? null,
          }));
        }
      }
      return json(result);
    }

    const journey = await loadJourney();
    if (!journey) return json({ error: "Journey not found" }, 404);

    if (action === "submit-for-approval") {
      if (journey.created_by !== me) return json({ error: "Only the journey's creator can submit it" }, 403);
      if (!["draft", "rejected"].includes(journey.approval_status)) return json({ error: "This journey is already submitted" }, 409);
      if (journey.status !== "draft") return json({ error: "Only draft journeys can be submitted" }, 409);

      const approverId = String(body.approver_id ?? "");
      if (!approverId) return json({ error: "Choose an approver" }, 400);
      const { data: staffRows } = await admin.from("staff").select("id, is_active, user_roles_config(name)");
      const eligible = (staffRows ?? [])
        .filter((r) => r.is_active !== false && APPROVER_ROLE.test((r.user_roles_config as { name?: string } | null)?.name ?? ""))
        .map((r) => r.id as string);
      if (!eligible.includes(approverId)) return json({ error: "That person cannot approve journeys" }, 400);
      // Self-approval is only a fallback for a clinic with no other admin or manager to ask.
      if (approverId === me && eligible.some((id) => id !== me)) {
        return json({ error: "Choose someone other than yourself to approve" }, 400);
      }

      validateAudienceConfig(journey.audience_config);
      const problems = validateCanvas(parseCanvas(journey.canvas_data));
      if (problems.length) return json({ error: problems[0], problems }, 400);

      const { error } = await admin
        .from(JOURNEYS)
        .update({
          approval_status: "pending",
          approver_id: approverId,
          submitted_by: me,
          submitted_at: new Date().toISOString(),
          approval_notes: body.notes ? String(body.notes).slice(0, 1000) : null,
          rejection_reason: null,
          approved_at: null,
        })
        .eq("id", journey.id);
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    if (action === "approve" || action === "reject") {
      if (journey.approval_status !== "pending") return json({ error: "This journey is not awaiting approval" }, 409);
      if (journey.approver_id !== me) return json({ error: "Only the assigned approver can decide this" }, 403);
      if (action === "approve") {
        const { error } = await admin
          .from(JOURNEYS)
          .update({ approval_status: "approved", approved_at: new Date().toISOString(), rejection_reason: null })
          .eq("id", journey.id);
        if (error) throw new Error(error.message);
        return json({ ok: true });
      }
      const reason = String(body.reason ?? "").trim();
      if (!reason) return json({ error: "A reason is required to reject" }, 400);
      const { error } = await admin
        .from(JOURNEYS)
        .update({ approval_status: "rejected", rejection_reason: reason.slice(0, 1000), approved_at: null })
        .eq("id", journey.id);
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    if (action === "activate") {
      if (journey.approval_status !== "approved") return json({ error: "A journey must be approved before it can be activated" }, 409);
      if (journey.status === "active") return json({ error: "Journey is already active" }, 409);

      const canvas = parseCanvas(journey.canvas_data);
      const entry = findEntry(canvas);
      const firstStep = entry ? nextNodeId(canvas, entry.id) : null;
      if (!firstStep) return json({ error: "Connect the Audience step to the first step before activating" }, 409);

      const { patients } = await resolveAudience(admin, journey.audience_config);
      if (patients.length) {
        const now = new Date().toISOString();
        const rows = patients.map((p) => ({ journey_id: journey.id, patient_id: p.id, current_node_id: firstStep, next_action_at: now }));
        // A patient already enrolled from a previous activation (unique(journey_id, patient_id))
        // is left exactly where they are, not restarted.
        const { error: enrollErr } = await admin
          .from("comms_journey_enrollments")
          .upsert(rows, { onConflict: "journey_id,patient_id", ignoreDuplicates: true });
        if (enrollErr) throw new Error(enrollErr.message);
      }

      const { error } = await admin.from(JOURNEYS).update({ status: "active" }).eq("id", journey.id);
      if (error) throw new Error(error.message);

      // Run the first batch now instead of waiting for the next scheduled tick.
      const cronSecret = Deno.env.get("LOVABLE_CRON_SECRET");
      if (cronSecret) {
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/comms-process-journeys`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cronSecret}` },
        }).catch((e) => console.error("comms-journey-actions: could not trigger an immediate run", e instanceof Error ? e.message : e));
      }

      return json({ ok: true, enrolled: patients.length });
    }

    if (action === "pause" || action === "resume") {
      const from = action === "pause" ? "active" : "paused";
      if (journey.status !== from) return json({ error: `Only ${from} journeys can be ${action}d` }, 409);
      if (action === "resume" && journey.approval_status !== "approved") {
        return json({ error: "A journey must be approved before it can resume" }, 409);
      }
      const { error } = await admin
        .from(JOURNEYS)
        .update({ status: action === "pause" ? "paused" : "active" })
        .eq("id", journey.id);
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("comms-journey-actions failed", action, e instanceof Error ? e.message : e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
