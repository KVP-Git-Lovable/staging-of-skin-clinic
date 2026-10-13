import { corsHeaders, json, requireStaff, twilioCreds } from "../_shared/comms-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const denied = await requireStaff(req);
  if (denied) return denied;

  const creds = twilioCreds();
  if (!creds) return json({ error: "twilio_not_configured" }, 503);

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${creds.sid}/Balance.json`,
    { headers: { Authorization: creds.auth } },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("twilio balance failed", res.status, data?.message);
    return json({ error: "twilio_error", status: res.status, message: data?.message ?? null }, 502);
  }

  return json({
    balance: data.balance,
    currency: data.currency,
    account_sid_last4: creds.sid.slice(-4),
    fetched_at: new Date().toISOString(),
  });
});
