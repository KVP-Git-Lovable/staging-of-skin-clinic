// Mailchimp Marketing API helpers shared by comms-mailchimp-api and comms-mailchimp-webhook (API-key auth only).
// Reference: https://mailchimp.com/developer/marketing/ (API 3.0).

export const MC_BATCH_LIMIT = 500;

/** The data centre is the suffix of the key, e.g. "abc123-us21" -> "us21". */
export function dcFromKey(apiKey: string): string {
  const m = String(apiKey || "").trim().match(/-([a-z]{2,4}\d{1,3})$/i);
  if (!m) throw new Error("MAILCHIMP_API_KEY has no data-centre suffix (expected something like ...-us21)");
  return m[1].toLowerCase();
}

export interface McResult<T = unknown> {
  ok: boolean;
  status: number;
  json: T | null;
  text: string;
}

export interface McClient {
  dc: string;
  call<T = unknown>(path: string, init?: RequestInit & { query?: Record<string, string | number | undefined> }): Promise<McResult<T>>;
  /** Like call() but throws a readable error on non-2xx. */
  must<T = unknown>(path: string, init?: RequestInit & { query?: Record<string, string | number | undefined> }): Promise<T>;
}

interface McProblem { title?: string; detail?: string; status?: number; errors?: Array<{ field?: string; message?: string }> }

export function describeMcError(status: number, json: unknown, text: string): string {
  const p = (json || {}) as McProblem;
  const fieldErrors = (p.errors || []).map((e) => [e.field, e.message].filter(Boolean).join(": ")).join("; ");
  const base = [p.title, p.detail].filter(Boolean).join(" — ") || text.slice(0, 300) || `HTTP ${status}`;
  return `Mailchimp [${status}]: ${base}${fieldErrors ? ` (${fieldErrors})` : ""}`;
}

export type MailchimpAuth = string | { apiKey: string };

/** Builds a Marketing API client. An API key uses Basic auth and carries its own data centre in the suffix. */
export function createMailchimpClient(auth: MailchimpAuth, fetchImpl: typeof fetch = fetch): McClient {
  const apiKey = typeof auth === "string" ? auth : auth.apiKey;
  const dc = dcFromKey(apiKey);
  const authorization = "Basic " + btoa(`anystring:${apiKey}`);
  const base = `https://${dc}.api.mailchimp.com/3.0`;

  async function call<T>(path: string, init: RequestInit & { query?: Record<string, string | number | undefined> } = {}): Promise<McResult<T>> {
    const { query, ...rest } = init;
    const url = new URL(base + (path.startsWith("/") ? path : `/${path}`));
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    const res = await fetchImpl(url.toString(), {
      ...rest,
      headers: { Authorization: authorization, "Content-Type": "application/json", ...(rest.headers || {}) },
    });
    const text = await res.text();
    let json: T | null = null;
    try { json = text ? (JSON.parse(text) as T) : null; } catch { /* keep raw */ }
    return { ok: res.ok, status: res.status, json, text };
  }

  async function must<T>(path: string, init: RequestInit & { query?: Record<string, string | number | undefined> } = {}): Promise<T> {
    const r = await call<T>(path, init);
    if (!r.ok) throw new Error(describeMcError(r.status, r.json, r.text));
    return (r.json ?? ({} as T)) as T;
  }

  return { dc, call, must };
}

export const NOT_CONNECTED_MESSAGE = "Mailchimp is not connected. Ask an admin to set the MAILCHIMP_API_KEY secret.";

export function mailchimpFromEnv(): McClient {
  const apiKey = Deno.env.get("MAILCHIMP_API_KEY");
  if (!apiKey) throw new Error(NOT_CONNECTED_MESSAGE);
  return createMailchimpClient({ apiKey });
}

/** Mailchimp only schedules on :00 / :15 / :30 / :45 UTC. Rounds UP to the next slot. */
export function roundUpToQuarterHour(iso: string | Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid schedule time");
  d.setUTCSeconds(0, 0);
  const rem = d.getUTCMinutes() % 15;
  if (rem !== 0) d.setUTCMinutes(d.getUTCMinutes() + (15 - rem));
  return d.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

/** Converts the editor's {{tokens}} to Mailchimp merge tags. Unknown tokens are blanked. */
export function toMailchimpMergeTags(html: string): string {
  const map: Record<string, string> = {
    first_name: "*|FNAME|*",
    last_name: "*|LNAME|*",
    email: "*|EMAIL|*",
  };
  return String(html || "").replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_m, key: string) => map[key] ?? "");
}

export interface McReport {
  emails_sent?: number;
  abuse_reports?: number;
  unsubscribed?: number;
  send_time?: string;
  bounces?: { hard_bounces?: number; soft_bounces?: number; syntax_errors?: number };
  opens?: { opens_total?: number; unique_opens?: number };
  clicks?: { clicks_total?: number; unique_clicks?: number; unique_subscriber_clicks?: number };
  delivery_status?: { enabled?: boolean; status?: string; emails_sent?: number };
}

/** Maps a Mailchimp campaign report onto the comms_email_campaigns counters. */
export function reportToCounters(r: McReport) {
  const sent = Number(r.emails_sent || 0);
  const hard = Number(r.bounces?.hard_bounces || 0);
  const soft = Number(r.bounces?.soft_bounces || 0);
  const syntax = Number(r.bounces?.syntax_errors || 0);
  const bounces = hard + soft + syntax;
  return {
    sent_count: sent,
    processed_count: sent,
    delivered_count: Math.max(0, sent - bounces),
    open_count: Number(r.opens?.unique_opens || 0),
    click_count: Number(r.clicks?.unique_subscriber_clicks ?? r.clicks?.unique_clicks ?? 0),
    bounce_count: bounces,
    dropped_count: syntax,
    unsubscribe_count: Number(r.unsubscribed || 0),
    spam_count: Number(r.abuse_reports || 0),
  };
}

/** Deterministic id so re-syncing the same activity never duplicates an event row. */
export function activityEventId(campaignId: string, email: string, action: string, timestamp: string, url?: string | null): string {
  const t = new Date(timestamp);
  const ts = Number.isNaN(t.getTime()) ? String(timestamp) : String(Math.floor(t.getTime() / 1000));
  const key = `mc:${campaignId}:${email.toLowerCase()}:${action}:${ts}${url ? `:${url}` : ""}`;
  return key.length > 480 ? key.slice(0, 480) : key;
}

export interface McActivity { action: string; type?: string; timestamp: string; url?: string; ip?: string }
export interface McEmailActivity { email_address: string; activity?: McActivity[] }

/** Turns Mailchimp email-activity rows into comms_email_events rows. */
export function activityToEventRows(campaignId: string, sendTime: string | null, emails: McEmailActivity[]) {
  const rows: Array<Record<string, unknown>> = [];
  for (const e of emails || []) {
    const email = String(e.email_address || "").toLowerCase();
    if (!email) continue;
    let bounced = false;
    for (const a of e.activity || []) {
      const action = String(a.action || "").toLowerCase();
      if (action === "bounce") bounced = true;
      const type = action === "open" ? "open" : action === "click" ? "click" : action === "bounce" ? "bounce" : null;
      if (!type) continue;
      rows.push({
        campaign_id: campaignId,
        recipient_email: email,
        event_type: type,
        url: type === "click" ? a.url || null : null,
        reason: type === "bounce" ? a.type || null : null,
        event_key: activityEventId(campaignId, email, type, a.timestamp, type === "click" ? a.url : null),
        event_timestamp: new Date(a.timestamp).toISOString(),
        raw: { source: "mailchimp", ...a },
      });
    }
    if (!bounced && sendTime) {
      rows.push({
        campaign_id: campaignId,
        recipient_email: email,
        event_type: "delivered",
        url: null,
        reason: null,
        event_key: activityEventId(campaignId, email, "delivered", sendTime),
        event_timestamp: new Date(sendTime).toISOString(),
        raw: { source: "mailchimp", inferred: true },
      });
    }
  }
  return rows;
}

/** Local status for a Mailchimp campaign status. */
export function mapMcStatus(mcStatus: string | undefined, fallback: string): string {
  switch (String(mcStatus || "").toLowerCase()) {
    case "sent": return "sent";
    case "sending": return "sending";
    case "schedule": return "scheduled";
    case "paused": return "paused";
    case "canceled":
    case "canceling": return "cancelled";
    default: return fallback;
  }
}

/**
 * Pulls the report + per-recipient activity for one campaign into the local tables.
 * Used by mailchimp-api (dashboard / analytics) and by the webhook on "campaign" events.
 */
// deno-lint-ignore no-explicit-any
export async function syncCampaignReport(db: any, mc: McClient, campaignRow: any): Promise<{ synced: boolean; status: string; reason?: string }> {
  const mcId = campaignRow?.mailchimp_campaign_id as string | null;
  if (!mcId) return { synced: false, status: campaignRow?.status, reason: "no mailchimp campaign id" };

  const camp = await mc.call<{ status?: string; send_time?: string; emails_sent?: number }>(`/campaigns/${mcId}`, {
    query: { fields: "status,send_time,emails_sent" },
  });
  if (camp.status === 404) {
    await db.from("comms_email_campaigns").update({ last_error: "Campaign no longer exists in Mailchimp", mailchimp_report_synced_at: new Date().toISOString() }).eq("id", campaignRow.id);
    return { synced: false, status: campaignRow.status, reason: "missing in mailchimp" };
  }
  if (!camp.ok) throw new Error(describeMcError(camp.status, camp.json, camp.text));

  const localStatus = mapMcStatus(camp.json?.status, campaignRow.status);
  const patch: Record<string, unknown> = { status: localStatus, mailchimp_report_synced_at: new Date().toISOString(), last_error: null };

  const rep = await mc.call<McReport>(`/reports/${mcId}`);
  if (rep.ok && rep.json) {
    Object.assign(patch, reportToCounters(rep.json));
    const sendTime = rep.json.send_time || camp.json?.send_time || null;

    // Per-recipient activity (paged). `since` narrows to new activity after the last sync,
    // minus a safety margin; ids are deterministic so overlaps are harmless.
    let since: string | undefined;
    if (campaignRow.mailchimp_report_synced_at) {
      since = new Date(new Date(campaignRow.mailchimp_report_synced_at).getTime() - 6 * 3600_000).toISOString();
    }
    let offset = 0;
    const pageSize = 1000;
    for (let page = 0; page < 50; page++) {
      const act = await mc.call<{ emails?: McEmailActivity[]; total_items?: number }>(`/reports/${mcId}/email-activity`, {
        query: { count: pageSize, offset, since, fields: "emails.email_address,emails.activity,total_items" },
      });
      if (!act.ok) break;
      const emails = act.json?.emails || [];
      const rows = activityToEventRows(campaignRow.id, sendTime, emails);
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db
          .from("comms_email_events")
          .upsert(rows.slice(i, i + 500), { onConflict: "event_key", ignoreDuplicates: true });
        if (error) console.error("mailchimp event upsert error:", error.message);
      }
      offset += emails.length;
      if (emails.length < pageSize || offset >= Number(act.json?.total_items || 0)) break;
    }
  }

  await db.from("comms_email_campaigns").update(patch).eq("id", campaignRow.id);
  return { synced: true, status: localStatus };
}
