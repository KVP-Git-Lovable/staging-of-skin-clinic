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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all patient data in parallel
    const [patientRes, proceduresRes, appointmentsRes, invoicesRes, prescriptionsRes] = await Promise.all([
      supabase.from("patients").select("*").eq("id", patientId).single(),
      supabase.from("procedures").select("id, service_name, procedure_date, status, diagnosis").eq("patient_id", patientId).order("procedure_date", { ascending: true }),
      supabase.from("appointments").select("id, service, start_time, status").eq("patient_id", patientId).order("start_time", { ascending: true }),
      supabase.from("invoices").select("id, total_amount, paid_amount, status, created_at").eq("patient_id", patientId).order("created_at", { ascending: true }),
      supabase.from("prescriptions").select("id, medicine_name, procedure_id").limit(100),
    ]);

    const patient = patientRes.data;
    const procedures = proceduresRes.data || [];
    const appointments = appointmentsRes.data || [];
    const invoices = invoicesRes.data || [];

    // Filter prescriptions to this patient's procedures
    const procIds = new Set(procedures.map((p: any) => p.id));
    const prescriptions = (prescriptionsRes.data || []).filter((rx: any) => procIds.has(rx.procedure_id));

    // Build a data summary for the AI
    const totalSpend = invoices.reduce((s: number, i: any) => s + Number(i.total_amount), 0);
    const totalPaid = invoices.reduce((s: number, i: any) => s + Number(i.paid_amount), 0);
    const visitDates = appointments.map((a: any) => a.start_time).concat(procedures.map((p: any) => p.procedure_date)).sort();
    const uniqueServices = [...new Set(procedures.map((p: any) => p.service_name))];
    const statuses = appointments.map((a: any) => a.status);
    const noShowCount = statuses.filter((s: string) => s.toLowerCase().includes("no") || s.toLowerCase().includes("cancel")).length;

    const dataSummary = `
PATIENT PROFILE:
- Name: ${patient?.first_name} ${patient?.last_name}
- Gender: ${patient?.gender || "N/A"}, DOB: ${patient?.date_of_birth || "N/A"}
- Skin Type: ${patient?.skin_type || "N/A"}, Skin Concerns: ${patient?.skin_concerns || "N/A"}
- Medical History: ${patient?.medical_history || "None"}
- Allergies: ${patient?.allergies || "None"}
- Status: ${patient?.status}
- Registered: ${patient?.created_at}

VISIT HISTORY (${visitDates.length} total visits):
- First visit: ${visitDates[0] || "None"}
- Last visit: ${visitDates[visitDates.length - 1] || "None"}
- Visit dates: ${visitDates.slice(-10).join(", ")}

PROCEDURES (${procedures.length}):
${procedures.slice(-10).map((p: any) => `- ${p.procedure_date}: ${p.service_name} (${p.status})`).join("\n")}

SERVICES USED: ${uniqueServices.join(", ") || "None"}

APPOINTMENTS (${appointments.length}):
- Completed/Confirmed: ${statuses.filter((s: string) => s.toLowerCase().includes("complete") || s.toLowerCase().includes("confirm")).length}
- No-shows/Cancelled: ${noShowCount}

FINANCIAL:
- Total billed: ₹${totalSpend.toLocaleString()}
- Total paid: ₹${totalPaid.toLocaleString()}
- Outstanding: ₹${(totalSpend - totalPaid).toLocaleString()}
- Invoices: ${invoices.length}

PRESCRIPTIONS: ${prescriptions.length} medicines prescribed
`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a dermatology clinic analytics AI. Analyze the patient data and return a JSON object with exactly this structure (no markdown, no code fences, just raw JSON):
{
  "patientRating": <number 1-5, where 5 is highest value patient>,
  "ratingLabel": "<one of: Premium, High Value, Regular, Occasional, New>",
  "visitFrequency": "<e.g. 'Every 2 weeks', 'Monthly', 'Quarterly', 'Irregular'>",
  "avgDaysBetweenVisits": <number or null>,
  "prediction": "<one of: Growth, Stable, Slow, Churn Risk>",
  "predictionConfidence": <number 0-100>,
  "totalLifetimeValue": <number>,
  "insights": ["<insight 1>", "<insight 2>", "<insight 3>"],
  "nextVisitEstimate": "<e.g. 'Within 2 weeks', 'Next month', 'Overdue by 3 weeks'>",
  "engagementScore": <number 0-100>,
  "riskFactors": ["<risk 1>", "<risk 2>"],
  "opportunities": ["<opportunity 1>", "<opportunity 2>"]
}

Rules:
- Rating is based on visit frequency, spend, treatment diversity, and consistency
- Prediction considers recency, frequency trend, no-show rate, and payment behavior
- Growth = increasing visit frequency or expanding services
- Stable = consistent regular visits
- Slow = decreasing frequency but still active
- Churn Risk = long gap since last visit, increasing no-shows, or declining engagement
- Be specific and actionable in insights and opportunities
- If very few data points, still provide best estimates with lower confidence`
          },
          { role: "user", content: dataSummary }
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const result = await aiResponse.json();
    let text = result.choices?.[0]?.message?.content || "{}";
    // Strip code fences if present
    text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    
    const analysis = JSON.parse(text);

    return new Response(JSON.stringify({ analysis, rawStats: { totalVisits: visitDates.length, totalProcedures: procedures.length, totalSpend, totalPaid, uniqueServices: uniqueServices.length, noShowCount } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("patient-360 error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
