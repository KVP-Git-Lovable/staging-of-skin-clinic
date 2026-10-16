// The Journey execution engine. Cron-polled (Bearer LOVABLE_CRON_SECRET, see _shared/cron-auth.ts,
// same posture as meta-token-refresh) and also triggered once, immediately, right after
// comms-journey-actions activates a journey, so the first batch doesn't wait for the next tick.
//
// Each pass: enrol any audience newly due from a comms_journey_schedules row, then walk every
// comms_journey_enrollments row that's due (next_action_at <= now()) one node forward through its
// journey's canvas_data graph. There's no queue - just a polling sweep plus a status-webhook
// fast-path (comms-whatsapp-status-webhook) for messages.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import { resolveAudience } from "../_shared/comms-audience.ts";
import { computeNextRun } from "../_shared/comms-schedule.ts";
import { sendWhatsAppTemplate, resolveTemplateVariables } from "../_shared/comms-whatsapp-send.ts";
import { toE164IN } from "../_shared/comms-phone.ts";
import {
  parseCanvas,
  nodeById,
  findEntry,
  nextNodeId,
  upstreamMessageNode,
  DELAY_UNIT_MS,
  type CanvasData,
  type JourneyNode,
} from "../_shared/comms-journey-graph.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 50;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 5 * 60_000;
// If Twilio's status callback never arrives, don't leave a patient stuck forever.
const PENDING_DELIVERY_SAFETY_MS = 24 * 3_600_000;

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

async function runScheduleSweep(admin: SupabaseClient) {
  const { data: due } = await admin
    .from("comms_journey_schedules")
    .select("*, comms_journeys!inner(id, status, audience_config)")
    .lte("next_run_at", new Date().toISOString())
    .not("next_run_at", "is", null);

  for (const schedule of due || []) {
    const journey = schedule.comms_journeys as Row;
    if (journey?.status === "active") {
      try {
        const { patients } = await resolveAudience(admin, journey.audience_config);
        if (patients.length) {
          const rows = patients.map((p) => ({ journey_id: journey.id, patient_id: p.id, next_action_at: new Date().toISOString() }));
          // Patients already enrolled (unique(journey_id, patient_id)) are silently skipped, not re-enrolled.
          await admin.from("comms_journey_enrollments").upsert(rows, { onConflict: "journey_id,patient_id", ignoreDuplicates: true });
        }
      } catch (e) {
        console.error("comms-process-journeys: schedule sweep failed for journey", journey?.id, e instanceof Error ? e.message : e);
      }
    }
    const next = schedule.type === "recurring" ? computeNextRun(schedule, new Date()) : null;
    await admin.from("comms_journey_schedules").update({ next_run_at: next ? next.toISOString() : null }).eq("id", schedule.id);
  }
}

async function completeEnrollment(admin: SupabaseClient, id: string) {
  await admin.from("comms_journey_enrollments").update({ status: "completed" }).eq("id", id);
}

async function advanceTo(admin: SupabaseClient, enrollmentId: string, nodeId: string) {
  await admin.from("comms_journey_enrollments").update({ current_node_id: nodeId, next_action_at: new Date().toISOString() }).eq("id", enrollmentId);
}

async function processMessageNode(admin: SupabaseClient, journeyId: string, node: JourneyNode, enrollment: Row, supabaseUrl: string) {
  const patient = enrollment.patients as Row | null;
  const phone = patient?.phone_e164 as string | undefined;
  const templateId = node.data.template_id as string | undefined;

  const fail = async (message: string) => {
    await admin.from("comms_journey_message_log").upsert(
      {
        journey_id: journeyId, enrollment_id: enrollment.id, patient_id: enrollment.patient_id,
        node_id: node.id, channel: "whatsapp", template_id: templateId ?? null,
        status: "failed", error_message: message, sent_at: new Date().toISOString(),
      },
      { onConflict: "enrollment_id,node_id,channel" },
    );
    await admin.from("comms_journey_enrollments").update({ status: "failed" }).eq("id", enrollment.id);
  };

  if (!phone) return fail("No usable phone number for this patient");
  if (!templateId) return fail("Message step has no template selected");

  const { data: tpl } = await admin.from("comms_whatsapp_templates").select("twilio_content_sid").eq("id", templateId).maybeSingle();
  if (!tpl?.twilio_content_sid) return fail("Template is not synced with Twilio yet");

  const contentVariables = resolveTemplateVariables(node.data.variables as Record<string, string> | undefined, patient || {});
  const statusCallbackUrl = `${supabaseUrl}/functions/v1/comms-whatsapp-status-webhook`;
  const result = await sendWhatsAppTemplate({ phoneE164: phone, twilioContentSid: tpl.twilio_content_sid, contentVariables, statusCallbackUrl });

  await admin.from("comms_journey_message_log").upsert(
    {
      journey_id: journeyId, enrollment_id: enrollment.id, patient_id: enrollment.patient_id,
      node_id: node.id, channel: "whatsapp", template_id: templateId,
      status: result.ok ? "sent" : "failed", twilio_message_sid: result.messageSid ?? null,
      error_message: result.error ?? null, sent_at: new Date().toISOString(),
    },
    { onConflict: "enrollment_id,node_id,channel" },
  );

  if (!result.ok) {
    const retries = (enrollment.retry_count || 0) + 1;
    if (retries >= MAX_RETRIES) {
      await admin.from("comms_journey_enrollments").update({ status: "failed", retry_count: retries }).eq("id", enrollment.id);
    } else {
      await admin
        .from("comms_journey_enrollments")
        .update({ retry_count: retries, next_action_at: new Date(Date.now() + RETRY_BACKOFF_MS).toISOString() })
        .eq("id", enrollment.id);
    }
    return;
  }

  // Normally comms-whatsapp-status-webhook advances this the moment Twilio confirms delivery/read.
  // next_action_at here is only the safety net if that callback never shows up.
  await admin
    .from("comms_journey_enrollments")
    .update({ status: "pending_delivery", retry_count: 0, next_action_at: new Date(Date.now() + PENDING_DELIVERY_SAFETY_MS).toISOString() })
    .eq("id", enrollment.id);
}

async function processDecisionNode(admin: SupabaseClient, canvas: CanvasData, node: JourneyNode, enrollment: Row) {
  const target = upstreamMessageNode(canvas, node.id);
  let matched = false;
  if (target) {
    const { data: log } = await admin
      .from("comms_journey_message_log")
      .select("status, delivery_status")
      .eq("enrollment_id", enrollment.id)
      .eq("node_id", target.id)
      .maybeSingle();
    if (log) {
      const s = String(log.status || "").toLowerCase();
      const d = String(log.delivery_status || "").toLowerCase();
      const isRead = s === "read" || d === "read";
      const isDelivered = isRead || s === "delivered" || d === "delivered";
      const isFailed = s === "failed" || d === "failed" || s === "undelivered" || d === "undelivered";
      switch (node.data.condition) {
        case "wa_delivered": matched = isDelivered; break;
        case "wa_read": matched = isRead; break;
        case "wa_failed": matched = isFailed; break;
      }
    }
  }
  const next = nextNodeId(canvas, node.id, matched ? "yes" : "no");
  if (next) await advanceTo(admin, enrollment.id, next);
  else await completeEnrollment(admin, enrollment.id);
}

async function processEnrollment(admin: SupabaseClient, journeyId: string, canvas: CanvasData, enrollment: Row, supabaseUrl: string) {
  const node = nodeById(canvas, enrollment.current_node_id) ?? findEntry(canvas);
  if (!node) return completeEnrollment(admin, enrollment.id);

  switch (node.type) {
    case "entry": {
      const next = nextNodeId(canvas, node.id);
      if (next) await advanceTo(admin, enrollment.id, next);
      else await completeEnrollment(admin, enrollment.id);
      return;
    }
    case "message":
      return processMessageNode(admin, journeyId, node, enrollment, supabaseUrl);
    case "delay": {
      const ms = Number(node.data.duration || 0) * DELAY_UNIT_MS[node.data.unit || "hours"];
      const next = nextNodeId(canvas, node.id);
      if (!next) return completeEnrollment(admin, enrollment.id);
      await admin
        .from("comms_journey_enrollments")
        .update({ current_node_id: next, next_action_at: new Date(Date.now() + ms).toISOString() })
        .eq("id", enrollment.id);
      return;
    }
    case "decision":
      return processDecisionNode(admin, canvas, node, enrollment);
    case "exit":
    default:
      return completeEnrollment(admin, enrollment.id);
  }
}

/** Anything still parked "pending_delivery" past its safety window: resolve it from the log we have. */
async function revivePendingDeliveries(admin: SupabaseClient, journeyId: string, canvas: CanvasData) {
  const { data: stale } = await admin
    .from("comms_journey_enrollments")
    .select("id, current_node_id")
    .eq("journey_id", journeyId)
    .eq("status", "pending_delivery")
    .lte("next_action_at", new Date().toISOString())
    .limit(200);

  for (const enrollment of stale || []) {
    const { data: log } = await admin
      .from("comms_journey_message_log")
      .select("status, delivery_status")
      .eq("enrollment_id", enrollment.id)
      .eq("node_id", enrollment.current_node_id)
      .maybeSingle();
    const s = String(log?.status || "").toLowerCase();
    const d = String(log?.delivery_status || "").toLowerCase();
    if (s === "failed" || d === "failed" || s === "undelivered" || d === "undelivered") {
      await admin.from("comms_journey_enrollments").update({ status: "failed" }).eq("id", enrollment.id);
      continue;
    }
    // Delivered/read/sent, or the callback genuinely never arrived - either way, move on rather
    // than leaving the patient stuck forever.
    const next = nextNodeId(canvas, enrollment.current_node_id);
    if (next) await advanceTo(admin, enrollment.id, next);
    else await completeEnrollment(admin, enrollment.id);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = authenticateCronRequest(req);
  if (denied) return denied;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    await runScheduleSweep(admin);

    const { data: journeys } = await admin.from("comms_journeys").select("id, canvas_data").eq("status", "active");
    let processed = 0;

    for (const journey of journeys || []) {
      const canvas = parseCanvas(journey.canvas_data);
      await revivePendingDeliveries(admin, journey.id, canvas);

      const { data: enrollments } = await admin
        .from("comms_journey_enrollments")
        .select("*, patients(id, first_name, last_name, phone, last_visit_date)")
        .eq("journey_id", journey.id)
        .eq("status", "active")
        .lte("next_action_at", new Date().toISOString())
        .limit(BATCH_SIZE);

      for (const row of enrollments || []) {
        const patient = row.patients as Row | null;
        const enrollment = { ...row, patients: patient ? { ...patient, phone_e164: toE164IN(patient.phone) } : null };
        await processEnrollment(admin, journey.id, canvas, enrollment, supabaseUrl);
        processed++;
      }
    }

    return new Response(JSON.stringify({ ok: true, processed }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("comms-process-journeys failed", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
