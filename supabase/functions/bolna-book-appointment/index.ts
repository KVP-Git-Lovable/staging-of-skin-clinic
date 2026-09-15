import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

interface BookBody {
  patientPhone: string;
  patientName?: string;
  doctorName: string;
  serviceName: string;
  appointmentDate: string; // YYYY-MM-DD
  startTime: string;       // HH:mm (IST assumed)
  endTime: string;         // HH:mm (IST assumed)
  notes?: string;
}

const IST_OFFSET = "+05:30";

const normalizePhone = (p: string) => String(p || "").replace(/[\s\-()]/g, "").trim();
const last10 = (p: string) => {
  const d = normalizePhone(p).replace(/\D/g, "");
  return d.slice(-10);
};

function toIstIso(date: string, time: string): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time || "");
  if (!dm || !tm) return null;
  const hh = String(Math.min(23, parseInt(tm[1], 10))).padStart(2, "0");
  const mm = String(Math.min(59, parseInt(tm[2], 10))).padStart(2, "0");
  return `${dm[1]}-${dm[2]}-${dm[3]}T${hh}:${mm}:00${IST_OFFSET}`;
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp({ success: false, message: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Auth: shared secret for Bolna
  const expected = Deno.env.get("BOLNA_API_KEY");
  if (expected) {
    const auth = req.headers.get("authorization") || "";
    const apiKeyHeader = req.headers.get("x-api-key") || "";
    const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    if (bearer !== expected && apiKeyHeader !== expected) {
      return jsonResp({ success: false, message: "Unauthorized" }, 401);
    }
  }

  let body: BookBody;
  try {
    body = await req.json();
  } catch {
    return jsonResp({ success: false, message: "Invalid JSON body" }, 400);
  }

  const log: Record<string, unknown> = {
    request_payload: body,
    patient_phone: body?.patientPhone ?? null,
    patient_name: body?.patientName ?? null,
    doctor_name: body?.doctorName ?? null,
    service_name: body?.serviceName ?? null,
  };

  const writeLog = async (extra: Record<string, unknown>) => {
    try {
      await supabase.from("bolna_booking_logs").insert({ ...log, ...extra });
    } catch (e) {
      console.error("bolna log insert failed", e);
    }
  };

  // Validate
  const missing: string[] = [];
  (["patientPhone", "doctorName", "serviceName", "appointmentDate", "startTime", "endTime"] as const)
    .forEach((k) => { if (!body?.[k]) missing.push(k); });
  if (missing.length) {
    const msg = `Missing required fields: ${missing.join(", ")}`;
    await writeLog({ success: false, status_code: 400, message: msg });
    return jsonResp({ success: false, message: msg }, 400);
  }

  const startIso = toIstIso(body.appointmentDate, body.startTime);
  const endIso = toIstIso(body.appointmentDate, body.endTime);
  if (!startIso || !endIso) {
    const msg = "Invalid appointmentDate/startTime/endTime. Use YYYY-MM-DD and HH:mm.";
    await writeLog({ success: false, status_code: 400, message: msg });
    return jsonResp({ success: false, message: msg }, 400);
  }
  if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
    const msg = "endTime must be after startTime";
    await writeLog({ success: false, status_code: 400, message: msg, requested_start: startIso, requested_end: endIso });
    return jsonResp({ success: false, message: msg }, 400);
  }

  log.requested_start = startIso;
  log.requested_end = endIso;

  // Resolve doctor (staff) by name — match against doctors first, then any staff
  const doctorQuery = String(body.doctorName).trim();
  const { data: staffMatches, error: staffErr } = await supabase
    .from("staff")
    .select("id, first_name, last_name, role")
    .ilike("first_name", `%${doctorQuery.split(/\s+/)[0]}%`);
  if (staffErr) {
    await writeLog({ success: false, status_code: 500, error: staffErr.message, message: "Staff lookup failed" });
    return jsonResp({ success: false, message: "Staff lookup failed" }, 500);
  }
  const fullLower = doctorQuery.toLowerCase();
  let staff =
    (staffMatches || []).find((s) =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(fullLower) ||
      fullLower.includes(`${s.first_name} ${s.last_name}`.toLowerCase()),
    ) || (staffMatches || [])[0];
  if (!staff) {
    // broader search
    const { data: any2 } = await supabase
      .from("staff")
      .select("id, first_name, last_name, role")
      .or(`first_name.ilike.%${doctorQuery}%,last_name.ilike.%${doctorQuery}%`)
      .limit(5);
    staff = (any2 || [])[0];
  }
  if (!staff) {
    const msg = `Doctor "${doctorQuery}" not found`;
    await writeLog({ success: false, status_code: 404, message: msg });
    return jsonResp({ success: false, message: msg }, 404);
  }
  log.staff_id = staff.id;

  // Resolve service by name
  const { data: services } = await supabase
    .from("services")
    .select("id, name")
    .ilike("name", `%${body.serviceName}%`)
    .limit(5);
  const service = (services || [])[0];
  if (!service) {
    const msg = `Service "${body.serviceName}" not found`;
    await writeLog({ success: false, status_code: 404, message: msg });
    return jsonResp({ success: false, message: msg }, 404);
  }

  // Resolve or create patient by phone (match on last 10 digits)
  const phoneDigits = last10(body.patientPhone);
  let patient: { id: string; first_name: string; last_name: string } | null = null;
  if (phoneDigits) {
    const { data: pmatches } = await supabase
      .from("patients")
      .select("id, first_name, last_name, phone")
      .ilike("phone", `%${phoneDigits}`)
      .limit(5);
    patient = (pmatches || [])[0] || null;
  }
  if (!patient) {
    const fullName = (body.patientName || "Bolna Lead").trim();
    const sp = fullName.indexOf(" ");
    const fn = sp === -1 ? fullName : fullName.slice(0, sp);
    const ln = sp === -1 ? "" : fullName.slice(sp + 1).trim();
    const { data: created, error: cErr } = await supabase
      .from("patients")
      .insert({
        first_name: fn || "Bolna",
        last_name: ln || "Lead",
        phone: normalizePhone(body.patientPhone),
        source: "Bolna AI",
      })
      .select("id, first_name, last_name")
      .single();
    if (cErr || !created) {
      const msg = "Failed to create patient";
      await writeLog({ success: false, status_code: 500, error: cErr?.message, message: msg });
      return jsonResp({ success: false, message: msg }, 500);
    }
    patient = created;
  }
  log.patient_id = patient.id;

  // Check slot availability
  const { data: conflicts, error: cfErr } = await supabase
    .from("appointments")
    .select("id")
    .eq("staff_id", staff.id)
    .not("status", "in", "(Cancelled,No-show)")
    .lt("start_time", endIso)
    .gt("end_time", startIso)
    .limit(1);
  if (cfErr) {
    await writeLog({ success: false, status_code: 500, error: cfErr.message, message: "Availability check failed" });
    return jsonResp({ success: false, message: "Availability check failed" }, 500);
  }
  if (conflicts && conflicts.length) {
    const msg = "Requested slot unavailable";
    await writeLog({ success: false, status_code: 409, message: msg });
    return jsonResp({ success: false, message: msg }, 409);
  }

  // Create appointment
  const { data: appt, error: aErr } = await supabase
    .from("appointments")
    .insert({
      patient_id: patient.id,
      patient_name: `${patient.first_name} ${patient.last_name}`.trim(),
      staff_id: staff.id,
      service: service.name,
      start_time: startIso,
      end_time: endIso,
      status: "Scheduled",
      appointment_type: "Consultation",
      source: "Bolna AI",
    })
    .select("id")
    .single();

  if (aErr || !appt) {
    const msg = /overlap|already has an appointment/i.test(aErr?.message || "")
      ? "Requested slot unavailable"
      : "Failed to create appointment";
    const status = msg === "Requested slot unavailable" ? 409 : 500;
    await writeLog({ success: false, status_code: status, error: aErr?.message, message: msg });
    return jsonResp({ success: false, message: msg }, status);
  }

  const appointmentId = `APT-${appt.id.slice(0, 8).toUpperCase()}`;
  await writeLog({
    success: true,
    status_code: 200,
    message: "Appointment booked successfully",
    appointment_id: appt.id,
  });

  // TODO: future — trigger WhatsApp/SMS confirmation
  // await supabase.functions.invoke("send-appointment-whatsapp", { body: { appointmentId: appt.id } });

  return jsonResp({
    success: true,
    appointmentId,
    appointmentUuid: appt.id,
    message: "Appointment booked successfully",
  });
});