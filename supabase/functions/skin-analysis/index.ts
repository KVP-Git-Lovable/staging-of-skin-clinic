import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { beforeImageUrl, afterImageUrl } = await req.json();

    if (!beforeImageUrl || !afterImageUrl) {
      return new Response(
        JSON.stringify({ error: "Both before and after image URLs are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert dermatologist AI assistant. You will be shown two skin photos: a "before" photo and an "after" photo of the same patient. Analyze both images and provide a structured skin analysis comparison.

Respond ONLY with valid JSON in this exact format (no markdown, no code blocks):
{
  "overallImprovement": <number 0-100>,
  "summary": "<2-3 sentence summary of changes>",
  "metrics": [
    { "name": "<metric name>", "before": <0-10>, "after": <0-10>, "change": "<improved/worsened/unchanged>" },
    ...
  ],
  "details": "<detailed paragraph about the skin changes observed>",
  "recommendations": ["<recommendation 1>", "<recommendation 2>", "<recommendation 3>"]
}

Analyze these metrics at minimum: Texture, Tone Evenness, Pigmentation, Hydration, Pore Visibility, Fine Lines. Add more if relevant. Scores are 1 (worst) to 10 (best).`;

    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: "Please analyze these two skin photos. The first is the BEFORE photo and the second is the AFTER photo." },
                { type: "image_url", image_url: { url: beforeImageUrl } },
                { type: "image_url", image_url: { url: afterImageUrl } },
              ],
            },
          ],
        }),
      });

      if (response.status === 503 && attempt < 2) {
        console.log(`AI gateway returned 503, retrying (attempt ${attempt + 2}/3)...`);
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      const status = response?.status || 500;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits depleted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = response ? await response.text() : "No response";
      console.error("AI gateway error:", status, errorText);
      throw new Error(`AI model temporarily unavailable. Please try again.`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in AI response");
    }

    // Parse JSON from the response, stripping markdown code blocks if present
    let cleanContent = content.trim();
    if (cleanContent.startsWith("```")) {
      cleanContent = cleanContent.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const analysis = JSON.parse(cleanContent);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Skin analysis error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
