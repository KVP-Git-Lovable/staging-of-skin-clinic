import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const {
      description = "",
      problemArea = "",
      serviceType = "",
      ageMin,
      ageMax,
      count = 10,
    } = await req.json();
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const n = Math.max(1, Math.min(30, Number(count) || 10));

    const system = `You write patient-facing survey questions for a skin clinic.
AUDIENCE: the patient answers these directly, on their own, with no doctor present.
RULES:
- Plain, everyday language only. NO clinical/medical jargon or technical terms
  (e.g. say "flare up" or "get worse", not "exacerbate"; say "sun exposure",
  not "photoexposure"; say "skin patches", not "lesions").
- Each question must be short, clear, and answerable by someone with no
  medical background.
- Pick the most natural type per question:
  - "text" for anything open-ended.
  - "single_choice" when the patient picks exactly one option.
  - "multi_choice" when more than one option can apply.
  - "scale" for a 1-10 self-rating (e.g. severity, how much it bothers them).
- For "single_choice"/"multi_choice", give 3-6 short, plain-language options.
  For "text" and "scale", options must be an empty array.
- Do not repeat the same question twice. Stay relevant to the given context.`;

    const user = `Generate exactly ${n} survey questions for this template.
Description: ${description || "(none given)"}
Primary Concern: ${problemArea || "(any)"}
Service Type: ${serviceType || "(any)"}
Patient Age Range: ${ageMin ?? 0} - ${ageMax ?? 120}`;

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
            name: "return_questions",
            description: "Return the generated survey questions.",
            parameters: {
              type: "object",
              properties: {
                questions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      question_text: { type: "string" },
                      question_type: { type: "string", enum: ["text", "single_choice", "multi_choice", "scale"] },
                      options: { type: "array", items: { type: "string" } },
                    },
                    required: ["question_text", "question_type", "options"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["questions"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_questions" } },
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (resp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await resp.text();
      return new Response(JSON.stringify({ error: `AI gateway ${resp.status}`, detail: t.slice(0, 500) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const json = await resp.json();
    const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || "{}";
    let parsed: { questions?: unknown[] } = {};
    try { parsed = JSON.parse(args); } catch { parsed = {}; }
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    return new Response(JSON.stringify({ questions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
