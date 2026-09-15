import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IST = "Asia/Kolkata";
const fmtISTDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { timeZone: IST, day: "2-digit", month: "short", year: "numeric" });
const fmtISTTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: true });

const tools = [
  {
    type: "function",
    function: {
      name: "list_doctors",
      description: "List all available doctors/practitioners at the clinic.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "check_doctor_availability",
      description: "Check if a specific doctor is available at a given date and time.",
      parameters: {
        type: "object",
        properties: {
          doctor_id: { type: "string", description: "UUID of the doctor" },
          date: { type: "string", description: "Date in YYYY-MM-DD format" },
          time: { type: "string", description: "Time in HH:MM format (24h)" },
        },
        required: ["doctor_id", "date", "time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description: "Book an appointment for the patient after confirming doctor availability and getting patient confirmation.",
      parameters: {
        type: "object",
        properties: {
          doctor_id: { type: "string", description: "UUID of the doctor" },
          date: { type: "string", description: "Date in YYYY-MM-DD format" },
          time: { type: "string", description: "Time in HH:MM format (24h)" },
          service: { type: "string", description: "The service/reason for the appointment" },
        },
        required: ["doctor_id", "date", "time", "service"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_patient_appointments",
      description: "List the patient's upcoming appointments. Use this to show them which appointments they have booked before redirecting cancel/reschedule requests to the clinic.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_shop_products",
      description: "List available products in the clinic shop that patients can order. Optionally filter by category.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Optional category filter" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "order_products",
      description: "Place an order for products on behalf of the patient. Call after the patient confirms the products, quantities, and delivery method.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "Array of items to order",
            items: {
              type: "object",
              properties: {
                product_id: { type: "string", description: "UUID of the product" },
                product_name: { type: "string", description: "Name of the product" },
                quantity: { type: "number", description: "Quantity to order" },
                unit_price: { type: "number", description: "Price per unit" },
              },
              required: ["product_id", "product_name", "quantity", "unit_price"],
            },
          },
          delivery_method: { type: "string", description: "'pickup' or 'delivery'" },
        },
        required: ["items", "delivery_method"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_patient_orders",
      description: "List the patient's recent orders so they can track status or reorder.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "reorder_previous_order",
      description: "Reorder all items from a previous order. Call after the patient confirms which order to reorder.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "UUID of the previous order to reorder" },
          delivery_method: { type: "string", description: "'pickup' or 'delivery'" },
        },
        required: ["order_id", "delivery_method"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "track_order",
      description: "Get detailed tracking/status information for a specific order.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "UUID of the order to track" },
        },
        required: ["order_id"],
      },
    },
  },
];

async function executeTool(sb: any, toolName: string, args: any, patientId: string, patientName: string) {
  switch (toolName) {
    case "list_doctors": {
      const { data } = await sb.from("staff").select("id, first_name, last_name, role, specialization").eq("is_active", true).order("first_name");
      return JSON.stringify({ doctors: (data || []).map((d: any) => ({ id: d.id, name: `${d.first_name} ${d.last_name}`, specialization: d.specialization || d.role })) });
    }

    case "check_doctor_availability": {
      const { doctor_id, date, time } = args;
      const startTime = `${date}T${time}:00`;
      const startDate = new Date(startTime);
      const endDate = new Date(startDate.getTime() + 30 * 60000);

      const dayOfWeek = startDate.getDay();
      const { data: wh } = await sb.from("working_hours").select("*").eq("day_of_week", dayOfWeek).single();
      if (wh && !wh.is_open) {
        return JSON.stringify({ available: false, reason: "The clinic is closed on this day." });
      }
      if (wh) {
        if (time < wh.open_time || time >= wh.close_time) {
          return JSON.stringify({ available: false, reason: `Clinic hours are ${wh.open_time} to ${wh.close_time} on this day.` });
        }
        if (wh.break_start && wh.break_end && time >= wh.break_start && time < wh.break_end) {
          return JSON.stringify({ available: false, reason: `This time falls during the lunch break (${wh.break_start} - ${wh.break_end}).` });
        }
      }

      const { data: conflicts } = await sb
        .from("appointments").select("id, start_time, end_time, service, status")
        .eq("staff_id", doctor_id)
        .gte("start_time", `${date}T00:00:00`).lte("start_time", `${date}T23:59:59`)
        .neq("status", "Cancelled");

      const hasConflict = (conflicts || []).some((appt: any) => {
        const aStart = new Date(appt.start_time).getTime();
        const aEnd = new Date(appt.end_time).getTime();
        return startDate.getTime() < aEnd && endDate.getTime() > aStart;
      });

      if (hasConflict) {
        const bookedTimes = (conflicts || []).map((a: any) => {
          const s = new Date(a.start_time);
          return `${s.getHours().toString().padStart(2, "0")}:${s.getMinutes().toString().padStart(2, "0")}`;
        });
        return JSON.stringify({ available: false, reason: "Doctor already has an appointment at this time.", booked_slots_on_this_day: bookedTimes });
      }

      const { data: staffInfo } = await sb.from("staff").select("first_name, last_name").eq("id", doctor_id).single();
      return JSON.stringify({ available: true, doctor_name: staffInfo ? `${staffInfo.first_name} ${staffInfo.last_name}` : "Staff", date, time });
    }

    case "book_appointment": {
      const { doctor_id, date, time, service } = args;
      const startDate = new Date(`${date}T${time}:00`);
      const endDate = new Date(startDate.getTime() + 30 * 60000);

      const { data: appt, error } = await sb.from("appointments").insert({
        patient_id: patientId, patient_name: patientName, staff_id: doctor_id,
        service, start_time: startDate.toISOString(), end_time: endDate.toISOString(),
        status: "Scheduled", source: "portal",
      }).select("id, start_time, end_time, service, status").single();

      if (error) return JSON.stringify({ success: false, error: error.message });

      const { data: staffInfo } = await sb.from("staff").select("first_name, last_name").eq("id", doctor_id).single();
      return JSON.stringify({
        success: true,
        appointment: {
          id: appt.id,
          doctor: staffInfo ? `${staffInfo.first_name} ${staffInfo.last_name}` : "Staff",
          date: fmtISTDate(appt.start_time),
          time: fmtISTTime(appt.start_time),
          service: appt.service, status: appt.status,
        },
      });
    }

    case "list_patient_appointments": {
      const { data } = await sb.from("appointments")
        .select("id, service, start_time, end_time, status, staff(first_name, last_name)")
        .eq("patient_id", patientId)
        .gte("start_time", new Date().toISOString())
        .neq("status", "Cancelled")
        .order("start_time", { ascending: true })
        .limit(10);

      const appointments = (data || []).map((a: any) => ({
        id: a.id,
        service: a.service,
        date: fmtISTDate(a.start_time),
        time: fmtISTTime(a.start_time),
        status: a.status,
        doctor: a.staff ? `Dr. ${a.staff.first_name} ${a.staff.last_name}` : "Not assigned",
      }));
      return JSON.stringify({ upcoming_appointments: appointments, count: appointments.length });
    }

    case "list_shop_products": {
      const { category } = args;
      let query = sb.from("pharma_products").select("id, name, category, selling_price, generic_name, image_url");
      if (category) query = query.ilike("category", `%${category}%`);
      const { data } = await query.limit(30);
      return JSON.stringify({ products: (data || []).map((p: any) => ({ id: p.id, name: p.name, category: p.category, price: p.selling_price, generic_name: p.generic_name })) });
    }

    case "order_products": {
      const { items, delivery_method } = args;
      const totalAmount = items.reduce((s: number, i: any) => s + i.quantity * i.unit_price, 0);

      // Get patient address for delivery
      let address = null, city = null, state = null, pincode = null, phone = null;
      if (delivery_method === "delivery") {
        const { data: pat } = await sb.from("patients").select("address, city, state, pincode, phone").eq("id", patientId).single();
        if (pat) { address = pat.address; city = pat.city; state = pat.state; pincode = pat.pincode; phone = pat.phone; }
      }

      const { data: order, error } = await sb.from("portal_orders").insert({
        patient_id: patientId, patient_name: patientName, total_amount: totalAmount,
        delivery_method, status: "Pending", payment_status: "Pending",
        address, city, state, pincode, phone,
      }).select("id").single();

      if (error) return JSON.stringify({ success: false, error: error.message });

      const orderItems = items.map((item: any) => ({
        order_id: order.id, product_id: item.product_id, product_name: item.product_name,
        quantity: item.quantity, unit_price: item.unit_price, total_price: item.quantity * item.unit_price,
      }));
      await sb.from("portal_order_items").insert(orderItems);

      return JSON.stringify({
        success: true,
        order: {
          id: order.id, total: totalAmount, delivery_method,
          item_count: items.length, status: "Pending",
        },
      });
    }

    case "list_patient_orders": {
      const { data } = await sb.from("portal_orders")
        .select("id, total_amount, status, payment_status, delivery_method, tracking_number, created_at")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(10);

      const orders = (data || []).map((o: any) => ({
        id: o.id,
        total: o.total_amount,
        status: o.status,
        payment_status: o.payment_status,
        delivery: o.delivery_method,
        tracking: o.tracking_number,
        date: fmtISTDate(o.created_at),
      }));
      return JSON.stringify({ orders, count: orders.length });
    }

    case "reorder_previous_order": {
      const { order_id, delivery_method } = args;
      // Verify the order belongs to this patient
      const { data: origOrder } = await sb.from("portal_orders").select("id, patient_id, total_amount").eq("id", order_id).single();
      if (!origOrder) return JSON.stringify({ success: false, error: "Order not found." });
      if (origOrder.patient_id !== patientId) return JSON.stringify({ success: false, error: "This order doesn't belong to you." });

      // Get original items
      const { data: origItems } = await sb.from("portal_order_items").select("product_id, product_name, quantity, unit_price, total_price").eq("order_id", order_id);
      if (!origItems || origItems.length === 0) return JSON.stringify({ success: false, error: "No items found in the original order." });

      const totalAmount = origItems.reduce((s: number, i: any) => s + Number(i.total_price), 0);

      let address = null, city = null, state = null, pincode = null, phone = null;
      if (delivery_method === "delivery") {
        const { data: pat } = await sb.from("patients").select("address, city, state, pincode, phone").eq("id", patientId).single();
        if (pat) { address = pat.address; city = pat.city; state = pat.state; pincode = pat.pincode; phone = pat.phone; }
      }

      const { data: newOrder, error } = await sb.from("portal_orders").insert({
        patient_id: patientId, patient_name: patientName, total_amount: totalAmount,
        delivery_method, status: "Pending", payment_status: "Pending",
        address, city, state, pincode, phone,
      }).select("id").single();

      if (error) return JSON.stringify({ success: false, error: error.message });

      const newItems = origItems.map((item: any) => ({
        order_id: newOrder.id, product_id: item.product_id, product_name: item.product_name,
        quantity: item.quantity, unit_price: item.unit_price, total_price: item.total_price,
      }));
      await sb.from("portal_order_items").insert(newItems);

      return JSON.stringify({
        success: true,
        order: {
          id: newOrder.id, total: totalAmount, delivery_method,
          item_count: origItems.length, status: "Pending",
          items: origItems.map((i: any) => ({ name: i.product_name, qty: i.quantity, price: i.unit_price })),
        },
      });
    }

    case "track_order": {
      const { order_id } = args;
      const { data: order } = await sb.from("portal_orders")
        .select("id, total_amount, status, payment_status, delivery_method, tracking_number, created_at, updated_at, address, city, state, pincode, notes")
        .eq("id", order_id).single();

      if (!order) return JSON.stringify({ error: "Order not found." });
      if (order.patient_id && order.patient_id !== patientId) return JSON.stringify({ error: "This order doesn't belong to you." });

      const { data: items } = await sb.from("portal_order_items").select("product_name, quantity, unit_price, total_price").eq("order_id", order_id);

      return JSON.stringify({
        order: {
          id: order.id, total: order.total_amount, status: order.status,
          payment_status: order.payment_status, delivery: order.delivery_method,
          tracking_number: order.tracking_number || "Not yet assigned",
          ordered_on: fmtISTDate(order.created_at),
          last_updated: fmtISTDate(order.updated_at),
          delivery_address: order.delivery_method === "delivery" ? `${order.address || ""}, ${order.city || ""}, ${order.state || ""} ${order.pincode || ""}`.trim() : "Clinic Pickup",
          notes: order.notes,
          items: (items || []).map((i: any) => ({ name: i.product_name, qty: i.quantity, price: i.unit_price, total: i.total_price })),
        },
      });
    }

    default:
      return JSON.stringify({ error: "Unknown tool" });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, patientId, patientName } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Fetch patient context
    const [patientRes, appointmentsRes, proceduresRes, invoicesRes] = await Promise.all([
      sb.from("patients").select("*").eq("id", patientId).single(),
      sb.from("appointments").select("*, staff(first_name, last_name)").eq("patient_id", patientId).order("start_time", { ascending: false }).limit(20),
      sb.from("procedures").select("*, staff(first_name, last_name)").eq("patient_id", patientId).order("procedure_date", { ascending: false }).limit(20),
      sb.from("invoices").select("*").eq("patient_id", patientId).order("created_at", { ascending: false }).limit(20),
    ]);

    let prescriptions: any[] = [];
    if (proceduresRes.data) {
      const procIds = proceduresRes.data.map((p: any) => p.id);
      if (procIds.length > 0) {
        const { data } = await sb.from("prescriptions").select("*").in("procedure_id", procIds);
        prescriptions = data || [];
      }
    }

    const [servicesRes, productsRes, ordersRes] = await Promise.all([
      sb.from("services").select("name, category, price").limit(50),
      sb.from("pharma_products").select("id, name, category, selling_price, generic_name").limit(50),
      sb.from("portal_orders").select("id, total_amount, status, payment_status, delivery_method, tracking_number, created_at").eq("patient_id", patientId).order("created_at", { ascending: false }).limit(10),
    ]);

    const patient = patientRes.data;
    const appointments = appointmentsRes.data || [];
    const procedures = proceduresRes.data || [];
    const invoices = invoicesRes.data || [];
    const orders = ordersRes.data || [];

    const upcomingAppts = appointments.filter((a: any) => new Date(a.start_time) >= new Date() && a.status !== "Cancelled");
    const pastAppts = appointments.filter((a: any) => new Date(a.start_time) < new Date());
    const totalDue = invoices.filter((i: any) => i.status !== "Paid").reduce((s: number, i: any) => s + (Number(i.total_amount) - Number(i.paid_amount)), 0);

    const today = new Date().toLocaleDateString("en-IN", { timeZone: IST, weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const systemPrompt = `You are DermaCare AI, a friendly and professional health assistant for a dermatology clinic's patient portal. You are chatting with ${patientName}. Today is ${today}.

ABSOLUTE RULE — APPOINTMENT MODIFICATIONS ARE FORBIDDEN:
You DO NOT have the ability to cancel, reschedule, modify, or change the status of any appointment. There is no tool for this and you must never claim or pretend to perform such an action. If the user asks to cancel or reschedule (in any wording, including "yes" confirmations to a cancel question), you MUST respond with exactly:
"To cancel or reschedule your appointment, please contact our clinic directly at +91 96201 23030 / +91 63607 53030, and our front desk team will assist you."
Never say an appointment has been cancelled, rescheduled, or updated. Never ask the patient to confirm a cancellation. Never offer to take care of it. Never use phrases like "successfully cancelled", "I've cancelled", "I'll cancel", "I can cancel", "let me cancel", "rescheduled", or any equivalent. You may use list_patient_appointments to show their bookings, but always end with the redirect message above.

PATIENT PROFILE:
- Name: ${patient?.first_name} ${patient?.last_name}
- Gender: ${patient?.gender || "Not specified"}
- DOB: ${patient?.date_of_birth || "Not provided"}
- Phone: ${patient?.phone || "Not provided"}
- Skin Type: ${patient?.skin_type || "Not assessed"}
- Skin Concerns: ${patient?.skin_concerns || "None noted"}
- Allergies: ${patient?.allergies || "None"}
- Current Medications: ${patient?.current_medications || "None"}
- Medical History: ${patient?.medical_history || "None"}

APPOINTMENTS:
- Upcoming: ${upcomingAppts.length} appointments
${upcomingAppts.slice(0, 5).map((a: any) => `  - [ID: ${a.id}] ${a.service} on ${fmtISTDate(a.start_time)} at ${fmtISTTime(a.start_time)} (${a.status})${a.staff ? ` with Dr. ${a.staff.first_name} ${a.staff.last_name}` : ""}`).join("\n")}
- Past: ${pastAppts.length} appointments

PROCEDURE HISTORY (recent):
${procedures.slice(0, 10).map((p: any) => `- ${p.service_name} on ${fmtISTDate(p.procedure_date)} | Diagnosis: ${p.diagnosis || "N/A"} | Notes: ${p.consultation_notes || "N/A"}${p.staff ? ` | Dr. ${p.staff.first_name} ${p.staff.last_name}` : ""}`).join("\n") || "No procedures recorded"}

PRESCRIPTIONS:
${prescriptions.slice(0, 15).map((rx: any) => `- ${rx.medicine_name} | Dosage: ${rx.dosage || "N/A"} | Frequency: ${rx.frequency || "N/A"} | Duration: ${rx.duration || "N/A"}`).join("\n") || "No prescriptions"}

BILLING:
- Outstanding balance: ₹${totalDue}
- Total invoices: ${invoices.length}
${invoices.slice(0, 5).map((i: any) => `- ${i.invoice_number}: ₹${i.total_amount} (${i.status}) - ${fmtISTDate(i.created_at)}`).join("\n")}

RECENT ORDERS:
${orders.slice(0, 5).map((o: any) => `- [ID: ${o.id}] ₹${o.total_amount} | Status: ${o.status} | Payment: ${o.payment_status} | ${o.delivery_method} | Tracking: ${o.tracking_number || "N/A"} | ${fmtISTDate(o.created_at)}`).join("\n") || "No orders"}

AVAILABLE SERVICES:
${(servicesRes.data || []).slice(0, 20).map((s: any) => `- ${s.name} (${s.category}) - ₹${s.price}`).join("\n")}

AVAILABLE PRODUCTS:
${(productsRes.data || []).slice(0, 20).map((p: any) => `- [ID: ${p.id}] ${p.name} (${p.category}) - ₹${p.selling_price}${p.generic_name ? ` [${p.generic_name}]` : ""}`).join("\n")}

APPOINTMENT BOOKING GUIDELINES:
You can book appointments using tools. Follow this flow:
1. Ask what their concern/issue is.
2. Call list_doctors to show available doctors.
3. Once they pick a doctor, ask for preferred date and time.
4. Call check_doctor_availability to verify. If unavailable, suggest alternatives.
5. Summarize details and ask for explicit confirmation.
6. Only after confirmation, call book_appointment.

APPOINTMENT CANCELLATION / RESCHEDULE POLICY:
See ABSOLUTE RULE above. Never cancel, reschedule, or change the status of any appointment. Never imply you have done so. Always redirect to +91 96201 23030 / +91 63607 53030.

PRODUCT ORDERING GUIDELINES:
1. When the patient wants to buy products, call list_shop_products to show options.
2. Help them choose products and quantities.
3. Ask if they want pickup or delivery.
4. Summarize the order with total cost and ask for confirmation.
5. Call order_products after confirmation.

REORDER GUIDELINES:
1. Call list_patient_orders to show their past orders.
2. Ask which order they want to reorder.
3. Ask pickup or delivery.
4. Confirm, then call reorder_previous_order.

ORDER TRACKING GUIDELINES:
1. Call list_patient_orders to show orders with statuses.
2. If they want details on a specific order, call track_order.
3. Share tracking number, status, and estimated info.

GENERAL GUIDELINES:
1. Be warm, empathetic, and professional. Use the patient's first name.
2. Never diagnose conditions - always recommend consulting with the doctor.
3. Keep responses concise and helpful. Use bullet points for lists.
4. When showing appointment/order IDs to the patient, don't show raw UUIDs - use numbered lists instead.
5. For product recommendations, consider their skin type, concerns, and current treatments.`;

    const aiMessages: any[] = [{ role: "system", content: systemPrompt }, ...messages];

    // Short-circuit: if the latest user message is a cancel/reschedule request,
    // respond directly with the redirect message without calling the model.
    const lastUser = [...messages].reverse().find((m: any) => m.role === "user");
    const lastUserText: string = (lastUser?.content || "").toString().toLowerCase().trim();
    const cancelIntent = /\b(cancel|cancell|reschedul|postpone|change\s+(?:my\s+)?appointment|move\s+(?:my\s+)?appointment)\b/i.test(lastUserText);
    // Also catch "yes" confirmations when the previous assistant turn asked about cancellation
    const lastAssistant = [...messages].slice(0, -1).reverse().find((m: any) => m.role === "assistant");
    const prevAssistantText: string = (lastAssistant?.content || "").toString().toLowerCase();
    const isYesToCancel = /^(yes|yep|yeah|y|confirm|ok|okay|sure|please do|go ahead|proceed)\b/i.test(lastUserText)
      && /(cancel|reschedul)/i.test(prevAssistantText);
    if (cancelIntent || isYesToCancel) {
      const redirect =
        "To cancel or reschedule your appointment, please contact our clinic directly at +91 96201 23030 / +91 63607 53030, and our front desk team will assist you.";
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const sseData = JSON.stringify({ choices: [{ delta: { content: redirect } }] });
          controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }

    const MAX_TOOL_ROUNDS = 8;
    let round = 0;

    while (round < MAX_TOOL_ROUNDS) {
      round++;
      const isLastRound = round === MAX_TOOL_ROUNDS;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: aiMessages,
          tools: isLastRound ? undefined : tools,
          stream: false,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited. Please try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (response.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const result = await response.json();
      const choice = result.choices?.[0];
      if (!choice) return new Response(JSON.stringify({ error: "No response from AI" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const assistantMessage = choice.message;

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        aiMessages.push(assistantMessage);
        for (const toolCall of assistantMessage.tool_calls) {
          const fnName = toolCall.function.name;
          let fnArgs: any = {};
          try { fnArgs = JSON.parse(toolCall.function.arguments || "{}"); } catch { /* empty */ }
          console.log(`Tool call: ${fnName}`, fnArgs);
          const toolResult = await executeTool(sb, fnName, fnArgs, patientId, patientName);
          console.log(`Tool result: ${toolResult}`);
          aiMessages.push({ role: "tool", tool_call_id: toolCall.id, content: toolResult });
        }
        continue;
      }

      // Final text response - stream as SSE
      let content = assistantMessage.content || "";

      // Hard safety net: if the model hallucinates a cancellation / reschedule
      // action, override the response with the redirect message. This protects
      // against prompt-instruction drift even though there is no cancel tool.
      const forbiddenPatterns = [
        /successfully\s+cancell?ed/i,
        /has\s+been\s+cancell?ed/i,
        /i['' ]?ve\s+cancell?ed/i,
        /i\s+will\s+cancell?/i,
        /i['' ]?ll\s+cancell?/i,
        /let\s+me\s+cancell?/i,
        /proceed\s+with\s+the\s+cancell?ation/i,
        /cancell?ing\s+(?:your|the)\s+appointment/i,
        /(?:has|have)\s+been\s+rescheduled/i,
        /i['' ]?ve\s+rescheduled/i,
        /i\s+(?:will|can)\s+reschedul/i,
      ];
      if (forbiddenPatterns.some((re) => re.test(content))) {
        console.warn("Blocked forbidden cancel/reschedule claim from model:", content);
        content =
          "To cancel or reschedule your appointment, please contact our clinic directly at +91 96201 23030 / +91 63607 53030, and our front desk team will assist you.";
      }
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const words = content.split(" ");
          let i = 0;
          const chunkSize = 3;
          function sendChunk() {
            if (i >= words.length) {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }
            const chunk = words.slice(i, i + chunkSize).join(" ") + (i + chunkSize < words.length ? " " : "");
            const sseData = JSON.stringify({ choices: [{ delta: { content: chunk } }] });
            controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
            i += chunkSize;
            setTimeout(sendChunk, 10);
          }
          sendChunk();
        },
      });

      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }

    return new Response(JSON.stringify({ error: "Too many tool rounds" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("portal-bot error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
