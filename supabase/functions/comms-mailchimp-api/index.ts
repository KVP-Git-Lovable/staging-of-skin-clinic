// Mailchimp Marketing API bridge for Communications Center -> Email (API-key auth only).
// One action router. Domain errors come back as HTTP 200 { error } so the UI can show Mailchimp's own
// wording; auth failures are 401/403. Connection changes, launching and campaign control need an
// admin or manager role; everything else is open to any signed-in staff member.
//
// Actions: status | disconnect | domains | domain_add | domain_verify | lists | list_create |
//          set_default_list | confirm_consent | ensure_webhook | audience_preview | prepare | test |
//          launch | control | sync_report

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, requireStaffId } from "../_shared/comms-auth.ts";
import { wrapMarketingEmail, htmlToText, loadCompanyFooter, buildCompanyAddressLine } from "../_shared/comms-email-shell.ts";
import { resolveEmailAudience, type EmailRecipient } from "../_shared/comms-email-audience.ts";
import {
  MC_BATCH_LIMIT,
  createMailchimpClient,
  dcFromKey,
  describeMcError,
  mailchimpFromStoredKey,
  roundUpToQuarterHour,
  syncCampaignReport,
  toMailchimpMergeTags,
  type McClient,
} from "../_shared/comms-mailchimp.ts";
import { decryptSecret, encryptSecret } from "../_shared/meta-crypto.ts";

const MANAGER_ROLE = /admin|manager/i;
const GATED_ACTIONS = new Set(["save_api_key", "clear_api_key", "disconnect", "domain_add", "domain_verify", "list_create", "set_default_list", "confirm_consent", "ensure_webhook", "launch", "control"]);

// deno-lint-ignore no-explicit-any
type Db = any;
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

interface McAccount {
  account_id?: string; account_name?: string; email?: string; pricing_plan_type?: string; total_subscribers?: number;
}
interface McList { id: string; web_id?: number; name: string; stats?: { member_count?: number }; date_created?: string }
interface McDomain { domain: string; verified?: boolean; authenticated?: boolean; verification_email?: string; verification_sent?: string; status?: string }
interface McCampaign { id: string; web_id?: number; status?: string; archive_url?: string; recipients?: { list_id?: string; segment_opts?: { saved_segment_id?: number } } }
interface McChecklist { is_ready?: boolean; items?: Array<{ type: string; id: number; heading: string; details: string }> }

async function loadConnection(db: Db): Promise<Row | null> {
  const { data } = await db.from("comms_mailchimp_connection").select("*").order("created_at", { ascending: true }).limit(1).maybeSingle();
  return data || null;
}

async function saveConnection(db: Db, conn: Row | null, patch: Row): Promise<Row> {
  if (conn?.id) {
    const { data, error } = await db.from("comms_mailchimp_connection").update(patch).eq("id", conn.id).select("*").single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await db.from("comms_mailchimp_connection").insert(patch).select("*").single();
  if (error) throw error;
  return data;
}

async function loadCampaign(db: Db, id: string): Promise<Row> {
  const { data, error } = await db.from("comms_email_campaigns").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Campaign not found");
  return data;
}

/** The browser never sees the webhook secret, nor the encrypted API key. */
function publicConnection(conn: Row | null): Row | null {
  if (!conn) return null;
  // loadConnection does select("*"), so anything secret has to be stripped here or it
  // rides along in the status response.
  // deno-lint-ignore no-unused-vars
  const { webhook_secret, api_key_enc, ...rest } = conn;
  return { ...rest, webhook_registered: !!conn.webhook_id };
}

function randomSecret(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Builds the campaign HTML Mailchimp will send: our shell + Mailchimp merge tags. */
async function buildMailchimpHtml(db: Db, c: Row): Promise<{ html: string; text: string }> {
  const company = await loadCompanyFooter(db);
  let html = wrapMarketingEmail({
    html: toMailchimpMergeTags(c.html || "<p>(empty)</p>"),
    previewText: c.preview_text,
    subject: c.subject,
    company,
    unsubscribeUrl: "*|UNSUB|*",
    showUnsubscribe: true,
  });
  // Mailchimp requires a physical address; fall back to the audience's address merge tag.
  if (!buildCompanyAddressLine(company)) {
    html = html.replace("</body>", '<div style="text-align:center;font-family:Arial,sans-serif;font-size:11px;color:#6b7280;padding:0 0 16px;">*|LIST:ADDRESSLINE|*</div></body>');
  }
  return { html, text: htmlToText(html) };
}

/** Creates or updates the Mailchimp campaign for a local row and pushes its content. */
async function ensureCampaign(db: Db, mc: McClient, c: Row, listId: string, segmentId?: number | null): Promise<McCampaign> {
  const settings = {
    subject_line: c.subject,
    preview_text: c.preview_text || "",
    title: `${c.name} (${String(c.id).slice(0, 8)})`,
    from_name: c.from_name,
    // Mailchimp has no separate From address: reply_to is the From/Reply-To address of the campaign.
    reply_to: String(c.from_email || "").toLowerCase(),
    auto_footer: false,
    inline_css: false,
  };
  const recipients: Record<string, unknown> = { list_id: listId };
  if (segmentId) recipients.segment_opts = { saved_segment_id: segmentId };
  const body = { type: "regular", recipients, settings, tracking: { opens: true, html_clicks: true, text_clicks: false } };

  let camp: McCampaign | null = null;
  if (c.mailchimp_campaign_id) {
    const cur = await mc.call<McCampaign>(`/campaigns/${c.mailchimp_campaign_id}`, { query: { fields: "id,web_id,status,recipients" } });
    if (cur.ok && cur.json) {
      const st = String(cur.json.status || "");
      if (st === "sent" || st === "sending") throw new Error(`This campaign is already ${st} in Mailchimp`);
      if (st === "schedule") await mc.call(`/campaigns/${c.mailchimp_campaign_id}/actions/unschedule`, { method: "POST" });
      camp = await mc.must<McCampaign>(`/campaigns/${c.mailchimp_campaign_id}`, { method: "PATCH", body: JSON.stringify({ recipients, settings }) });
    } else if (cur.status !== 404) {
      throw new Error(describeMcError(cur.status, cur.json, cur.text));
    }
  }
  if (!camp) {
    camp = await mc.must<McCampaign>(`/campaigns`, { method: "POST", body: JSON.stringify(body) });
    await db.from("comms_email_campaigns").update({ mailchimp_campaign_id: camp.id, mailchimp_web_id: camp.web_id ?? null, mailchimp_list_id: listId }).eq("id", c.id);
  }

  const { html, text } = await buildMailchimpHtml(db, c);
  await mc.must(`/campaigns/${camp.id}/content`, { method: "PUT", body: JSON.stringify({ html, plain_text: text }) });
  return camp;
}

async function readChecklist(mc: McClient, mcCampaignId: string): Promise<McChecklist> {
  const r = await mc.call<McChecklist>(`/campaigns/${mcCampaignId}/send-checklist`);
  if (!r.ok) return { is_ready: false, items: [{ type: "error", id: 0, heading: "Checklist unavailable", details: describeMcError(r.status, r.json, r.text) }] };
  return r.json || { is_ready: false, items: [] };
}

/** Upserts recipients into the audience (500 per call) and returns the accepted e-mails. */
async function subscribeRecipients(mc: McClient, listId: string, recipients: EmailRecipient[]) {
  const accepted: string[] = [];
  const rejected: Array<{ email: string; error: string }> = [];
  for (let i = 0; i < recipients.length; i += MC_BATCH_LIMIT) {
    const chunk = recipients.slice(i, i + MC_BATCH_LIMIT);
    const res = await mc.must<{ new_members?: Array<{ email_address: string }>; updated_members?: Array<{ email_address: string }>; errors?: Array<{ email_address: string; error: string }> }>(
      `/lists/${listId}`,
      {
        method: "POST",
        body: JSON.stringify({
          update_existing: true,
          members: chunk.map((r) => ({
            email_address: r.email,
            status: "subscribed",
            merge_fields: { FNAME: r.first_name || "", LNAME: r.last_name || "" },
          })),
        }),
      },
    );
    for (const m of res.new_members || []) accepted.push(String(m.email_address).toLowerCase());
    for (const m of res.updated_members || []) accepted.push(String(m.email_address).toLowerCase());
    for (const e of res.errors || []) rejected.push({ email: String(e.email_address || ""), error: String(e.error || "") });
  }
  // Members already present and unchanged are neither "new" nor "updated"; treat every
  // non-rejected address as accepted so the segment covers them.
  const rejectedSet = new Set(rejected.map((r) => r.email.toLowerCase()));
  const all = recipients.map((r) => r.email).filter((e) => !rejectedSet.has(e));
  return { accepted: Array.from(new Set([...accepted, ...all])), rejected };
}

/** Replaces the campaign's static segment with exactly these e-mails. */
async function rebuildSegment(mc: McClient, listId: string, c: Row, emails: string[]): Promise<number> {
  if (c.mailchimp_segment_id) await mc.call(`/lists/${listId}/segments/${c.mailchimp_segment_id}`, { method: "DELETE" });
  const seg = await mc.must<{ id: number }>(`/lists/${listId}/segments`, {
    method: "POST",
    body: JSON.stringify({ name: `campaign:${String(c.id).slice(0, 8)} ${String(c.name).slice(0, 80)}`, static_segment: [] }),
  });
  for (let i = 0; i < emails.length; i += MC_BATCH_LIMIT) {
    await mc.must(`/lists/${listId}/segments/${seg.id}`, {
      method: "POST",
      body: JSON.stringify({ members_to_add: emails.slice(i, i + MC_BATCH_LIMIT) }),
    });
  }
  return seg.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let campaignIdForError: string | null = null;

  const staffAuth = await requireStaffId(req);
  if (staffAuth instanceof Response) return staffAuth;
  const staffId = staffAuth.staffId;
  const db: Db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { action, payload = {} } = await req.json();
    if (!action) return json({ error: "action is required" }, 400);

    if (GATED_ACTIONS.has(action)) {
      const { data: me } = await db.from("staff").select("user_roles_config(name)").eq("id", staffId).maybeSingle();
      const roleName = (me?.user_roles_config as { name?: string } | null)?.name ?? "";
      if (!MANAGER_ROLE.test(roleName)) return json({ error: "Only an admin or manager can do this" }, 403);
    }

    let conn = await loadConnection(db);

    /* ------------------------------------------------- the key itself
       These two run before the client is built, because when you are saving a key
       for the first time there is nothing to build one from. Both are in
       GATED_ACTIONS, so only an admin or manager reaches here. */
    if (action === "save_api_key") {
      const apiKey = String(payload.api_key ?? "").trim();
      if (!apiKey) return json({ error: "Enter your Mailchimp API key" });

      // Shape first, so an obvious typo fails before we call Mailchimp at all.
      let probe: McClient;
      try {
        dcFromKey(apiKey);
        probe = createMailchimpClient({ apiKey });
      } catch (e) {
        return json({ error: (e as Error).message });
      }

      // Then prove the key actually works. Nothing is written until it does - a key
      // that fails here must not displace one that is currently working.
      const ping = await probe.call<{ health_status?: string }>("/ping");
      if (!ping.ok) return json({ error: describeMcError(ping.status, ping.json, ping.text) });

      const acct = await probe.must<McAccount>("/", {
        query: { fields: "account_id,account_name,email,pricing_plan_type,total_subscribers" },
      });

      // A key for a different Mailchimp account must not inherit the previous
      // account's audience, webhook or consent.
      const switched = !!conn?.account_id && conn.account_id !== acct.account_id;
      conn = await saveConnection(db, conn, {
        api_key_enc: await encryptSecret(apiKey),
        api_key_last4: apiKey.slice(-4),
        dc: probe.dc,
        account_id: acct.account_id ?? null,
        account_name: acct.account_name ?? null,
        login_email: acct.email ?? null,
        pricing_plan_type: acct.pricing_plan_type ?? null,
        total_subscribers: acct.total_subscribers ?? null,
        status: "connected",
        last_error: null,
        last_ping_at: new Date().toISOString(),
        ...(switched
          ? {
            default_list_id: null,
            default_list_name: null,
            webhook_id: null,
            webhook_secret: null,
            consent_confirmed_at: null,
            consent_confirmed_by: null,
          }
          : {}),
      });
      return json({ ok: true, switched, connection: publicConnection(conn) });
    }

    if (action === "clear_api_key") {
      if (conn?.id) {
        conn = await saveConnection(db, conn, {
          api_key_enc: null,
          api_key_last4: null,
          account_id: null,
          account_name: null,
          login_email: null,
          pricing_plan_type: null,
          total_subscribers: null,
          default_list_id: null,
          default_list_name: null,
          webhook_id: null,
          webhook_secret: null,
          consent_confirmed_at: null,
          consent_confirmed_by: null,
          status: "revoked",
          last_error: null,
        });
      }
      return json({ ok: true, connection: publicConnection(conn) });
    }

    const apiKeyAvailable = !!conn?.api_key_enc;
    let mc: McClient;
    try {
      mc = await mailchimpFromStoredKey(conn, decryptSecret);
    } catch (e) {
      if (action === "status") return json({ ok: false, error: (e as Error).message, connection: publicConnection(conn), api_key_available: apiKeyAvailable });
      return json({ error: (e as Error).message });
    }
    const currentAccountId: string | null = conn?.account_id || null;
    // Campaigns created under a previously connected Mailchimp account are read-only here.
    const otherAccount = (c: Row) => !!c.mailchimp_account_id && !!currentAccountId && c.mailchimp_account_id !== currentAccountId;

    switch (action) {
      /* ------------------------------------------------------------------ status */
      case "status": {
        const ping = await mc.call<{ health_status?: string }>(`/ping`);
        if (!ping.ok) {
          const msg = describeMcError(ping.status, ping.json, ping.text);
          conn = await saveConnection(db, conn, { dc: mc.dc, last_error: msg, last_ping_at: new Date().toISOString(), status: "revoked" });
          return json({ ok: false, error: msg, connection: publicConnection(conn), api_key_available: apiKeyAvailable });
        }
        const acct = await mc.must<McAccount>(`/`, { query: { fields: "account_id,account_name,email,pricing_plan_type,total_subscribers" } });
        conn = await saveConnection(db, conn, {
          dc: mc.dc,
          account_id: acct.account_id || null,
          account_name: acct.account_name || null,
          login_email: acct.email || null,
          pricing_plan_type: acct.pricing_plan_type || null,
          total_subscribers: acct.total_subscribers ?? null,
          last_ping_at: new Date().toISOString(),
          last_error: null,
          status: "connected",
        });
        return json({ ok: true, health: ping.json?.health_status || "ok", connection: publicConnection(conn), api_key_available: apiKeyAvailable });
      }

      /* -------------------------------------------------------------- disconnect */
      // The API key is a secret, so "disconnect" only forgets the saved audience, webhook and consent;
      // remove the secret itself to cut the connection completely.
      case "disconnect": {
        if (!conn) return json({ error: "Nothing to disconnect" });
        if (conn.webhook_id && conn.default_list_id) {
          await mc.call(`/lists/${conn.default_list_id}/webhooks/${conn.webhook_id}`, { method: "DELETE" }); // best effort
        }
        conn = await saveConnection(db, conn, {
          account_id: null,
          account_name: null,
          login_email: null,
          pricing_plan_type: null,
          total_subscribers: null,
          default_list_id: null,
          default_list_name: null,
          webhook_id: null,
          webhook_secret: null,
          consent_confirmed_at: null,
          consent_confirmed_by: null,
          last_error: null,
        });
        return json({ ok: true, connection: publicConnection(conn), api_key_available: apiKeyAvailable });
      }

      /* ----------------------------------------------------------------- domains */
      case "domains": {
        const r = await mc.must<{ domains?: McDomain[] }>(`/verified-domains`);
        return json({ domains: r.domains || [] });
      }
      case "domain_add": {
        const email = String(payload.verification_email || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter an e-mail address at the domain you want to verify" });
        const r = await mc.call<McDomain>(`/verified-domains`, { method: "POST", body: JSON.stringify({ verification_email: email }) });
        if (!r.ok) return json({ error: describeMcError(r.status, r.json, r.text) });
        return json({ domain: r.json });
      }
      case "domain_verify": {
        const domain = String(payload.domain || "").trim().toLowerCase();
        const code = String(payload.code || "").trim();
        if (!domain || !code) return json({ error: "Domain and verification code are required" });
        const r = await mc.call<McDomain>(`/verified-domains/${encodeURIComponent(domain)}/actions/verify`, { method: "POST", body: JSON.stringify({ code }) });
        if (!r.ok) return json({ error: describeMcError(r.status, r.json, r.text) });
        return json({ domain: r.json });
      }

      /* ------------------------------------------------------------------- lists */
      case "lists": {
        const r = await mc.must<{ lists?: McList[]; total_items?: number; constraints?: { may_create?: boolean; max_instances?: number; current_total_instances?: number } }>(`/lists`, {
          query: { count: 100, fields: "lists.id,lists.web_id,lists.name,lists.stats.member_count,lists.date_created,total_items,constraints" },
        });
        return json({ lists: r.lists || [], constraints: r.constraints || null, default_list_id: conn?.default_list_id || null });
      }
      case "list_create": {
        const company = await loadCompanyFooter(db);
        const fromEmail = String(payload.from_email || "").trim().toLowerCase();
        const fromName = String(payload.from_name || company?.name || "").trim();
        const name = String(payload.name || company?.name || "Patients").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) return json({ error: "A default From e-mail on a verified domain is required to create an audience" });
        if (!company?.address) return json({ error: "The clinic address is missing. Fill it in under Settings first (Mailchimp requires a postal address on every audience)." });
        const r = await mc.call<McList>(`/lists`, {
          method: "POST",
          body: JSON.stringify({
            name,
            contact: {
              company: company.name || name,
              address1: company.address,
              city: company.city || "",
              state: company.state || "",
              zip: company.postal_code || "",
              country: company.country || "IN",
            },
            permission_reminder: `You are receiving this e-mail because you are a patient or contact of ${company.name || name}.`,
            campaign_defaults: { from_name: fromName || name, from_email: fromEmail, subject: "", language: "en" },
            email_type_option: false,
            double_optin: false,
          }),
        });
        if (!r.ok) return json({ error: describeMcError(r.status, r.json, r.text) });
        conn = await saveConnection(db, conn, { default_list_id: r.json!.id, default_list_name: r.json!.name });
        return json({ list: r.json, connection: publicConnection(conn) });
      }
      case "set_default_list": {
        const listId = String(payload.list_id || "");
        if (!listId) return json({ error: "list_id is required" });
        const r = await mc.must<McList>(`/lists/${listId}`, { query: { fields: "id,name" } });
        conn = await saveConnection(db, conn, { default_list_id: r.id, default_list_name: r.name });
        return json({ connection: publicConnection(conn) });
      }
      case "confirm_consent": {
        conn = await saveConnection(db, conn, { consent_confirmed_at: new Date().toISOString(), consent_confirmed_by: staffId });
        return json({ connection: publicConnection(conn) });
      }

      /* ----------------------------------------------------------------- webhook */
      case "ensure_webhook": {
        if (!conn?.default_list_id) return json({ error: "Choose a default audience first" });
        const secret = conn.webhook_secret || randomSecret();
        const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/comms-mailchimp-webhook?key=${secret}`;
        if (conn.webhook_id) {
          const cur = await mc.call<{ id: string; url: string }>(`/lists/${conn.default_list_id}/webhooks/${conn.webhook_id}`);
          if (cur.ok && cur.json?.url === url) return json({ webhook: cur.json, connection: publicConnection(conn), existing: true });
        }
        const r = await mc.call<{ id: string; url: string }>(`/lists/${conn.default_list_id}/webhooks`, {
          method: "POST",
          body: JSON.stringify({
            url,
            events: { subscribe: false, unsubscribe: true, profile: false, cleaned: true, upemail: false, campaign: true },
            sources: { user: true, admin: true, api: true },
          }),
        });
        if (!r.ok) return json({ error: describeMcError(r.status, r.json, r.text) });
        conn = await saveConnection(db, conn, { webhook_id: r.json!.id, webhook_secret: secret });
        return json({ webhook: r.json, connection: publicConnection(conn) });
      }

      /* ---------------------------------------------------------------- audience */
      case "audience_preview": {
        const a = await resolveEmailAudience(db, payload.audience_config);
        return json({ total: a.total, matched: a.matched, without_email: a.withoutEmail, suppressed: a.suppressed, per_segment: a.perSegment });
      }

      /* ---------------------------------------------------------------- campaign */
      case "prepare": {
        campaignIdForError = String(payload.campaign_id || "");
        const c = await loadCampaign(db, campaignIdForError);
        const listId = c.mailchimp_list_id || conn?.default_list_id;
        if (!listId) return json({ error: "Choose a default Mailchimp audience under Connections first" });
        const camp = await ensureCampaign(db, mc, c, listId, c.mailchimp_segment_id || null);
        const checklist = await readChecklist(mc, camp.id);
        return json({ mailchimp_campaign_id: camp.id, web_id: camp.web_id, checklist });
      }

      case "test": {
        campaignIdForError = String(payload.campaign_id || "");
        const c = await loadCampaign(db, campaignIdForError);
        const list = Array.from(new Set(((payload.recipients || []) as unknown[]).map((r) => String(r).trim().toLowerCase()).filter(Boolean)));
        if (!list.length) return json({ error: "No recipients supplied" });
        if (list.length > 10) return json({ error: "Test send limited to 10 recipients" });
        const listId = c.mailchimp_list_id || conn?.default_list_id;
        if (!listId) return json({ error: "Choose a default Mailchimp audience under Connections first" });
        const camp = await ensureCampaign(db, mc, c, listId, c.mailchimp_segment_id || null);
        const r = await mc.call(`/campaigns/${camp.id}/actions/test`, { method: "POST", body: JSON.stringify({ test_emails: list, send_type: "html" }) });
        const ok = r.ok;
        await db.from("comms_email_test_sends").insert({
          campaign_id: c.id,
          recipients: list,
          sent_by: staffId,
          status: ok ? "sent" : "failed",
          error_message: ok ? null : describeMcError(r.status, r.json, r.text),
        });
        if (!ok) return json({ error: describeMcError(r.status, r.json, r.text) });
        return json({ success: true, recipients: list.length });
      }

      case "launch": {
        campaignIdForError = String(payload.campaign_id || "");
        const c = await loadCampaign(db, campaignIdForError);
        if (otherAccount(c)) return json({ error: "This campaign belongs to a different Mailchimp account than the one connected now. Duplicate it to send from the current account." });
        if (c.status !== "draft" && c.status !== "failed" && c.status !== "paused") return json({ error: `Campaign is already ${c.status}` });
        const listId = c.mailchimp_list_id || conn?.default_list_id;
        if (!listId) return json({ error: "Choose a default Mailchimp audience under Connections first" });
        if (!conn?.consent_confirmed_at) return json({ error: "Confirm under Connections that these contacts agreed to receive marketing e-mail before the first Mailchimp send" });

        const sendNow = !!payload.send_now;
        let scheduleTime: string | null = null;
        if (!sendNow) {
          if (!payload.scheduled_at) return json({ error: "Provide send_now=true or scheduled_at" });
          scheduleTime = roundUpToQuarterHour(String(payload.scheduled_at));
          if (new Date(scheduleTime).getTime() < Date.now() + 60_000) return json({ error: "Scheduled time must be in the future (Mailchimp sends on the quarter hour)" });
        }

        // 1. Audience → recipients (Patients saved views, combinator, valid email, suppressions)
        const audience = await resolveEmailAudience(db, c.audience_config);
        const recipients = audience.recipients;
        if (!recipients.length) return json({ error: "Audience resolved to 0 sendable recipients (patients need an email address and must not be unsubscribed)" });
        const recipientRows = recipients.map((r) => ({
          campaign_id: c.id,
          email: r.email,
          patient_id: r.patient_id,
          merge_vars: { first_name: r.first_name || "", last_name: r.last_name || "" },
        }));
        for (let i = 0; i < recipientRows.length; i += 1000) {
          const { error } = await db.from("comms_email_recipients").upsert(recipientRows.slice(i, i + 1000), { onConflict: "campaign_id,email", ignoreDuplicates: true });
          if (error) throw error;
        }

        // 2. Audience members + static segment for this campaign
        const { accepted, rejected } = await subscribeRecipients(mc, listId, recipients);
        if (!accepted.length) return json({ error: `Mailchimp accepted none of the ${recipients.length} contacts. First error: ${rejected[0]?.error || "unknown"}` });
        const segmentId = await rebuildSegment(mc, listId, c, accepted);
        await db.from("comms_email_campaigns").update({ mailchimp_segment_id: segmentId, mailchimp_list_id: listId }).eq("id", c.id);

        // 3. Campaign + content, then Mailchimp's own checklist
        const camp = await ensureCampaign(db, mc, { ...c, mailchimp_list_id: listId }, listId, segmentId);
        const checklist = await readChecklist(mc, camp.id);
        const blocking = (checklist.items || []).filter((i) => i.type === "error");
        if (blocking.length) {
          const msg = `Mailchimp checklist: ${blocking.map((i) => `${i.heading} — ${i.details}`).join(" | ")}`;
          await db.from("comms_email_campaigns").update({ status: "failed", last_error: msg }).eq("id", c.id);
          return json({ error: msg, checklist });
        }

        // 4. Send or schedule
        if (sendNow) {
          const r = await mc.call(`/campaigns/${camp.id}/actions/send`, { method: "POST" });
          if (!r.ok) throw new Error(describeMcError(r.status, r.json, r.text));
        } else {
          const r = await mc.call(`/campaigns/${camp.id}/actions/schedule`, { method: "POST", body: JSON.stringify({ schedule_time: scheduleTime }) });
          if (!r.ok) throw new Error(describeMcError(r.status, r.json, r.text));
        }
        await db.from("comms_email_campaigns").update({
          status: sendNow ? "sending" : "scheduled",
          scheduled_at: sendNow ? new Date().toISOString() : new Date(scheduleTime!).toISOString(),
          audience_snapshot_count: accepted.length,
          mailchimp_account_id: currentAccountId,
          last_error: null,
        }).eq("id", c.id);

        return json({
          success: true,
          audience_count: accepted.length,
          rejected_count: rejected.length,
          rejected: rejected.slice(0, 20),
          effective_schedule_time: scheduleTime,
          mailchimp_campaign_id: camp.id,
          web_id: camp.web_id,
          checklist_warnings: (checklist.items || []).filter((i) => i.type === "warning"),
        });
      }

      case "control": {
        campaignIdForError = String(payload.campaign_id || "");
        const op = String(payload.action || "");
        const c = await loadCampaign(db, campaignIdForError);
        if (otherAccount(c) && op !== "delete") return json({ error: "This campaign belongs to a different Mailchimp account than the one connected now." });
        const mcId = otherAccount(c) ? null : (c.mailchimp_campaign_id as string | null);
        if (op === "pause") {
          if (mcId) {
            const r = await mc.call(`/campaigns/${mcId}/actions/unschedule`, { method: "POST" });
            if (!r.ok && r.status !== 404) return json({ error: describeMcError(r.status, r.json, r.text) });
          }
          await db.from("comms_email_campaigns").update({ status: "paused" }).eq("id", c.id);
        } else if (op === "resume") {
          if (!mcId) return json({ error: "This campaign was never launched; open it and launch again" });
          const when = payload.scheduled_at || c.scheduled_at;
          if (when && new Date(when).getTime() > Date.now() + 60_000) {
            const st = roundUpToQuarterHour(String(when));
            const r = await mc.call(`/campaigns/${mcId}/actions/schedule`, { method: "POST", body: JSON.stringify({ schedule_time: st }) });
            if (!r.ok) return json({ error: describeMcError(r.status, r.json, r.text) });
            await db.from("comms_email_campaigns").update({ status: "scheduled", scheduled_at: new Date(st).toISOString() }).eq("id", c.id);
          } else {
            const r = await mc.call(`/campaigns/${mcId}/actions/send`, { method: "POST" });
            if (!r.ok) return json({ error: describeMcError(r.status, r.json, r.text) });
            await db.from("comms_email_campaigns").update({ status: "sending", scheduled_at: new Date().toISOString() }).eq("id", c.id);
          }
        } else if (op === "cancel") {
          if (mcId) {
            const cur = await mc.call<McCampaign>(`/campaigns/${mcId}`, { query: { fields: "status" } });
            const st = cur.json?.status;
            const path = st === "sending" ? "cancel-send" : "unschedule";
            const r = await mc.call(`/campaigns/${mcId}/actions/${path}`, { method: "POST" });
            if (!r.ok && r.status !== 404) return json({ error: describeMcError(r.status, r.json, r.text) });
          }
          await db.from("comms_email_campaigns").update({ status: "cancelled" }).eq("id", c.id);
        } else if (op === "delete") {
          if (mcId) {
            const r = await mc.call(`/campaigns/${mcId}`, { method: "DELETE" });
            if (!r.ok && r.status !== 404) return json({ error: describeMcError(r.status, r.json, r.text) });
          }
          if (c.mailchimp_segment_id && c.mailchimp_list_id) await mc.call(`/lists/${c.mailchimp_list_id}/segments/${c.mailchimp_segment_id}`, { method: "DELETE" });
          await db.from("comms_email_campaigns").delete().eq("id", c.id);
        } else {
          return json({ error: `Unknown control action: ${op}` });
        }
        return json({ success: true });
      }

      case "sync_report": {
        const force = !!payload.force;
        let rows: Row[] = [];
        if (payload.campaign_id) {
          rows = [await loadCampaign(db, String(payload.campaign_id))];
        } else {
          const since = new Date(Date.now() - 7 * 86400_000).toISOString();
          const { data } = await db
            .from("comms_email_campaigns")
            .select("*")
            .not("mailchimp_campaign_id", "is", null)
            .or(`status.in.(sending,scheduled),and(status.eq.sent,scheduled_at.gte.${since})`)
            .limit(25);
          rows = data || [];
        }
        const results: Row[] = [];
        for (const c of rows) {
          if (!c.mailchimp_campaign_id) continue;
          if (otherAccount(c)) { results.push({ id: c.id, skipped: true, reason: "other Mailchimp account" }); continue; }
          const last = c.mailchimp_report_synced_at ? new Date(c.mailchimp_report_synced_at).getTime() : 0;
          if (!force && Date.now() - last < 10 * 60_000) { results.push({ id: c.id, skipped: true }); continue; }
          try {
            results.push({ id: c.id, ...(await syncCampaignReport(db, mc, c)) });
          } catch (e) {
            results.push({ id: c.id, error: (e as Error).message });
          }
        }
        return json({ results });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    const msg = (err as Error).message || String(err);
    if (campaignIdForError) {
      try { await db.from("comms_email_campaigns").update({ status: "failed", last_error: msg }).eq("id", campaignIdForError); } catch { /* ignore */ }
    }
    return json({ error: msg }, 500);
  }
});
