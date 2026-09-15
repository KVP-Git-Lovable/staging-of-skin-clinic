import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface ReqBody {
  transcript: string;
  patients: { id: string; name: string; phone?: string | null }[];
  services: { id: string; name: string }[];
  today?: string; // YYYY-MM-DD, client's local today for relative date resolution
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = (await req.json()) as ReqBody;
    const { transcript, patients = [], services = [], today } = body || ({} as ReqBody);
    if (!transcript || typeof transcript !== "string") {
      return new Response(JSON.stringify({ error: "transcript required" }), {
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

    const patientList = patients
      .slice(0, 800)
      .map((p) => `${p.id}|${p.name}${p.phone ? "|" + p.phone : ""}`)
      .join("\n");
    const serviceList = services
      .slice(0, 500)
      .map((s) => `${s.id}|${s.name}`)
      .join("\n");

    const system = `You extract appointment booking details from a short spoken transcript.
Return STRICT JSON only, matching this schema:
{
  "patient_id": string | null,
  "patient_query": string | null,
  "service_id": string | null,
  "service_query": string | null,
  "date": string | null,   // YYYY-MM-DD
  "time": string | null,   // HH:mm 24h
  "notes": string | null
}
Rules:
- Match patient and service using fuzzy matching against the provided lists. Return the matched id when confident; else only the query string.
- Resolve relative dates ("today", "tomorrow", "next Monday") using TODAY=${today || new Date().toISOString().slice(0, 10)}.
- Normalize time to 24-hour HH:mm. If user says "3 pm" output "15:00".
- Return null for any field not present.`;

    const user = `TRANSCRIPT:\n${transcript}\n\nPATIENTS (id|name|phone):\n${patientList}\n\nSERVICES (id|name):\n${serviceList}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const errTxt = await resp.text();
      return new Response(
        JSON.stringify({ error: `AI gateway error: ${resp.status}`, detail: errTxt.slice(0, 500) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const json = await resp.json();
    const content: string = json?.choices?.[0]?.message?.content || "{}";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }
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