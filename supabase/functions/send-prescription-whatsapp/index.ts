import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Stub for sending a prescription PDF via WhatsApp.
// Generates and uploads the PDF, then returns the public URL.
// Twilio media-message wiring is intentionally left for a follow-up.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { procedureId } = await req.json();
    if (!procedureId) throw new Error("procedureId is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Generate + upload via the sibling function
    const { data, error } = await supabase.functions.invoke("generate-prescription-pdf", {
      body: { procedureId, mode: "upload" },
    });
    if (error) throw error;
    if (!data?.url) throw new Error("Failed to generate prescription PDF");

    const phone = data.phone;
    // TODO: Once Twilio template SID is configured, send the WhatsApp media
    // message here using the Twilio connector / API.

    return new Response(JSON.stringify({
      ok: true,
      queued: true,
      public_url: data.url,
      filename: data.filename,
      phone,
      message: phone
        ? "Prescription uploaded. WhatsApp delivery will be enabled once Twilio template is configured."
        : "Prescription uploaded. No phone number on file for this patient.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-prescription-whatsapp error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});