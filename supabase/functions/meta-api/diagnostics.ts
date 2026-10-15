// Read-only Meta Marketing API diagnostics + optional lifecycle (CRUD) tests.
// Reuses the existing connection/token supplied by index.ts — no new auth here.

import { GRAPH_BASE } from "../_shared/meta-graph.ts";

export type TestResult = {
  category: string;
  name: string;
  status: "success" | "failed";
  http_method: string;
  endpoint: string;
  http_status: number | null;
  duration_ms: number;
  records_returned: number | null;
  meta_error_code: string | null;
  meta_error_subcode: string | null;
  meta_error_message: string | null;
  fbtrace_id: string | null;
  fields: string | null;
  sample: unknown;
};

type Ctx = { token: string; adAccount: string };

function truncate(value: unknown) {
  const text = JSON.stringify(value ?? null);
  if (!text) return null;
  return text.length > 4000 ? `${text.slice(0, 4000)}…` : JSON.parse(text.length > 4000 ? "null" : text);
}

async function rawGraph(
  ctx: Ctx,
  opts: { category: string; name: string; path: string; params?: Record<string, string>; method?: string },
): Promise<TestResult> {
  const url = new URL(`${GRAPH_BASE}${opts.path}`);
  for (const [k, v] of Object.entries(opts.params || {})) url.searchParams.set(k, v);
  url.searchParams.set("access_token", ctx.token);

  const started = Date.now();
  let httpStatus: number | null = null;
  let body: any = null;
  try {
    const res = await fetch(url.toString(), { method: opts.method || "GET" });
    httpStatus = res.status;
    const text = await res.text();
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
  } catch (e) {
    return {
      category: opts.category,
      name: opts.name,
      status: "failed",
      http_method: opts.method || "GET",
      endpoint: opts.path,
      http_status: null,
      duration_ms: Date.now() - started,
      records_returned: null,
      meta_error_code: null,
      meta_error_subcode: null,
      meta_error_message: (e as Error).message,
      fbtrace_id: null,
      fields: opts.params?.fields || null,
      sample: null,
    };
  }
  const duration = Date.now() - started;
  const err = body?.error;
  const ok = httpStatus !== null && httpStatus < 400 && !err;
  const rows = Array.isArray(body?.data) ? body.data.length : ok ? 1 : null;

  return {
    category: opts.category,
    name: opts.name,
    status: ok ? "success" : "failed",
    http_method: opts.method || "GET",
    endpoint: opts.path,
    http_status: httpStatus,
    duration_ms: duration,
    records_returned: rows,
    meta_error_code: err?.code != null ? String(err.code) : null,
    meta_error_subcode: err?.error_subcode != null ? String(err.error_subcode) : null,
    meta_error_message: err ? (err.error_user_msg || err.message || "Meta API error") : null,
    fbtrace_id: err?.fbtrace_id || body?.fbtrace_id || null,
    fields: opts.params?.fields || null,
    sample: ok
      ? truncate(Array.isArray(body?.data) ? body.data.slice(0, 3) : body)
      : truncate(err || body),
  };
}

function datePreset(days: number) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return JSON.stringify({ since: fmt(start), until: fmt(end) });
}

export const DIAGNOSTIC_CATEGORIES = [
  "account",
  "campaigns",
  "adsets",
  "ads",
  "creatives",
  "insights",
] as const;

export async function runCategory(category: string, ctx: Ctx): Promise<TestResult[]> {
  const acct = ctx.adAccount;
  const results: TestResult[] = [];
  const run = async (name: string, path: string, params?: Record<string, string>) => {
    results.push(await rawGraph(ctx, { category, name, path, params }));
  };

  switch (category) {
    case "account":
      await run("Get basic Ad Account information", `/${acct}`, { fields: "id,name,account_id" });
      await run("Get currency and timezone", `/${acct}`, { fields: "currency,timezone_name,timezone_offset_hours_utc" });
      await run("Get account status", `/${acct}`, { fields: "account_status,disable_reason,is_prepay_account" });
      await run("Get spending information", `/${acct}`, { fields: "amount_spent,balance,spend_cap,min_daily_budget" });
      await run("Get business information", `/${acct}`, { fields: "business,business_name,owner,funding_source" });
      break;

    case "campaigns":
      await run("Get campaigns", `/${acct}/campaigns`, { fields: "id,name", limit: "25" });
      await run("Get campaign status", `/${acct}/campaigns`, { fields: "id,name,status,effective_status", limit: "25" });
      await run("Get campaign objective", `/${acct}/campaigns`, { fields: "id,objective,buying_type", limit: "25" });
      await run("Get campaign budgets", `/${acct}/campaigns`, { fields: "id,daily_budget,lifetime_budget,budget_remaining", limit: "25" });
      await run("Get campaign dates", `/${acct}/campaigns`, { fields: "id,created_time,start_time,stop_time,updated_time", limit: "25" });
      break;

    case "adsets":
      await run("Get Ad Sets", `/${acct}/adsets`, { fields: "id,name,status,campaign_id", limit: "25" });
      await run("Get Ad Set budgets", `/${acct}/adsets`, { fields: "id,daily_budget,lifetime_budget,budget_remaining", limit: "25" });
      await run("Get targeting", `/${acct}/adsets`, { fields: "id,targeting", limit: "10" });
      await run("Get schedule", `/${acct}/adsets`, { fields: "id,start_time,end_time,pacing_type", limit: "25" });
      await run("Get optimization/billing configuration", `/${acct}/adsets`, { fields: "id,optimization_goal,billing_event,bid_strategy,bid_amount", limit: "25" });
      break;

    case "ads":
      await run("Get Ads", `/${acct}/ads`, { fields: "id,name", limit: "25" });
      await run("Get Ad to Ad Set relationship", `/${acct}/ads`, { fields: "id,adset_id,adset{name}", limit: "25" });
      await run("Get Ad to Campaign relationship", `/${acct}/ads`, { fields: "id,campaign_id,campaign{name}", limit: "25" });
      await run("Get Ad status", `/${acct}/ads`, { fields: "id,status,effective_status,updated_time", limit: "25" });
      await run("Get Ad Creative information", `/${acct}/ads`, { fields: "id,creative{id,name}", limit: "25" });
      break;

    case "creatives":
      await run("Get creatives", `/${acct}/adcreatives`, { fields: "id,name", limit: "25" });
      await run("Get creative status", `/${acct}/adcreatives`, { fields: "id,status,account_id", limit: "25" });
      await run("Get object_story_spec", `/${acct}/adcreatives`, { fields: "id,object_story_spec", limit: "10" });
      await run("Get asset_feed_spec", `/${acct}/adcreatives`, { fields: "id,asset_feed_spec", limit: "10" });
      await run("Get thumbnail/creative information", `/${acct}/adcreatives`, { fields: "id,thumbnail_url,image_url,effective_object_story_id", limit: "10" });
      break;

    case "insights": {
      const base = { fields: "impressions,reach,clicks,spend", date_preset: "last_30d" };
      await run("Account-level insights", `/${acct}/insights`, base);
      await run("Campaign-level insights", `/${acct}/insights`, { level: "campaign", fields: "campaign_id,campaign_name,impressions,reach,clicks,spend", date_preset: "last_30d", limit: "25" });
      await run("Ad Set-level insights", `/${acct}/insights`, { level: "adset", fields: "campaign_name,adset_name,impressions,reach,clicks,spend", date_preset: "last_30d", limit: "25" });
      await run("Ad-level insights", `/${acct}/insights`, { level: "ad", fields: "campaign_name,adset_name,ad_name,impressions,reach,clicks,spend", date_preset: "last_30d", limit: "25" });
      await run("Date-range insights", `/${acct}/insights`, { fields: "impressions,reach,clicks,spend", time_range: datePreset(30), limit: "25" });
      break;
    }

    default:
      throw new Error(`Unknown diagnostic category: ${category}`);
  }

  return results;
}

/* ------------------------------ lifecycle ------------------------------ */

async function writeGraph(ctx: Ctx, path: string, body: Record<string, unknown>, method = "POST") {
  const url = new URL(`${GRAPH_BASE}${path}`);
  url.searchParams.set("access_token", ctx.token);
  const res = await fetch(url.toString(), {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "DELETE" ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok || json?.error) {
    const e = json?.error || {};
    throw new Error(`[Meta ${res.status}] ${e.message || text}`);
  }
  return json;
}

export type LifecycleStep = {
  step: string;
  status: "success" | "failed";
  external_id?: string;
  duration_ms: number;
  message?: string;
};

export async function runLifecycle(
  ctx: Ctx,
  opts: { pageId: string | null; label: string },
): Promise<{ steps: LifecycleStep[]; created: { object_type: string; external_id: string; name: string }[] }> {
  const steps: LifecycleStep[] = [];
  const created: { object_type: string; external_id: string; name: string }[] = [];
  const acct = ctx.adAccount;

  const track = async <T>(step: string, fn: () => Promise<T>): Promise<T | null> => {
    const started = Date.now();
    try {
      const out = await fn();
      steps.push({
        step,
        status: "success",
        duration_ms: Date.now() - started,
        external_id: (out as any)?.id,
      });
      return out;
    } catch (e) {
      steps.push({ step, status: "failed", duration_ms: Date.now() - started, message: (e as Error).message });
      return null;
    }
  };

  const campaignName = `Clinic API Test - ${opts.label}`;
  const campaign = await track("Create Test Campaign", () =>
    writeGraph(ctx, `/${acct}/campaigns`, {
      name: campaignName,
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      special_ad_categories: [],
    }));
  if (!campaign?.id) return { steps, created };
  created.push({ object_type: "campaign", external_id: campaign.id, name: campaignName });

  const adsetName = `Clinic API Test Ad Set - ${opts.label}`;
  const adset = await track("Create Test Ad Set", () =>
    writeGraph(ctx, `/${acct}/adsets`, {
      name: adsetName,
      campaign_id: campaign.id,
      status: "PAUSED",
      daily_budget: 10000,
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting: { geo_locations: { countries: ["IN"] } },
      start_time: new Date(Date.now() + 86400000).toISOString(),
    }));
  if (!adset?.id) return { steps, created };
  created.push({ object_type: "adset", external_id: adset.id, name: adsetName });

  if (!opts.pageId) {
    steps.push({ step: "Create Test Creative", status: "failed", duration_ms: 0, message: "No Facebook Page is configured" });
    return { steps, created };
  }

  const creativeName = `Clinic API Test Creative - ${opts.label}`;
  const creative = await track("Create Test Creative", () =>
    writeGraph(ctx, `/${acct}/adcreatives`, {
      name: creativeName,
      object_story_spec: {
        page_id: opts.pageId,
        link_data: {
          link: "https://www.facebook.com",
          message: "Clinic Marketing API integration test.",
          name: "Clinic API Test",
        },
      },
    }));
  if (!creative?.id) return { steps, created };
  created.push({ object_type: "adcreative", external_id: creative.id, name: creativeName });

  const adName = `Clinic API Test Ad - ${opts.label}`;
  const ad = await track("Create Test Ad", () =>
    writeGraph(ctx, `/${acct}/ads`, {
      name: adName,
      adset_id: adset.id,
      creative: { creative_id: creative.id },
      status: "PAUSED",
    }));
  if (!ad?.id) return { steps, created };
  created.push({ object_type: "ad", external_id: ad.id, name: adName });

  await track("Read Created Ad", async () => {
    const url = new URL(`${GRAPH_BASE}/${ad.id}`);
    url.searchParams.set("fields", "id,name,status,adset_id,campaign_id");
    url.searchParams.set("access_token", ctx.token);
    const res = await fetch(url.toString());
    const body = await res.json();
    if (!res.ok || body?.error) throw new Error(body?.error?.message || `HTTP ${res.status}`);
    return body;
  });

  await track("Pause Test Ad", () => writeGraph(ctx, `/${ad.id}`, { status: "PAUSED" }));

  return { steps, created };
}

export async function cleanupObject(ctx: Ctx, externalId: string) {
  const url = new URL(`${GRAPH_BASE}/${externalId}`);
  url.searchParams.set("access_token", ctx.token);
  const res = await fetch(url.toString(), { method: "DELETE" });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok || json?.error) throw new Error(json?.error?.message || `HTTP ${res.status}`);
  return json;
}
