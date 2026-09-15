import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { patientId } = await req.json();
    if (!patientId) throw new Error("patientId is required");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const [patientRes, proceduresRes, appointmentsRes, invoicesRes, prescriptionsRes, photosRes, attachmentsRes] = await Promise.all([
      supabase.from("patients").select("*").eq("id", patientId).single(),
      supabase.from("procedures").select("*").eq("patient_id", patientId).order("procedure_date", { ascending: true }),
      supabase.from("appointments").select("*").eq("patient_id", patientId).order("start_time", { ascending: true }),
      supabase.from("invoices").select("*").eq("patient_id", patientId).order("created_at", { ascending: true }),
      supabase.from("prescriptions").select("*, pharma_products(name)").limit(500),
      supabase.from("patient_photos").select("id, photo_type, notes, taken_at, procedure_id").eq("patient_id", patientId).order("taken_at", { ascending: true }),
      supabase.from("procedure_attachments").select("id, file_name, notes, procedure_id").eq("patient_id", patientId),
    ]);

    const patient = patientRes.data;
    const procedures = proceduresRes.data || [];
    const appointments = appointmentsRes.data || [];
    const invoices = invoicesRes.data || [];
    const photos = photosRes.data || [];
    const attachments = attachmentsRes.data || [];

    const procIds = new Set(procedures.map((p: any) => p.id));
    const prescriptions = (prescriptionsRes.data || []).filter((rx: any) => procIds.has(rx.procedure_id));

    const dataSummary = `
PATIENT: ${patient?.first_name} ${patient?.last_name}
Gender: ${patient?.gender || "N/A"}, DOB: ${patient?.date_of_birth || "N/A"}
Skin Type: ${patient?.skin_type || "N/A"}, Skin Concerns: ${patient?.skin_concerns || "N/A"}
Medical History: ${patient?.medical_history || "None"}
Allergies: ${patient?.allergies || "None"}
Current Medications: ${patient?.current_medications || "None"}
Previous Treatments: ${patient?.previous_treatments || "None"}
Registered: ${patient?.created_at}

APPOINTMENTS (${appointments.length}):
${appointments.map((a: any) => `- ${a.start_time}: ${a.service} [${a.status}]`).join("\n")}

PROCEDURES (${procedures.length}):
${procedures.map((p: any) => `- ${p.procedure_date}: ${p.service_name} [${p.status}]
  Diagnosis: ${p.diagnosis || "N/A"}
  Notes: ${p.procedure_notes || "N/A"}
  Recommendations: ${p.recommendations || "N/A"}`).join("\n")}

PRESCRIPTIONS (${prescriptions.length}):
${prescriptions.map((rx: any) => `- ${rx.medicine_name} (${rx.pharma_products?.name || ""}) | Dosage: ${rx.dosage || "N/A"} | Freq: ${rx.frequency || "N/A"} | Duration: ${rx.duration || "N/A"} | Qty: ${rx.quantity}`).join("\n")}

PHOTOS (${photos.length}):
${photos.map((p: any) => `- ${p.taken_at}: ${p.photo_type} ${p.notes ? "- " + p.notes : ""}`).join("\n")}

ATTACHMENTS (${attachments.length}):
${attachments.map((a: any) => `- ${a.file_name} ${a.notes ? "- " + a.notes : ""}`).join("\n")}

FINANCIAL:
- Total billed: ₹${invoices.reduce((s: number, i: any) => s + Number(i.total_amount), 0).toLocaleString()}
- Total paid: ₹${invoices.reduce((s: number, i: any) => s + Number(i.paid_amount), 0).toLocaleString()}
`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a senior dermatologist AI assistant. Analyse the complete patient case history including all appointments, procedures, diagnoses, prescriptions, photos, and attachments. Return a comprehensive case analysis as JSON (no markdown, no code fences):
{
  "summary": "<2-3 paragraph comprehensive case summary covering the patient's journey, conditions treated, and overall progress>",
  "timeline": [{"date": "<date>", "event": "<procedure/appointment>", "details": "<key details>"}],
  "diagnosisHistory": ["<diagnosis 1 with context>", "<diagnosis 2>"],
  "treatmentPatterns": "<analysis of treatment approaches used, frequency, and effectiveness>",
  "medicationSummary": "<summary of all medications prescribed, patterns, changes over time>",
  "skinProgress": "<assessment of skin condition progress based on photos notes and treatment outcomes>",
  "keyFindings": ["<finding 1>", "<finding 2>"],
  "clinicalRecommendations": ["<recommendation 1>", "<recommendation 2>"]
}

Rules:
- Be thorough and clinically precise
- Include all relevant diagnoses across visits
- Note any treatment changes or escalations
- Identify patterns in visit frequency and treatment response
- If limited data, note that and provide what analysis is possible
- Timeline should cover the most significant events (max 10)`
          },
          { role: "user", content: dataSummary },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResponse.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI gateway error");
    }

    const result = await aiResponse.json();
    let text = result.choices?.[0]?.message?.content || "{}";
    text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    // Models occasionally emit slightly malformed JSON. Try progressively more
    // forgiving parses instead of failing the whole request with a 500.
    const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return null; } };
    let analysis = tryParse(text);
    if (!analysis) {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start !== -1 && end > start) analysis = tryParse(text.slice(start, end + 1));
    }
    if (!analysis) {
      // Strip trailing commas and retry once more.
      analysis = tryParse(text.replace(/,\s*([}\]])/g, "$1"));
    }
    if (!analysis) {
      console.error("case-analysis: unparseable model output", text.slice(0, 500));
      return new Response(
        JSON.stringify({ error: "The AI returned an unreadable response. Please try again." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ analysis }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("case-analysis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
