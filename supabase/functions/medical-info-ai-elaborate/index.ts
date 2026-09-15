import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const {
      medical_history = "",
      current_medications = "",
      allergies = "",
      previous_treatments = "",
      skin_type = "",
      skin_concerns = "",
    } = await req.json();
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = `You are a dermatology clinical documentation assistant.
Given a patient's draft medical-history fields, elaborate each provided field into proper clinical language: complete sentences, professional tone, well-formatted.
RULES:
- If a field is empty, return null for it. Do NOT invent content.
- Preserve all clinical facts (medicines, doses, dates, conditions); only expand wording, grammar, structure.
- Keep each field focused and concise; no headings, no markdown, no bullet points.`;

    const user = `Medical History (draft): ${medical_history}
Current Medications (draft): ${current_medications}
Allergies (draft): ${allergies}
Previous Treatments (draft): ${previous_treatments}
Skin Type (draft): ${skin_type}
Skin Concerns (draft): ${skin_concerns}`;

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
            description: "Return elaborated versions of each medical-history field.",
            parameters: {
              type: "object",
              properties: {
                medical_history: { type: ["string", "null"] },
                current_medications: { type: ["string", "null"] },
                allergies: { type: ["string", "null"] },
                previous_treatments: { type: ["string", "null"] },
                skin_type: { type: ["string", "null"] },
                skin_concerns: { type: ["string", "null"] },
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
