// Twilio WhatsApp fallback webhook — invoked when the primary webhook fails or times out.
// Phone bound to this fallback: +917411675656 (Account SID: AC2bed17b2742df7031ebc7de2d726b62f)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let payload: Record<string, string> = {};

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      form.forEach((v, k) => {
        payload[k] = String(v);
      });
    } else if (contentType.includes("application/json")) {
      payload = await req.json();
    }

    console.error(
      "[whatsapp-fallback] Primary webhook failed. Payload:",
      JSON.stringify(payload),
    );

    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
    return new Response(twiml, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/xml" },
    });
  } catch (error) {
    console.error("[whatsapp-fallback] Error:", error);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
    return new Response(twiml, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/xml" },
    });
  }
});