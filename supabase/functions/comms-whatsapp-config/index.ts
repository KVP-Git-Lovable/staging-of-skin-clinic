import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, requireStaff, twilioCreds } from "../_shared/comms-auth.ts";

// The clinic's WhatsApp sender. The send functions read TWILIO_WHATSAPP_FROM,
// so that secret stays the source of truth; this is only the display fallback.
const DEFAULT_SENDER = "+917411675656";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const denied = await requireStaff(req);
  if (denied) return denied;

  const raw = Deno.env.get("TWILIO_WHATSAPP_FROM");
  const sender = (raw ?? DEFAULT_SENDER).replace(/^whatsapp:/, "");
  const senderSource = raw ? "secret" : "default";

  let status: string = "unknown";
  let senderSid: string | null = null;
  const creds = twilioCreds();
  if (creds) {
    try {
      const res = await fetch(
        "https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp&PageSize=50",
        { headers: { Authorization: creds.auth } },
      );
      if (res.ok) {
        const data = await res.json();
        const match = (data.senders ?? []).find(
          (s: { sender_id?: string }) => s.sender_id === `whatsapp:${sender}`,
        );
        if (match) {
          status = match.status ?? "unknown";
          senderSid = match.sid ?? null;
        } else {
          status = "not_found";
        }
      }
    } catch (e) {
      console.error("sender lookup failed", e instanceof Error ? e.message : e);
    }
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: clinic } = await admin.from("clinic_settings").select("name").limit(1).maybeSingle();

  return json({
    sender_number: sender,
    sender_source: senderSource,
    status,
    sender_sid: senderSid,
    business_name: clinic?.name ?? null,
    webhook_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`,
    secrets: {
      TWILIO_ACCOUNT_SID: !!Deno.env.get("TWILIO_ACCOUNT_SID"),
      TWILIO_AUTH_TOKEN: !!Deno.env.get("TWILIO_AUTH_TOKEN"),
      TWILIO_WHATSAPP_FROM: !!raw,
    },
    fetched_at: new Date().toISOString(),
  });
});
