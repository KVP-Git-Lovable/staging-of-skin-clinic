import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface ReqBody {
  imageBase64: string; // data URL or raw base64
  mimeType?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json()) as ReqBody;
    if (!body?.imageBase64) {
      return new Response(JSON.stringify({ error: "imageBase64 required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dataUrl = body.imageBase64.startsWith("data:")
      ? body.imageBase64
      : `data:${body.mimeType || "image/jpeg"};base64,${body.imageBase64}`;

    const system = `You extract structured clinical data from a photo of handwritten or printed procedure notes for a dermatology / aesthetics clinic. Be conservative: if a field is unreadable or absent, leave it empty (""). For medicines, only include items you can clearly identify.`;

    const tools = [
      {
        type: "function",
        function: {
          name: "extract_procedure",
          description: "Return extracted procedure fields and medicines.",
          parameters: {
            type: "object",
            properties: {
              service_name: { type: "string", description: "Procedure or service name" },
              symptoms: { type: "string" },
              diagnosis: { type: "string" },
              procedure_notes: { type: "string" },
              recommendations: { type: "string" },
              medicines: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    medicine_name: { type: "string" },
                    dosage: { type: "string" },
                    frequency: { type: "string" },
                    duration: { type: "string" },
                    instructions: { type: "string" },
                  },
                  required: ["medicine_name"],
                  additionalProperties: false,
                },
              },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              unclear: { type: "boolean", description: "True if handwriting is unclear and the user should review carefully" },
            },
            required: ["service_name", "symptoms", "diagnosis", "procedure_notes", "recommendations", "medicines", "confidence", "unclear"],
            additionalProperties: false,
          },
        },
      },
    ];

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the procedure details from this handwritten / printed clinical note. Use the extract_procedure tool." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "extract_procedure" } },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      const status = resp.status === 429 || resp.status === 402 ? resp.status : 502;
      const msg = resp.status === 429
        ? "Rate limit reached. Please try again shortly."
        : resp.status === 402
        ? "AI credits exhausted. Add credits to continue."
        : `AI gateway error: ${resp.status}`;
      return new Response(JSON.stringify({ error: msg, detail: t.slice(0, 500) }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const json = await resp.json();
    const call = json?.choices?.[0]?.message?.tool_calls?.[0];
    const args = call?.function?.arguments;
    let parsed: any = {};
    try {
      parsed = typeof args === "string" ? JSON.parse(args) : (args || {});
    } catch {
      parsed = {};
    }
    // Defensive defaults
    parsed.service_name ??= "";
    parsed.symptoms ??= "";
    parsed.diagnosis ??= "";
    parsed.procedure_notes ??= "";
    parsed.recommendations ??= "";
    parsed.medicines = Array.isArray(parsed.medicines) ? parsed.medicines : [];
    parsed.confidence ??= "medium";
    parsed.unclear ??= false;

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});