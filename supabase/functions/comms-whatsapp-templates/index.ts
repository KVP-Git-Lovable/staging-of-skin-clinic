import { corsHeaders, json, requireStaff, twilioCreds } from "../_shared/comms-auth.ts";

type ContentRow = {
  sid: string;
  friendly_name: string;
  language: string;
  variables: Record<string, string> | null;
  types: Record<string, { body?: string }> | null;
  date_updated: string;
  approval_requests?: { whatsapp?: { status?: string; category?: string; rejection_reason?: string } };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const denied = await requireStaff(req);
  if (denied) return denied;

  const creds = twilioCreds();
  if (!creds) return json({ error: "twilio_not_configured" }, 503);

  const res = await fetch("https://content.twilio.com/v1/ContentAndApprovals?PageSize=100", {
    headers: { Authorization: creds.auth },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("twilio templates failed", res.status, data?.message);
    return json({ error: "twilio_error", status: res.status, message: data?.message ?? null }, 502);
  }

  const templates = ((data.contents ?? []) as ContentRow[]).map((c) => {
    const type = Object.values(c.types ?? {})[0];
    const wa = c.approval_requests?.whatsapp;
    return {
      sid: c.sid,
      name: c.friendly_name,
      language: c.language,
      body: type?.body ?? "",
      variables: Object.keys(c.variables ?? {}),
      status: wa?.status ?? "not_submitted",
      category: wa?.category ?? null,
      rejection_reason: wa?.rejection_reason || null,
      updated_at: c.date_updated,
    };
  });

  return json({ templates, fetched_at: new Date().toISOString() });
});
