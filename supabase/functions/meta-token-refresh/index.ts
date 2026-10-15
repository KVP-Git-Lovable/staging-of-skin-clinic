import { createClient } from "npm:@supabase/supabase-js@2";
import { encryptSecret, decryptSecret } from "../_shared/meta-crypto.ts";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Scheduled job (Bearer LOVABLE_CRON_SECRET). Long-lived Meta tokens last ~60 days.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = authenticateCronRequest(req);
  if (denied) return denied;
  try {
    const appId = Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("META_APP_SECRET");
    if (!appId || !appSecret) throw new Error("Meta app credentials are not configured");

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: conns } = await db.from("social_connections").select("*").eq("platform", "meta");

    let refreshed = 0;
    for (const c of conns || []) {
      const expires = c.token_expires_at ? new Date(c.token_expires_at).getTime() : 0;
      // refresh when expiring within 10 days (or unknown expiry)
      if (expires && expires - Date.now() > 10 * 24 * 3600 * 1000) continue;
      try {
        const token = await decryptSecret(c.access_token_enc);
        const res = await fetch(
          `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token` +
            `&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${token}`,
        );
        const j = await res.json();
        if (!res.ok || j.error) throw new Error(j.error?.message || "refresh failed");
        await db.from("social_connections").update({
          access_token_enc: await encryptSecret(j.access_token),
          token_expires_at: j.expires_in ? new Date(Date.now() + j.expires_in * 1000).toISOString() : null,
          status: "connected",
        }).eq("id", c.id);
        refreshed++;
      } catch (e) {
        console.error("token refresh failed:", (e as Error).message);
        await db.from("social_connections").update({ status: "needs_reauth" }).eq("id", c.id);
      }
    }

    return new Response(JSON.stringify({ success: true, refreshed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
