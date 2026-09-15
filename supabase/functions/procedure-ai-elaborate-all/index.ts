import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { serviceName = "Consultation", symptoms = "", diagnosis = "", procedure_notes = "", recommendations = "" } = await req.json();
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = `You are a dermatology clinical documentation assistant.
Given draft notes, elaborate each provided field into proper clinical language: complete sentences, professional tone, well-formatted.
RULES:
- If a field is empty, return null for it. Do NOT invent content.
- Preserve all clinical facts; only expand wording, grammar, structure.
- Keep output focused and concise; no headings, no markdown.`;

    const user = `Service: ${serviceName}\n\nSymptoms (draft): ${symptoms}\nDiagnosis (draft): ${diagnosis}\nProcedure Notes (draft): ${procedure_notes}\nRecommendations (draft): ${recommendations}`;

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
            name: "return_elaborated",
            description: "Return elaborated versions of each field.",
            parameters: {
              type: "object",
              properties: {
                symptoms: { type: ["string", "null"] },
                diagnosis: { type: ["string", "null"] },
                procedure_notes: { type: ["string", "null"] },
                recommendations: { type: ["string", "null"] },
              },
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_elaborated" } },
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