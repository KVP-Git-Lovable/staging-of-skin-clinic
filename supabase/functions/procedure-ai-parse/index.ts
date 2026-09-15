import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const {
      transcript,
      currentFields = {},
      problemAreas = [],
    } = await req.json();
    if (!transcript || typeof transcript !== "string") {
      return new Response(JSON.stringify({ error: "transcript required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fmt = (list: any[]) =>
      (list || []).slice(0, 800).map((x) => x.name).join("\n") || "(none)";

    const system = `You parse a doctor's free-form clinical dictation into structured procedure fields.
Only populate fields the doctor explicitly mentioned. For fields not mentioned, return null.
Do NOT invent clinical content. Keep wording close to the doctor's words; light cleanup only.
If the doctor mentioned medicines, return each as a prescription row.

EXTRACTION RULES:
- patient_name: full name of the patient mentioned, exactly as spoken (strip honorifics).
- doctor_name: full name of the doctor mentioned (strip "Dr.", "doctor").
- assistant_name: full name of any nurse / assistant / therapist mentioned.
- problem_areas: array of concern phrases (e.g. "acne", "anti aging"). Map to the
  closest names from the PROBLEM AREAS list below when possible; otherwise return the
  raw spoken phrase. The client performs final fuzzy matching.

PROBLEM AREAS (names):\n${fmt(problemAreas)}`;

    const user = `TRANSCRIPT:\n${transcript}\n\nCURRENT FIELDS (for context, do not duplicate if unchanged):\n${JSON.stringify(currentFields)}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [{
          type: "function",
          function: {
            name: "fill_procedure_fields",
            description: "Fill procedure fields from doctor dictation.",
            parameters: {
              type: "object",
              properties: {
                patient_name: { type: ["string", "null"] },
                doctor_name: { type: ["string", "null"] },
                assistant_name: { type: ["string", "null"] },
                problem_areas: {
                  type: "array",
                  items: { type: "string" },
                },
                service_name: { type: ["string", "null"] },
                symptoms: { type: ["string", "null"] },
                diagnosis: { type: ["string", "null"] },
                procedure_notes: { type: ["string", "null"] },
                recommendations: { type: ["string", "null"] },
                prescriptions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      medicine_name: { type: "string" },
                      frequency: { type: "string" },
                      duration: { type: "string" },
                      instructions: { type: "string" },
                    },
                    required: ["medicine_name"],
                    additionalProperties: false,
                  },
                },
              },
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "fill_procedure_fields" } },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return new Response(JSON.stringify({ error: `AI gateway ${resp.status}`, detail: t.slice(0, 500) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const json = await resp.json();
    const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || "{}";
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(args); } catch { parsed = {}; }
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});