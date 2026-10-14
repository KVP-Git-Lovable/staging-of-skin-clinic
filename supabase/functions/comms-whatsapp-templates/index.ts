import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, requireStaffId, twilioCreds } from "../_shared/comms-auth.ts";

const TABLE = "comms_whatsapp_templates";
const CONTENT_API = "https://content.twilio.com/v1";
const CATEGORIES = ["UTILITY", "MARKETING", "AUTHENTICATION"];
const CONTENT_TYPES = ["text", "media", "call_to_action"];

type Json = Record<string, unknown>;
type CtaAction = { type: "URL" | "PHONE_NUMBER"; title: string; url?: string; phone?: string };
type Approval = { status?: string; rejection_reason?: string; category?: string; name?: string };

const creds = twilioCreds();

async function twilio(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: Json }> {
  const res = await fetch(path.startsWith("http") ? path : `${CONTENT_API}${path}`, {
    ...init,
    headers: { Authorization: creds!.auth, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as Json;
  return { ok: res.ok, status: res.status, data };
}

// Twilio reports many approval states; the table only tracks four.
function normalizeStatus(twilioStatus: string | undefined): "draft" | "submitted" | "approved" | "rejected" {
  switch ((twilioStatus ?? "").toLowerCase()) {
    case "approved":
      return "approved";
    case "rejected":
    case "paused":
    case "disabled":
      return "rejected";
    case "pending":
    case "received":
      return "submitted";
    default:
      return "draft";
  }
}

async function fetchApproval(sid: string): Promise<Approval | null> {
  const res = await twilio(`/Content/${sid}/ApprovalRequests`);
  if (!res.ok) return null;
  return ((res.data.whatsapp as Approval | undefined) ?? {}) as Approval;
}

// Meta rejects media URLs that contain a double slash in the path.
function sanitizeUrl(raw: string): string {
  const u = new URL(raw);
  u.pathname = u.pathname.replace(/\/{2,}/g, "/");
  return u.toString();
}

function placeholders(body: string): string[] {
  return Array.from(new Set(Array.from(body.matchAll(/\{\{(\d+)\}\}/g)).map((m) => m[1])));
}

function buildTypes(contentType: string, body: string, mediaUrl: string | null, cta: CtaAction[]) {
  if (contentType === "media") return { "twilio/media": { body, media: [sanitizeUrl(mediaUrl!)] } };
  if (contentType === "call_to_action") {
    const actions = cta.map((a) =>
      a.type === "URL"
        ? { type: "URL", title: a.title, url: sanitizeUrl(a.url!) }
        : { type: "PHONE_NUMBER", title: a.title, phone: a.phone }
    );
    return { "twilio/call-to-action": { body, actions } };
  }
  return { "twilio/text": { body } };
}

function validateCreate(b: Json): string | null {
  const name = String(b.name ?? "");
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(name)) return "Name must be lowercase letters, digits and underscores, starting with a letter";
  if (!CATEGORIES.includes(String(b.category))) return "Invalid category";
  if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(String(b.language ?? ""))) return "Invalid language";
  if (!CONTENT_TYPES.includes(String(b.content_type))) return "Invalid content type";
  const body = String(b.body ?? "").trim();
  if (!body) return "Message body is required";
  if (body.length > 1024) return "Message body must be 1024 characters or fewer";

  const vars = placeholders(body);
  const samples = (b.variable_samples ?? {}) as Record<string, string>;
  const sorted = [...vars].map(Number).sort((a, c) => a - c);
  if (sorted.some((n, i) => n !== i + 1)) return "Variables must be numbered {{1}}, {{2}}, … without gaps";
  for (const v of vars) if (!String(samples[v] ?? "").trim()) return `A sample value is required for variable ${v}`;

  if (b.content_type === "media") {
    try {
      const u = new URL(String(b.media_url ?? ""));
      if (u.protocol !== "https:") return "Media URL must use https";
    } catch {
      return "A valid media URL is required";
    }
  }
  if (b.content_type === "call_to_action") {
    const cta = b.cta_actions as CtaAction[] | undefined;
    if (!Array.isArray(cta) || cta.length < 1 || cta.length > 2) return "Add one or two buttons";
    for (const a of cta) {
      if (!a.title || a.title.length > 25) return "Button titles are required and limited to 25 characters";
      if (a.type === "URL") {
        try {
          if (new URL(a.url ?? "").protocol !== "https:") return "Button URLs must use https";
        } catch {
          return "Each URL button needs a valid https URL";
        }
      } else if (a.type === "PHONE_NUMBER") {
        if (!/^\+[1-9]\d{6,14}$/.test(a.phone ?? "")) return "Phone buttons need an E.164 number such as +919876543210";
      } else return "Invalid button type";
    }
  }
  return null;
}

async function listAllContents(): Promise<Json[]> {
  const out: Json[] = [];
  let next: string | null = `${CONTENT_API}/Content?PageSize=100`;
  for (let page = 0; next && page < 10; page++) {
    const res = await twilio(next);
    if (!res.ok) throw new Error(String(res.data.message ?? `Twilio error ${res.status}`));
    out.push(...((res.data.contents as Json[] | undefined) ?? []));
    next = ((res.data.meta as Json | undefined)?.next_page_url as string | null | undefined) ?? null;
  }
  return out;
}

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireStaffId(req);
  if (auth instanceof Response) return auth;
  if (!creds) return json({ error: "twilio_not_configured" }, 503);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = ((await req.json().catch(() => ({}))) ?? {}) as Json;
  const action = String(body.action ?? "create");

  try {
    if (action === "import-from-twilio") {
      const contents = await listAllContents();
      const { data: existing } = await admin.from(TABLE).select("twilio_content_sid").not("twilio_content_sid", "is", null);
      const known = new Set((existing ?? []).map((r) => r.twilio_content_sid as string));
      const fresh = contents.filter((c) => !known.has(c.sid as string));

      let imported = 0;
      let skipped = contents.length - fresh.length;
      await inBatches(fresh, 8, async (c) => {
        const sid = c.sid as string;
        const types = (c.types ?? {}) as Record<string, Json>;
        const typeKey = ["twilio/call-to-action", "twilio/media", "twilio/text"].find((k) => k in types) ?? Object.keys(types)[0];
        const type = (types[typeKey] ?? {}) as Json;
        const approval = (await fetchApproval(sid)) ?? {};
        const category = String(approval.category ?? "").toUpperCase();
        const media = Array.isArray(type.media) ? (type.media[0] as string) : null;
        const row = {
          name: String(approval.name ?? c.friendly_name ?? sid),
          category: CATEGORIES.includes(category) ? category : "UTILITY",
          language: String(c.language ?? "en"),
          body: String(type.body ?? type.title ?? "") || JSON.stringify(types),
          content_type: typeKey === "twilio/call-to-action" ? "call_to_action" : typeKey === "twilio/media" ? "media" : typeKey === "twilio/text" ? "text" : "other",
          media_url: media,
          cta_actions: Array.isArray(type.actions) ? type.actions : null,
          variable_map: {},
          variable_samples: (c.variables ?? {}) as Json,
          status: normalizeStatus(approval.status),
          rejection_reason: approval.rejection_reason || null,
          twilio_content_sid: sid,
          twilio_synced_at: new Date().toISOString(),
          created_by: auth.staffId,
        };
        const { error } = await admin.from(TABLE).insert(row);
        if (!error) imported++;
        else if (error.code === "23505") skipped++;
        else console.error("import insert failed", sid, error.message);
      });
      return json({ imported, skipped, total: contents.length });
    }

    if (action === "bulk-sync" || action === "refresh-status") {
      let query = admin.from(TABLE).select("id, twilio_content_sid").not("twilio_content_sid", "is", null);
      if (action === "refresh-status") query = query.eq("id", String(body.template_id ?? ""));
      else query = query.in("status", ["submitted", "approved"]);
      const { data: rows, error } = await query;
      if (error) throw new Error(error.message);

      let synced = 0;
      let failed = 0;
      await inBatches(rows ?? [], 8, async (r) => {
        const approval = await fetchApproval(r.twilio_content_sid as string);
        if (!approval) {
          failed++;
          return;
        }
        const { error: upErr } = await admin
          .from(TABLE)
          .update({
            status: normalizeStatus(approval.status),
            rejection_reason: approval.rejection_reason || null,
            twilio_synced_at: new Date().toISOString(),
          })
          .eq("id", r.id);
        if (upErr) failed++;
        else synced++;
      });

      if (action === "refresh-status") {
        const { data: row } = await admin.from(TABLE).select("*").eq("id", String(body.template_id ?? "")).maybeSingle();
        return json({ template: row, synced, failed });
      }
      return json({ synced, failed });
    }

    if (action !== "create") return json({ error: "Unknown action" }, 400);

    const invalid = validateCreate(body);
    if (invalid) return json({ error: invalid }, 400);

    const contentType = String(body.content_type);
    const twilioBody = String(body.body).trim();
    const samples = (body.variable_samples ?? {}) as Record<string, string>;
    const variables = Object.fromEntries(placeholders(twilioBody).map((v) => [v, samples[v]]));

    const { data: row, error: insErr } = await admin
      .from(TABLE)
      .insert({
        name: body.name,
        category: body.category,
        language: body.language,
        body: twilioBody,
        content_type: contentType,
        media_url: contentType === "media" ? sanitizeUrl(String(body.media_url)) : null,
        cta_actions: contentType === "call_to_action" ? body.cta_actions : null,
        variable_map: body.variable_map ?? {},
        variable_samples: variables,
        status: "draft",
        created_by: auth.staffId,
      })
      .select()
      .single();
    if (insErr) {
      if (insErr.code === "23505") return json({ error: "A template with this name and language already exists" }, 409);
      throw new Error(insErr.message);
    }

    const created = await twilio("/Content", {
      method: "POST",
      body: JSON.stringify({
        friendly_name: body.name,
        language: body.language,
        variables,
        types: buildTypes(contentType, twilioBody, (body.media_url as string) ?? null, (body.cta_actions as CtaAction[]) ?? []),
      }),
    });
    if (!created.ok) {
      await admin.from(TABLE).delete().eq("id", row.id);
      return json({ error: String(created.data.message ?? "Twilio rejected the template") }, 502);
    }
    const sid = created.data.sid as string;

    const approvalRes = await twilio(`/Content/${sid}/ApprovalRequests/whatsapp`, {
      method: "POST",
      body: JSON.stringify({ name: body.name, category: String(body.category).toLowerCase() }),
    });
    const patch = approvalRes.ok
      ? { twilio_content_sid: sid, status: "submitted", twilio_synced_at: new Date().toISOString() }
      : { twilio_content_sid: sid };
    const { data: updated } = await admin.from(TABLE).update(patch).eq("id", row.id).select().single();

    return json(
      {
        template: updated ?? row,
        warning: approvalRes.ok ? null : String(approvalRes.data.message ?? "Template saved but WhatsApp approval could not be requested"),
      },
      201,
    );
  } catch (e) {
    console.error("comms-whatsapp-templates failed", e instanceof Error ? e.message : e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
