// Receives Mailchimp list webhooks (unsubscribe, cleaned, campaign sent).
// Public endpoint (verify_jwt = false); the `key` query parameter must match the
// secret stored in comms_comms_mailchimp_connection.webhook_secret. Mailchimp validates the URL
// with a GET request, which must answer 2xx. Payloads are form-encoded.

import { createClient } from "npm:@supabase/supabase-js@2";
import { mailchimpFromEnv, syncCampaignReport } from "../_shared/comms-mailchimp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Parses `data[email]=x&data[merges][FNAME]=y` style bodies into nested objects. */
function parseFormPayload(body: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const params = new URLSearchParams(body);
  for (const [rawKey, value] of params.entries()) {
    const parts = rawKey.replace(/\]/g, "").split("[");
    let cur: Record<string, unknown> = out;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) cur[p] = value;
      else {
        if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
        cur = cur[p] as Record<string, unknown>;
      }
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // Mailchimp pings the URL with GET when the webhook is created.
  if (req.method === "GET" || req.method === "HEAD") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || "";

  const { data: conn } = await db.from("comms_mailchimp_connection").select("*").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!conn?.webhook_secret || key !== conn.webhook_secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const raw = await req.text();
  const ct = req.headers.get("content-type") || "";
  let payload: Record<string, unknown>;
  try {
    payload = ct.includes("application/json") ? JSON.parse(raw) : parseFormPayload(raw);
  } catch {
    return new Response(JSON.stringify({ error: "Bad payload" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const type = String(payload.type || "").toLowerCase();
  const data = (payload.data || {}) as Record<string, unknown>;
  const firedAt = payload.fired_at ? new Date(String(payload.fired_at).replace(" ", "T") + (String(payload.fired_at).endsWith("Z") ? "" : "Z")) : new Date();
  const ts = Number.isNaN(firedAt.getTime()) ? new Date() : firedAt;

  try {
    if (type === "unsubscribe" || type === "cleaned") {
      const email = String(data.email || "").trim().toLowerCase();
      if (email) {
        // Which local campaign (if any) this came from
        let campaignId: string | null = null;
        const mcCampaign = String(data.campaign_id || "");
        if (mcCampaign) {
          const { data: c } = await db.from("comms_email_campaigns").select("id").eq("mailchimp_campaign_id", mcCampaign).maybeSingle();
          campaignId = c?.id || null;
        }
        const reason = type === "cleaned" ? `mailchimp_cleaned_${String(data.reason || "unknown")}` : "mailchimp_unsubscribe";
        await db.from("comms_email_suppressions").upsert({ email, reason, campaign_id: campaignId }, { onConflict: "email", ignoreDuplicates: true });
        if (campaignId) {
          await db.from("comms_email_events").upsert({
            campaign_id: campaignId,
            recipient_email: email,
            event_type: type === "cleaned" ? "bounce" : "unsubscribe",
            reason: type === "cleaned" ? String(data.reason || "cleaned") : String(data.reason || "manual"),
            event_key: `mc:${campaignId}:${email}:${type}:${Math.floor(ts.getTime() / 1000)}`,
            event_timestamp: ts.toISOString(),
            raw: { source: "mailchimp_webhook", type, data },
          }, { onConflict: "event_key", ignoreDuplicates: true });
        }
      }
    } else if (type === "campaign") {
      const mcCampaign = String(data.id || "");
      if (mcCampaign) {
        const { data: c } = await db.from("comms_email_campaigns").select("*").eq("mailchimp_campaign_id", mcCampaign).maybeSingle();
        let mc: ReturnType<typeof mailchimpFromEnv> | null = null;
        try { mc = mailchimpFromEnv(); } catch { mc = null; }
        if (c && mc) {
          await syncCampaignReport(db, mc, { ...c, mailchimp_report_synced_at: null });
        } else if (c) {
          await db.from("comms_email_campaigns").update({ status: String(data.status || "") === "sent" ? "sent" : c.status }).eq("id", c.id);
        }
      }
    }
  } catch (err) {
    console.error("mailchimp-webhook error:", (err as Error).message);
    // Always 200 so Mailchimp does not disable the webhook; the error is logged.
  }

  return new Response(JSON.stringify({ ok: true, type }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
