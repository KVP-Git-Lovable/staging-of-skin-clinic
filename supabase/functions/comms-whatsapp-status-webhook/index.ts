// Twilio's delivery/read status callback for journey messages (see comms-whatsapp-send.ts's
// StatusCallback). Updates comms_journey_message_log and, once a journey "message" step's send is
// terminally successful (sent/delivered/read), advances that enrollment past it immediately instead
// of waiting for the next comms-process-journeys poll - the same fast-path quick-marketing-test uses.
//
// This is a separate function from whatsapp-webhook (that one is Twilio's *inbound* message webhook
// for the booking bot, unrelated).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/comms-auth.ts";
import { parseCanvas, nextNodeId } from "../_shared/comms-journey-graph.ts";

const TERMINAL_SUCCESS = new Set(["sent", "delivered", "read"]);
const TERMINAL_FAILURE = new Set(["failed", "undelivered"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Twilio posts application/x-www-form-urlencoded; never make Twilio retry-loop a bad body.
  const form = await req.formData().catch(() => null);
  if (!form) return new Response("ok", { status: 200 });

  const messageSid = String(form.get("MessageSid") || form.get("SmsSid") || "");
  const messageStatus = String(form.get("MessageStatus") || "").toLowerCase();
  const errorCode = form.get("ErrorCode") ? String(form.get("ErrorCode")) : null;
  const errorMessage = form.get("ErrorMessage") ? String(form.get("ErrorMessage")) : null;
  if (!messageSid || !messageStatus) return new Response("ok", { status: 200 });

  const { data: log } = await admin
    .from("comms_journey_message_log")
    .select("id, journey_id, enrollment_id, node_id")
    .eq("twilio_message_sid", messageSid)
    .maybeSingle();
  if (!log) return new Response("ok", { status: 200 }); // not a journey-tracked send (e.g. an appointment reminder)

  await admin
    .from("comms_journey_message_log")
    .update({ status: messageStatus, delivery_status: messageStatus, error_code: errorCode, error_message: errorMessage })
    .eq("id", log.id);

  if (!log.enrollment_id || !log.node_id) return new Response("ok", { status: 200 });

  // Only advance an enrollment that's still actually parked at this message step - the periodic
  // sweep's own safety net may have already moved it on, and re-advancing here would skip ahead.
  const { data: enrollment } = await admin
    .from("comms_journey_enrollments")
    .select("id, status, current_node_id")
    .eq("id", log.enrollment_id)
    .maybeSingle();
  if (!enrollment || enrollment.current_node_id !== log.node_id || enrollment.status !== "pending_delivery") {
    return new Response("ok", { status: 200 });
  }

  if (TERMINAL_SUCCESS.has(messageStatus)) {
    const { data: journey } = await admin.from("comms_journeys").select("canvas_data").eq("id", log.journey_id).maybeSingle();
    const canvas = parseCanvas(journey?.canvas_data);
    const next = nextNodeId(canvas, log.node_id);
    if (next) {
      await admin
        .from("comms_journey_enrollments")
        .update({ status: "active", current_node_id: next, next_action_at: new Date().toISOString() })
        .eq("id", enrollment.id);
    } else {
      await admin.from("comms_journey_enrollments").update({ status: "completed" }).eq("id", enrollment.id);
    }
  } else if (TERMINAL_FAILURE.has(messageStatus)) {
    await admin.from("comms_journey_enrollments").update({ status: "failed" }).eq("id", enrollment.id);
  }
  // Any other status (queued/sending) just updates the log and waits for the next callback.

  return new Response("ok", { status: 200 });
});
