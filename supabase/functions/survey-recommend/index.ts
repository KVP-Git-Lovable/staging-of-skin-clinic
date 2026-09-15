import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { template, questions, answers, available_products, available_services } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build context for AI
    const questionAnalysis = questions.map((q: any) => ({
      question: q.question_text,
      type: q.question_type,
      patient_answer: answers[q.id],
      ideal_answer: q.ideal_answer?.value,
    }));

    const productPool = (available_products || []).map((p: any) => ({
      id: p.product_id,
      name: p.pharma_products?.name || "Unknown",
      category: p.pharma_products?.category || "",
      advice: p.advice_text || "",
      dosage: p.dosage || "",
      frequency: p.frequency || "",
      duration: p.duration || "",
      instructions: p.instructions || "",
    }));

    const servicePool = (available_services || []).map((s: any) => ({
      id: s.service_id,
      name: s.services?.name || "Unknown",
      category: s.services?.category || "",
      advice: s.advice_text || "",
    }));

    const systemPrompt = `You are a dermatology clinical advisor. Analyze patient survey responses compared to ideal answers. Based on the gap analysis, recommend the most relevant products and services from the available pool.

Rules:
- Compare each patient answer against the ideal answer
- Identify areas of concern where patient answers deviate from ideals
- Select products and services most relevant to the identified concerns
- Provide a brief overall recommendation text
- Be specific but concise in your advice`;

    const userPrompt = `Survey: ${template?.name || "Patient Assessment"}
Description: ${template?.description || ""}
Age range: ${template?.age_range_min}-${template?.age_range_max}

Patient Responses vs Ideals:
${JSON.stringify(questionAnalysis, null, 2)}

Available Products:
${JSON.stringify(productPool, null, 2)}

Available Services:
${JSON.stringify(servicePool, null, 2)}

Based on the gap analysis between patient responses and ideal answers, provide recommendations.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "provide_recommendations",
            description: "Provide product and service recommendations based on survey analysis",
            parameters: {
              type: "object",
              properties: {
                recommendation: { type: "string", description: "Overall analysis and recommendation text" },
                products: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      product_name: { type: "string" },
                      advice: { type: "string" },
                      dosage: { type: "string" },
                      frequency: { type: "string" },
                      duration: { type: "string" },
                      instructions: { type: "string" },
                    },
                    required: ["product_name", "advice"],
                  },
                },
                services: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      service_name: { type: "string" },
                      advice: { type: "string" },
                    },
                    required: ["service_name", "advice"],
                  },
                },
              },
              required: ["recommendation", "products", "services"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "provide_recommendations" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      // Return empty recommendations on AI failure
      return new Response(JSON.stringify({ recommendation: "", products: [], services: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let result = { recommendation: "", products: [], services: [] };

    if (toolCall?.function?.arguments) {
      try {
        result = JSON.parse(toolCall.function.arguments);
      } catch {
        console.error("Failed to parse AI response");
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("survey-recommend error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
