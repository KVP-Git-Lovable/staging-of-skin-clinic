// Twilio WhatsApp inbound webhook -> Lovable AI conversational bot
// Optimized: returns TwiML <Response/> immediately, processes everything in background.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const TWIML_EMPTY = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
const twimlResponse = () =>
  new Response(TWIML_EMPTY, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/xml" },
  });

// ---------- Tools (mirror of portal-bot) ----------
const tools = [
  { type: "function", function: { name: "list_doctors", description: "List all available doctors/practitioners.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "check_doctor_availability", description: "Check if a doctor is available at a date/time.", parameters: { type: "object", properties: { doctor_id: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD" }, time: { type: "string", description: "HH:MM 24h" } }, required: ["doctor_id", "date", "time"] } } },
  { type: "function", function: { name: "book_appointment", description: "Book an appointment after confirming with the patient.", parameters: { type: "object", properties: { doctor_id: { type: "string" }, date: { type: "string" }, time: { type: "string" }, service: { type: "string" } }, required: ["doctor_id", "date", "time", "service"] } } },
  { type: "function", function: { name: "list_patient_appointments", description: "List patient's upcoming appointments.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "cancel_appointment", description: "Cancel an appointment after explicit patient confirmation.", parameters: { type: "object", properties: { appointment_id: { type: "string" } }, required: ["appointment_id"] } } },
  { type: "function", function: { name: "reschedule_appointment", description: "Reschedule an appointment to a new date/time.", parameters: { type: "object", properties: { appointment_id: { type: "string" }, new_date: { type: "string" }, new_time: { type: "string" } }, required: ["appointment_id", "new_date", "new_time"] } } },
  { type: "function", function: { name: "list_shop_products", description: "List shop products, optionally by category.", parameters: { type: "object", properties: { category: { type: "string" } }, required: [] } } },
  { type: "function", function: { name: "order_products", description: "Place an order after patient confirmation.", parameters: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { product_id: { type: "string" }, product_name: { type: "string" }, quantity: { type: "number" }, unit_price: { type: "number" } }, required: ["product_id", "product_name", "quantity", "unit_price"] } }, delivery_method: { type: "string", description: "'pickup' or 'delivery'" } }, required: ["items", "delivery_method"] } } },
  { type: "function", function: { name: "list_patient_orders", description: "List patient's recent orders.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "reorder_previous_order", description: "Reorder a previous order.", parameters: { type: "object", properties: { order_id: { type: "string" }, delivery_method: { type: "string" } }, required: ["order_id", "delivery_method"] } } },
  { type: "function", function: { name: "track_order", description: "Get tracking info for a specific order.", parameters: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] } } },
];

async function executeTool(sb: any, toolName: string, args: any, patientId: string, patientName: string) {
  switch (toolName) {
    case "list_doctors": {
      const { data } = await sb.from("staff").select("id, first_name, last_name, role, specialization").eq("is_active", true).order("first_name");
      return JSON.stringify({ doctors: (data || []).map((d: any) => ({ id: d.id, name: `${d.first_name} ${d.last_name}`, specialization: d.specialization || d.role })) });
    }
    case "check_doctor_availability": {
      const { doctor_id, date, time } = args;
      const startDate = new Date(`${date}T${time}:00`);
      const endDate = new Date(startDate.getTime() + 30 * 60000);
      const { data: conflicts } = await sb.from("appointments").select("id, start_time, end_time, status").eq("staff_id", doctor_id).gte("start_time", `${date}T00:00:00`).lte("start_time", `${date}T23:59:59`).neq("status", "Cancelled");
      const hasConflict = (conflicts || []).some((appt: any) => {
        const aStart = new Date(appt.start_time).getTime();
        const aEnd = new Date(appt.end_time).getTime();
        return startDate.getTime() < aEnd && endDate.getTime() > aStart;
      });
      if (hasConflict) return JSON.stringify({ available: false, reason: "Doctor already booked at this time." });
      const { data: staffInfo } = await sb.from("staff").select("first_name, last_name").eq("id", doctor_id).single();
      return JSON.stringify({ available: true, doctor_name: staffInfo ? `${staffInfo.first_name} ${staffInfo.last_name}` : "Staff", date, time });
    }
    case "book_appointment": {
      const { doctor_id, date, time, service } = args;
      const startDate = new Date(`${date}T${time}:00`);
      const endDate = new Date(startDate.getTime() + 30 * 60000);
      const { data: appt, error } = await sb.from("appointments").insert({ patient_id: patientId, patient_name: patientName, staff_id: doctor_id, service, start_time: startDate.toISOString(), end_time: endDate.toISOString(), status: "Scheduled", source: "whatsapp" }).select("id, start_time").single();
      if (error) return JSON.stringify({ success: false, error: error.message });
      return JSON.stringify({ success: true, appointment: { id: appt.id, date: new Date(appt.start_time).toLocaleDateString("en-IN"), time: new Date(appt.start_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }), service } });
    }
    case "list_patient_appointments": {
      const { data } = await sb.from("appointments").select("id, service, start_time, status, staff(first_name, last_name)").eq("patient_id", patientId).gte("start_time", new Date().toISOString()).neq("status", "Cancelled").order("start_time", { ascending: true }).limit(10);
      return JSON.stringify({ upcoming_appointments: (data || []).map((a: any) => ({ id: a.id, service: a.service, date: new Date(a.start_time).toLocaleDateString("en-IN"), time: new Date(a.start_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }), status: a.status, doctor: a.staff ? `Dr. ${a.staff.first_name} ${a.staff.last_name}` : "Not assigned" })) });
    }
    case "cancel_appointment": {
      const { appointment_id } = args;
      const { data: appt } = await sb.from("appointments").select("id, patient_id, status").eq("id", appointment_id).single();
      if (!appt || appt.patient_id !== patientId) return JSON.stringify({ success: false, error: "Appointment not found." });
      if (appt.status === "Cancelled") return JSON.stringify({ success: false, error: "Already cancelled." });
      const { error } = await sb.from("appointments").update({ status: "Cancelled" }).eq("id", appointment_id);
      if (error) return JSON.stringify({ success: false, error: error.message });
      return JSON.stringify({ success: true });
    }
    case "reschedule_appointment": {
      const { appointment_id, new_date, new_time } = args;
      const { data: appt } = await sb.from("appointments").select("id, patient_id, status").eq("id", appointment_id).single();
      if (!appt || appt.patient_id !== patientId) return JSON.stringify({ success: false, error: "Appointment not found." });
      const newStart = new Date(`${new_date}T${new_time}:00`);
      const newEnd = new Date(newStart.getTime() + 30 * 60000);
      const { error } = await sb.from("appointments").update({ start_time: newStart.toISOString(), end_time: newEnd.toISOString(), status: "Rescheduled" }).eq("id", appointment_id);
      if (error) return JSON.stringify({ success: false, error: error.message });
      return JSON.stringify({ success: true, new_date: newStart.toLocaleDateString("en-IN"), new_time: newStart.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) });
    }
    case "list_shop_products": {
      const { category } = args;
      let q = sb.from("pharma_products").select("id, name, category, selling_price, generic_name");
      if (category) q = q.ilike("category", `%${category}%`);
      const { data } = await q.limit(20);
      return JSON.stringify({ products: (data || []).map((p: any) => ({ id: p.id, name: p.name, category: p.category, price: p.selling_price })) });
    }
    case "order_products": {
      const { items, delivery_method } = args;
      const totalAmount = items.reduce((s: number, i: any) => s + i.quantity * i.unit_price, 0);
      let address = null, city = null, state = null, pincode = null, phone = null;
      if (delivery_method === "delivery") {
        const { data: pat } = await sb.from("patients").select("address, city, state, pincode, phone").eq("id", patientId).single();
        if (pat) { address = pat.address; city = pat.city; state = pat.state; pincode = pat.pincode; phone = pat.phone; }
      }
      const { data: order, error } = await sb.from("portal_orders").insert({ patient_id: patientId, patient_name: patientName, total_amount: totalAmount, delivery_method, status: "Pending", payment_status: "Pending", address, city, state, pincode, phone }).select("id").single();
      if (error) return JSON.stringify({ success: false, error: error.message });
      const orderItems = items.map((item: any) => ({ order_id: order.id, product_id: item.product_id, product_name: item.product_name, quantity: item.quantity, unit_price: item.unit_price, total_price: item.quantity * item.unit_price }));
      await sb.from("portal_order_items").insert(orderItems);
      return JSON.stringify({ success: true, order: { id: order.id, total: totalAmount, delivery_method, item_count: items.length } });
    }
    case "list_patient_orders": {
      const { data } = await sb.from("portal_orders").select("id, total_amount, status, payment_status, delivery_method, tracking_number, created_at").eq("patient_id", patientId).order("created_at", { ascending: false }).limit(10);
      return JSON.stringify({ orders: (data || []).map((o: any) => ({ id: o.id, total: o.total_amount, status: o.status, payment: o.payment_status, delivery: o.delivery_method, tracking: o.tracking_number, date: new Date(o.created_at).toLocaleDateString("en-IN") })) });
    }
    case "reorder_previous_order": {
      const { order_id, delivery_method } = args;
      const { data: origOrder } = await sb.from("portal_orders").select("id, patient_id").eq("id", order_id).single();
      if (!origOrder || origOrder.patient_id !== patientId) return JSON.stringify({ success: false, error: "Order not found." });
      const { data: origItems } = await sb.from("portal_order_items").select("product_id, product_name, quantity, unit_price, total_price").eq("order_id", order_id);
      if (!origItems || origItems.length === 0) return JSON.stringify({ success: false, error: "No items in original order." });
      const totalAmount = origItems.reduce((s: number, i: any) => s + Number(i.total_price), 0);
      let address = null, city = null, state = null, pincode = null, phone = null;
      if (delivery_method === "delivery") {
        const { data: pat } = await sb.from("patients").select("address, city, state, pincode, phone").eq("id", patientId).single();
        if (pat) { address = pat.address; city = pat.city; state = pat.state; pincode = pat.pincode; phone = pat.phone; }
      }
      const { data: newOrder, error } = await sb.from("portal_orders").insert({ patient_id: patientId, patient_name: patientName, total_amount: totalAmount, delivery_method, status: "Pending", payment_status: "Pending", address, city, state, pincode, phone }).select("id").single();
      if (error) return JSON.stringify({ success: false, error: error.message });
      const newItems = origItems.map((item: any) => ({ order_id: newOrder.id, product_id: item.product_id, product_name: item.product_name, quantity: item.quantity, unit_price: item.unit_price, total_price: item.total_price }));
      await sb.from("portal_order_items").insert(newItems);
      return JSON.stringify({ success: true, order: { id: newOrder.id, total: totalAmount, delivery_method, item_count: origItems.length } });
    }
    case "track_order": {
      const { order_id } = args;
      const { data: order } = await sb.from("portal_orders").select("id, patient_id, total_amount, status, payment_status, delivery_method, tracking_number, created_at").eq("id", order_id).single();
      if (!order || order.patient_id !== patientId) return JSON.stringify({ error: "Order not found." });
      return JSON.stringify({ order: { id: order.id, total: order.total_amount, status: order.status, payment: order.payment_status, delivery: order.delivery_method, tracking_number: order.tracking_number || "Not yet assigned", ordered_on: new Date(order.created_at).toLocaleDateString("en-IN") } });
    }
    default:
      return JSON.stringify({ error: "Unknown tool" });
  }
}

// ---------- Helpers ----------
function normalizeIncomingPhone(twilioFrom: string): string {
  return twilioFrom.replace(/^whatsapp:/, "").trim();
}

async function findPatientByPhone(sb: any, phone: string) {
  const last10 = phone.replace(/\D/g, "").slice(-10);
  const { data } = await sb.from("patients").select("id, first_name, last_name, phone, gender, date_of_birth, skin_type, skin_concerns, allergies, current_medications, medical_history").or(`phone.eq.${phone},phone.ilike.%${last10}`).limit(1);
  return data?.[0] || null;
}

async function sendWhatsAppReply(toPhone: string, body: string): Promise<string | null> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_WHATSAPP_FROM");
  if (!accountSid || !authToken || !fromNumber) {
    console.error("[whatsapp-webhook] Missing Twilio credentials");
    return null;
  }
  const fromFormatted = fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`;
  const toFormatted = toPhone.startsWith("whatsapp:") ? toPhone : `whatsapp:${toPhone}`;
  const safeBody = body.length > 1500 ? body.slice(0, 1490) + "…" : body;
  const params = new URLSearchParams({ To: toFormatted, From: fromFormatted, Body: safeBody });
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = btoa(`${accountSid}:${authToken}`);

  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const result = await resp.json();
  if (!resp.ok) {
    console.error("[whatsapp-webhook] Twilio reply failed:", result);
    return null;
  }
  return result.sid || null;
}

const GREETING_RE = /^(hi+|hey+|hello+|helo+|yo|hola|namaste|namaskar|good\s*(morning|afternoon|evening|night)|gm|ga|ge|gn|start|hii|hiii)[\s!.,?]*$/i;

const CLINIC_CALL_MESSAGE =
  "To modify or cancel your booking, please call us on +91 96201 23030 / +91 63607 53030.\nThe Skin Clinic, Mangalore";

// Quick-reply buttons from the appointment confirmation template
function detectButtonIntent(text: string): "modify" | "cancel" | "confirm" | null {
  const t = (text || "").toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t === "i need to modify" || t === "need to modify" || t === "modify") return "modify";
  if (t === "i want to cancel" || t === "want to cancel" || t === "cancel") return "cancel";
  if (t === "confirm" || t === "i confirm" || t === "yes confirm") return "confirm";
  return null;
}

// ---------- Background processor ----------
async function processMessage(opts: { fromRaw: string; userBody: string; messageSid: string; t0: number; buttonText?: string }) {
  const { fromRaw, userBody, messageSid, t0, buttonText } = opts;
  const sidTag = messageSid || "no-sid";
  const log = (stage: string, extra = "") =>
    console.log(`[whatsapp-webhook] sid=${sidTag} stage=${stage} ms=${(performance.now() - t0).toFixed(0)}${extra ? " " + extra : ""}`);

  try {
    const phone = normalizeIncomingPhone(fromRaw);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    log("start");

    // Run independent calls in parallel: persist inbound, lookup patient, fetch history.
    const [, patient, historyRes] = await Promise.all([
      sb.from("whatsapp_conversations").insert({
        phone, direction: "inbound", role: "user", content: userBody, message_sid: messageSid,
      }),
      findPatientByPhone(sb, phone),
      sb.from("whatsapp_conversations")
        .select("role, content")
        .eq("phone", phone)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    log("parallel_loaded");

    if (!patient) {
      const replyText = `Hi! 👋 I couldn't find a patient profile for this WhatsApp number (${phone}). Please visit the clinic or contact us so we can register you. Once registered, I'll be able to help you book appointments, order products, and track orders right here on WhatsApp.`;
      const ts = performance.now();
      const sid = await sendWhatsAppReply(phone, replyText);
      log("twilio_send", `extra_ms=${(performance.now() - ts).toFixed(0)}`);
      await sb.from("whatsapp_conversations").insert({ phone, direction: "outbound", role: "assistant", content: replyText, message_sid: sid });
      log("done_unknown_patient");
      return;
    }

    const patientId = patient.id;
    const patientName = `${patient.first_name} ${patient.last_name}`;

    // Backfill patient_id on the inbound message (best-effort, do not await blocking)
    sb.from("whatsapp_conversations").update({ patient_id: patientId }).eq("message_sid", messageSid).is("patient_id", null).then(() => {});

    // Appointment template quick-reply buttons — skip AI entirely
    const buttonIntent = detectButtonIntent(buttonText || "") || detectButtonIntent(userBody);
    if (buttonIntent) {
      const reply = buttonIntent === "confirm"
        ? `Thanks for confirming, ${patient.first_name}! 😊 See you soon.\nThe Skin Clinic, Mangalore`
        : `${buttonIntent === "cancel"
            ? `Hi ${patient.first_name}, sorry to hear you'd like to cancel.`
            : `Hi ${patient.first_name}, happy to help you change your appointment.`}\n\n${CLINIC_CALL_MESSAGE}`;
      const ts = performance.now();
      const sid = await sendWhatsAppReply(phone, reply);
      log("twilio_send", `extra_ms=${(performance.now() - ts).toFixed(0)}`);
      await sb.from("whatsapp_conversations").insert({
        patient_id: patientId, phone, direction: "outbound", role: "assistant", content: reply, message_sid: sid,
      });
      log(`done_button_${buttonIntent}`);
      return;
    }

    // Greeting fast-path — skip AI entirely
    if (GREETING_RE.test(userBody)) {
      const reply = `Hi ${patient.first_name}! 👋 I'm DermaCare AI. I can help you book, reschedule or cancel appointments, browse the clinic shop, place orders, or track existing orders. What would you like to do?`;
      const ts = performance.now();
      const sid = await sendWhatsAppReply(phone, reply);
      log("twilio_send", `extra_ms=${(performance.now() - ts).toFixed(0)}`);
      await sb.from("whatsapp_conversations").insert({
        patient_id: patientId, phone, direction: "outbound", role: "assistant", content: reply, message_sid: sid,
      });
      log("done_greeting_fastpath");
      return;
    }

    const historyMessages = (historyRes?.data || [])
      .slice()
      .reverse()
      .map((m: any) => ({ role: m.role, content: m.content }));

    // Upcoming appointments context so vague requests like "change my appointment" work
    let upcomingContext = "None";
    try {
      const { data: upcoming } = await sb
        .from("appointments")
        .select("id, service, start_time, status")
        .eq("patient_id", patientId)
        .gte("start_time", new Date().toISOString())
        .neq("status", "Cancelled")
        .order("start_time", { ascending: true })
        .limit(5);
      if (upcoming && upcoming.length > 0) {
        upcomingContext = upcoming
          .map((a: any) => {
            const d = new Date(a.start_time);
            const when = d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
            return `- ${when} — ${a.service || "Consultation"} (status: ${a.status}, id: ${a.id})`;
          })
          .join("\n");
      }
    } catch (e) {
      console.error("[whatsapp-webhook] upcoming fetch failed", e);
    }

    const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const systemPrompt = `You are DermaCare AI, a friendly WhatsApp assistant for a dermatology clinic. You are chatting with ${patientName} via WhatsApp. Today is ${today}.

PATIENT PROFILE:
- Name: ${patientName}
- Gender: ${patient.gender || "Not specified"}
- Skin Type: ${patient.skin_type || "Not assessed"}
- Skin Concerns: ${patient.skin_concerns || "None noted"}
- Allergies: ${patient.allergies || "None"}
- Current Medications: ${patient.current_medications || "None"}

UPCOMING APPOINTMENTS:
${upcomingContext}

You can help patients:
- Book, cancel, or reschedule appointments
- Browse and order products from the clinic shop
- Track existing orders or reorder past purchases
- View their appointment history

INTENT HANDLING — work out what the patient means, even from short, vague, or mixed-language (Hinglish / Kannada-English) messages, and respond to that intent:
- Reschedule / cancel / book: if they have exactly one upcoming appointment, assume they mean that one (state which one you mean). If several, list them and ask which.
- Clinic timings, address, directions, parking: answer helpfully and offer to book.
- Prices, services, treatments, packages: give general guidance and suggest a consultation for an accurate quote.
- Orders, medicines, delivery status: use the order tools.
- Prescriptions, reports, records: explain that clinic staff will share them and offer to pass on the request.
- Complaints, feedback, or "I want to talk to someone": apologise briefly, thank them, and offer to connect them with the clinic team on +91 96201 23030 / +91 63607 53030.
- Small talk / thanks: reply briefly and warmly, then offer a next step.
- Genuinely unclear: ask ONE short clarifying question — never reply "I don't understand".

GUIDELINES:
1. Be warm and concise — this is WhatsApp, keep replies short (under 800 chars when possible).
2. Use the patient's first name. Use plain text (no markdown — WhatsApp doesn't render it well; you may use *bold* sparingly).
3. Never diagnose conditions — recommend booking an appointment for medical concerns.
4. Always confirm before calling book_appointment, cancel_appointment, reschedule_appointment, order_products, or reorder_previous_order.
5. Use numbered lists when showing options. Don't show raw UUIDs to the patient.
6. For appointments: use list_doctors, then check_doctor_availability, then confirm, then book_appointment.
7. For ordering: use list_shop_products, confirm cart + delivery method, then order_products.
8. Always end with a clear next step or question so the conversation can continue.
9. If a request is outside what you can do, say so plainly and give the clinic number +91 96201 23030 / +91 63607 53030.`;

    const aiMessages: any[] = [{ role: "system", content: systemPrompt }, ...historyMessages, { role: "user", content: userBody }];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[whatsapp-webhook] LOVABLE_API_KEY not configured");
      const fallback = "Sorry, I'm having trouble right now. Please try again shortly.";
      const sid = await sendWhatsAppReply(phone, fallback);
      await sb.from("whatsapp_conversations").insert({ patient_id: patientId, phone, direction: "outbound", role: "assistant", content: fallback, message_sid: sid });
      return;
    }

    const MAX_TOOL_ROUNDS = 4;
    let round = 0;
    let assistantText = "";

    while (round < MAX_TOOL_ROUNDS) {
      round++;
      const isLastRound = round === MAX_TOOL_ROUNDS;
      const aiStart = performance.now();

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: aiMessages,
          tools: isLastRound ? undefined : tools,
          stream: false,
        }),
      });

      log(`ai_round_${round}`, `dur_ms=${(performance.now() - aiStart).toFixed(0)} status=${aiResp.status}`);

      if (!aiResp.ok) {
        const errTxt = await aiResp.text();
        console.error("[whatsapp-webhook] AI gateway error:", aiResp.status, errTxt);
        if (aiResp.status === 429) assistantText = "I'm a bit busy right now — please send your message again in a moment.";
        else if (aiResp.status === 402) assistantText = "Our AI assistant is temporarily unavailable. Please try again later or contact the clinic directly.";
        else assistantText = "Sorry, I'm having trouble understanding that. Could you rephrase?";
        break;
      }

      const result = await aiResp.json();
      const choice = result.choices?.[0];
      const assistantMessage = choice?.message;
      if (!assistantMessage) {
        assistantText = "Sorry, I didn't catch that. Could you try again?";
        break;
      }

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        aiMessages.push(assistantMessage);
        // Execute tool calls in parallel
        const toolResults = await Promise.all(
          assistantMessage.tool_calls.map(async (toolCall: any) => {
            const fnName = toolCall.function.name;
            let fnArgs: any = {};
            try { fnArgs = JSON.parse(toolCall.function.arguments || "{}"); } catch { /* empty */ }
            console.log(`[whatsapp-webhook] sid=${sidTag} tool=${fnName}`);
            const toolResult = await executeTool(sb, fnName, fnArgs, patientId, patientName);
            return { tool_call_id: toolCall.id, content: toolResult };
          })
        );
        for (const tr of toolResults) {
          aiMessages.push({ role: "tool", tool_call_id: tr.tool_call_id, content: tr.content });
        }
        continue;
      }

      assistantText = (assistantMessage.content || "").trim() || "I'm here to help. What would you like to do?";
      break;
    }

    if (!assistantText) assistantText = "I'm here to help. What would you like to do?";

    const ts = performance.now();
    const replySid = await sendWhatsAppReply(phone, assistantText);
    log("twilio_send", `extra_ms=${(performance.now() - ts).toFixed(0)}`);

    await sb.from("whatsapp_conversations").insert({
      patient_id: patientId, phone, direction: "outbound", role: "assistant",
      content: assistantText, message_sid: replySid,
    });
    log("done");
  } catch (error) {
    console.error("[whatsapp-webhook] processMessage error:", error);
  }
}

// ---------- Main handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const t0 = performance.now();

  try {
    const contentType = req.headers.get("content-type") || "";
    let payload: Record<string, string> = {};
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      form.forEach((v, k) => { payload[k] = String(v); });
    } else if (contentType.includes("application/json")) {
      payload = await req.json();
    }

    const fromRaw = payload.From || "";
    const userBody = (payload.Body || "").trim();
    const messageSid = payload.MessageSid || payload.SmsMessageSid || "";
    const buttonText = (payload.ButtonText || payload.ButtonPayload || payload.ListId || payload.ListTitle || "").trim();

    console.log(`[whatsapp-webhook] inbound sid=${messageSid} from=${fromRaw} body="${userBody}" button="${buttonText}" parse_ms=${(performance.now() - t0).toFixed(0)}`);

    if (fromRaw && (userBody || buttonText)) {
      const effectiveBody = userBody || buttonText;
      // Schedule heavy work in background — does NOT block the TwiML response.
      // @ts-ignore - EdgeRuntime is provided by Supabase Edge Runtime
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(processMessage({ fromRaw, userBody: effectiveBody, messageSid, t0, buttonText }));
      } else {
        // Fallback: fire-and-forget (best-effort if waitUntil isn't available)
        processMessage({ fromRaw, userBody: effectiveBody, messageSid, t0, buttonText }).catch((e) =>
          console.error("[whatsapp-webhook] bg error:", e),
        );
      }
    }

    console.log(`[whatsapp-webhook] ack sid=${messageSid} ms=${(performance.now() - t0).toFixed(0)}`);
    return twimlResponse();
  } catch (error) {
    console.error("[whatsapp-webhook] handler error:", error);
    return twimlResponse();
  }
});
