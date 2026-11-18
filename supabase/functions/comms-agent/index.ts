// Agentic Marketing. A staff member describes a campaign in plain words; an AI model (Lovable AI
// gateway, LOVABLE_API_KEY) turns it into tool calls; this function validates every call and stores
// a plan. Nothing is created until an admin or manager approves a stored plan, and even then only
// DRAFTS are created: a draft journey (still needing the normal approval flow before it can run) or
// a local Meta campaign draft. This function never activates, publishes, sends or spends.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, requireStaffId } from "../_shared/comms-auth.ts";
import { isAdminOrManager } from "../_shared/meta-access.ts";
import { applyFilters, OPERATORS, type FilterCondition } from "../_shared/list-view-engine.ts";
import { PATIENT_FIELDS, rawValue } from "../_shared/patient-view-fields.ts";
import { excludeOptedOut, loadAllPatients, loadOptOutKeys } from "../_shared/comms-audience.ts";
import { toE164IN } from "../_shared/comms-phone.ts";
import {
  buildJourneyCanvas, buildOneTimeSchedule, buildPlannerPrompt, checkJourneyPlan, checkMetaPlan, DEFAULT_SETTINGS,
  describeCondition, normalizeCondition, parseIstStart, toolDefinitions, type AgentSettings, type TemplateInfo,
} from "../_shared/comms-agent-tools.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";
const MAX_ROUNDS = 6;
const MAX_RUNS_PER_HOUR = 20;

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function loadSettings(db: SupabaseClient): Promise<AgentSettings> {
  const { data } = await db.from("comms_agent_settings").select("*").limit(1).maybeSingle();
  return {
    audience_cap: Number(data?.audience_cap ?? DEFAULT_SETTINGS.audience_cap),
    send_window_start: Number(data?.send_window_start ?? DEFAULT_SETTINGS.send_window_start),
    send_window_end: Number(data?.send_window_end ?? DEFAULT_SETTINGS.send_window_end),
    ad_spend_cap: Number(data?.ad_spend_cap ?? DEFAULT_SETTINGS.ad_spend_cap),
    cost_per_message: Number(data?.cost_per_message ?? DEFAULT_SETTINGS.cost_per_message),
  };
}

/** Conditions coming from the browser (the table's own filters) are checked against the real field and operator lists. */
function cleanEngineConditions(raw: unknown): FilterCondition[] {
  if (!Array.isArray(raw)) return [];
  const out: FilterCondition[] = [];
  for (const c of raw.slice(0, 20)) {
    const def = PATIENT_FIELDS.find((f) => f.key === c?.field);
    if (!def || !OPERATORS[def.type].some((o) => o.value === c?.operator)) throw new HttpError(400, `Filter on "${c?.field}" is not valid`);
    const cond: FilterCondition = { field: String(c.field), operator: String(c.operator), value: String(c.value ?? "") };
    if (c.value2 !== undefined && c.value2 !== null) cond.value2 = String(c.value2);
    if (Array.isArray(c.values)) cond.values = c.values.map(String);
    out.push(cond);
  }
  return out;
}

const matchWith = (rows: Row[], conditions: FilterCondition[]) =>
  applyFilters(rows, { match: "all", conditions }, PATIENT_FIELDS, rawValue);

async function audienceFor(db: SupabaseClient, patients: Row[], base: FilterCondition[], extra: FilterCondition[], optOutKeys: Set<string>) {
  const matching = matchWith(patients, [...base, ...extra]);
  const withPhone: (Row & { phone_e164: string })[] = [];
  for (const p of matching) {
    const phone = toE164IN(p.phone);
    if (phone) withPhone.push({ ...p, phone_e164: phone });
  }
  const { kept, removed } = excludeOptedOut(withPhone, optOutKeys);
  return { matching: matching.length, reachable: kept, withoutPhone: matching.length - withPhone.length, optedOut: removed };
}

const maskedSample = (rows: Row[]) =>
  rows.slice(0, 4).map((p) => `${String(p.first_name ?? "").trim() || "Patient"} ••••${String(p.phone_e164).slice(-4)}`);

/* ------------------------------- AI gateway ------------------------------- */

async function callGateway(messages: Row[], tools: unknown[]): Promise<Row> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new HttpError(500, "LOVABLE_API_KEY is not configured");
  const resp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: "auto" }),
  });
  if (!resp.ok) {
    if (resp.status === 429) throw new HttpError(429, "The AI service is busy. Please try again shortly.");
    if (resp.status === 402) throw new HttpError(402, "AI credits are exhausted. Add credits to continue.");
    throw new HttpError(502, `AI gateway error: ${resp.status}`);
  }
  const body = await resp.json();
  const msg = body?.choices?.[0]?.message;
  if (!msg) throw new HttpError(502, "The AI service returned an empty answer");
  return msg;
}

/* --------------------------------- plan --------------------------------- */

async function planAction(db: SupabaseClient, ctx: { staffId: string }, body: Row) {
  const prompt = String(body.prompt ?? "").trim();
  if (prompt.length < 5) throw new HttpError(400, "Describe what you want to do");
  if (prompt.length > 1500) throw new HttpError(400, "That prompt is too long. Keep it under 1,500 characters.");
  const base = cleanEngineConditions(body.base_filters);

  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await db.from("agent_runs").select("id", { count: "exact", head: true }).eq("created_by", ctx.staffId).gte("created_at", since);
  if ((count ?? 0) >= MAX_RUNS_PER_HOUR) throw new HttpError(429, "Too many plans in the last hour. Please wait a little.");

  const settings = await loadSettings(db);
  const { data: templateRows, error: tplErr } = await db
    .from("comms_whatsapp_templates").select("id, name, status, category, body, variable_map").order("name").limit(500);
  if (tplErr) throw new HttpError(500, `Could not load templates: ${tplErr.message}`);
  const templates: TemplateInfo[] = (templateRows ?? []).map((t: Row) => ({
    id: t.id, name: t.name, status: t.status, category: t.category, body: t.body ?? "",
    variableMap: (t.variable_map && typeof t.variable_map === "object") ? t.variable_map as Record<string, string> : null,
  }));

  const patients = await loadAllPatients(db);
  const optOutKeys = await loadOptOutKeys(db);

  const state: {
    extra: FilterCondition[]; template: TemplateInfo | null; templateName: string; journey: { start_iso: string; label: string } | null;
    meta: { service: string; city: string; objective: string; budget: number } | null; question: string | null;
  } = { extra: [], template: null, templateName: "", journey: null, meta: null, question: null };
  const toolLog: Row[] = [];

  const execute = async (name: string, args: Row): Promise<unknown> => {
    switch (name) {
      case "build_filter": {
        const conds = (Array.isArray(args.conditions) ? args.conditions : []).slice(0, 10).map(normalizeCondition);
        state.extra = conds;
        const n = matchWith(patients, [...base, ...conds]).length;
        return { matching_patients: n, applied: conds.map(describeCondition) };
      }
      case "get_template": {
        const wanted = String(args.name ?? "").trim().toLowerCase();
        const t = templates.find((x) => x.name.toLowerCase() === wanted);
        state.templateName = wanted;
        if (!t) throw new Error(`No template named ${wanted}. Synced templates: ${templates.map((x) => x.name).join(", ") || "none"}`);
        state.template = t;
        return { name: t.name, status: t.status, category: t.category, variables: Object.keys(t.variableMap ?? {}) };
      }
      case "propose_journey": {
        const start = parseIstStart(args.start_iso);
        state.templateName = String(args.template ?? state.templateName).trim().toLowerCase();
        if (!state.template || state.template.name.toLowerCase() !== state.templateName) {
          state.template = templates.find((x) => x.name.toLowerCase() === state.templateName) ?? null;
        }
        state.journey = { start_iso: `${start.date}T${start.time}`, label: String(args.label ?? "").slice(0, 60) };
        state.meta = null;
        return { ok: true };
      }
      case "propose_meta_campaign": {
        const budget = Number(args.daily_budget_inr);
        if (!(budget > 0)) throw new Error("daily_budget_inr must be a positive number");
        const objective = ["Leads", "Traffic", "Awareness"].includes(String(args.objective)) ? String(args.objective) : "Leads";
        state.meta = { service: String(args.service ?? "").slice(0, 80), city: String(args.city ?? "").slice(0, 60), objective, budget };
        state.journey = null;
        return { ok: true };
      }
      case "ask_user": {
        state.question = String(args.question ?? "").slice(0, 300) || "Could you add a little more detail?";
        return { ok: true };
      }
      default:
        throw new Error(`Unknown tool ${name}`);
    }
  };

  const now = new Date();
  const system = buildPlannerPrompt({
    prompt, now, settings, templates: templates.map((t) => t.name),
    currentFilters: base.map(describeCondition),
  });
  const messages: Row[] = [
    { role: "system", content: system },
    { role: "user", content: "Plan the request above by calling the tools." },
  ];
  const tools = toolDefinitions();

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const msg = await callGateway(messages, tools);
    const calls: Row[] = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (calls.length === 0) break;
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
    for (const call of calls) {
      const name = String(call.function?.name ?? "");
      let args: Row = {};
      try { args = JSON.parse(call.function?.arguments || "{}"); } catch { args = {}; }
      let content: string;
      const entry: Row = { name, args };
      try {
        const result = await execute(name, args);
        entry.result = result;
        content = JSON.stringify(result);
      } catch (e) {
        entry.error = (e as Error).message;
        content = `Error: ${(e as Error).message}`;
      }
      toolLog.push(entry);
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
    if (state.question || state.journey || state.meta) break;
  }

  let plan: Row;
  if (state.question) {
    plan = { kind: "question", question: state.question };
  } else if (state.journey) {
    const start = parseIstStart(state.journey.start_iso);
    const aud = await audienceFor(db, patients, base, state.extra, optOutKeys);
    const verdict = checkJourneyPlan({
      template: state.template, templateName: state.templateName, start, now,
      matching: aud.matching, reachable: aud.reachable.length, withoutPhone: aud.withoutPhone, optedOut: aud.optedOut, settings,
    });
    const label = (state.template?.name ?? state.templateName).replace(/^skin_/, "").replace(/_/g, " ");
    plan = {
      kind: "journey", object: "patients", base_filters: base, extra_conditions: state.extra,
      template: state.template ? { id: state.template.id, name: state.template.name, category: state.template.category, status: state.template.status, body: state.template.body, variable_map: state.template.variableMap ?? null } : null,
      template_name: state.templateName, start_iso: state.journey.start_iso, start_label: state.journey.label,
      audience: { matching: aud.matching, reachable: aud.reachable.length, without_phone: aud.withoutPhone, opted_out: aud.optedOut },
      sample: maskedSample(aud.reachable), cost_estimate: Math.round(aud.reachable.length * settings.cost_per_message * 100) / 100,
      journey_name: `${label.charAt(0).toUpperCase()}${label.slice(1)} · ${state.journey.label || state.journey.start_iso}`.slice(0, 80),
      filters_text: [...base, ...state.extra].map(describeCondition),
      checks: verdict.checks, blocked: verdict.blocked, needs_second_confirmation: verdict.needsSecondConfirmation,
    };
  } else if (state.meta) {
    const verdict = checkMetaPlan(state.meta.budget, settings);
    plan = {
      kind: "meta", service: state.meta.service, city: state.meta.city, objective: state.meta.objective, daily_budget_inr: state.meta.budget,
      campaign_name: `${state.meta.service} · ${state.meta.city} · ${state.meta.objective}`.slice(0, 120),
      checks: verdict.checks, blocked: verdict.blocked,
    };
  } else {
    plan = { kind: "question", question: "I could not turn that into a journey or an ad draft. Say what to send, to whom, and when, for example: \"Send skin_welcome_offer to Gold patients starting tomorrow\"." };
  }

  const { data: run, error: runErr } = await db.from("agent_runs").insert({
    object: "patients", prompt, status: "planned", plan, tool_calls: toolLog, model: MODEL, created_by: ctx.staffId,
  }).select("id").single();
  if (runErr) throw new HttpError(500, `Could not save the run: ${runErr.message}`);
  return json({ run_id: run.id, plan, tool_calls: toolLog });
}

/* -------------------------------- approve -------------------------------- */

async function approveAction(db: SupabaseClient, ctx: { staffId: string; userId: string }, body: Row) {
  const { data: run } = await db.from("agent_runs").select("*").eq("id", String(body.run_id ?? "")).maybeSingle();
  if (!run) throw new HttpError(404, "Run not found");
  if (run.status !== "planned") throw new HttpError(409, `This plan is already ${run.status}`);
  const plan = run.plan as Row;
  const settings = await loadSettings(db);
  const now = new Date();

  if (plan.kind === "journey") {
    const base = cleanEngineConditions(plan.base_filters);
    const extra = cleanEngineConditions(plan.extra_conditions);
    // Re-check everything against today's data and today's template status; the stored plan is only a proposal.
    const { data: t } = await db.from("comms_whatsapp_templates").select("id, name, status, category, body, variable_map").eq("id", plan.template?.id ?? "").maybeSingle();
    const template: TemplateInfo | null = t ? { id: t.id, name: t.name, status: t.status, category: t.category, body: t.body ?? "", variableMap: (t.variable_map && typeof t.variable_map === "object") ? t.variable_map as Record<string, string> : null } : null;
    const start = parseIstStart(plan.start_iso);
    const patients = await loadAllPatients(db);
    const aud = await audienceFor(db, patients, base, extra, await loadOptOutKeys(db));
    const verdict = checkJourneyPlan({
      template, templateName: String(plan.template_name ?? ""), start, now,
      matching: aud.matching, reachable: aud.reachable.length, withoutPhone: aud.withoutPhone, optedOut: aud.optedOut, settings,
    });
    if (verdict.blocked || !template) return json({ error: "This plan no longer passes the checks", checks: verdict.checks }, 409);
    if (verdict.needsSecondConfirmation && body.confirm_over_cap !== true) {
      return json({ error: "The audience is above your cap. Confirm to continue.", needs_confirmation: true, checks: verdict.checks }, 409);
    }

    const name = String(plan.journey_name ?? "Agent journey").slice(0, 80);
    const { data: view, error: viewErr } = await db.from("list_views").insert({
      name: `Agent: ${name}`.slice(0, 100), section: "patients", user_id: ctx.userId, filter_match: "all",
      filters: [...base, ...extra], display_fields: ["full_name", "phone", "email", "status", "last_visit_date"],
      sort_by: "created_at", sort_direction: "desc", visibility: "private", is_default: false, charts: [],
    }).select("id").single();
    if (viewErr) throw new HttpError(500, `Could not save the audience view: ${viewErr.message}`);

    const { data: journey, error: jErr } = await db.from("comms_journeys").insert({
      name, description: `Drafted by the Agentic Marketing agent from: "${String(run.prompt).slice(0, 300)}"`,
      status: "draft", approval_status: "draft", created_by: ctx.staffId,
      canvas_data: buildJourneyCanvas(template),
      audience_config: { segments: [{ key: "A", label: `Agent: ${name}`, list_view_id: view.id, entity_type: "patients" }], combinator: "union", primary: "A" },
    }).select("id").single();
    if (jErr) {
      await db.from("list_views").delete().eq("id", view.id);
      throw new HttpError(500, `Could not create the journey: ${jErr.message}`);
    }
    const schedule = buildOneTimeSchedule(start);
    const { error: sErr } = await db.from("comms_journey_schedules").insert({
      journey_id: journey.id, type: schedule.type, frequency: null, execution_date: schedule.execution_date,
      execution_time: schedule.execution_time, days_of_week: null, day_of_month: null, month_of_quarter: null,
      timezone: "Asia/Kolkata", next_run_at: schedule.next_run_at ?? null, created_by: ctx.staffId,
    });
    if (sErr) {
      await db.from("comms_journeys").delete().eq("id", journey.id);
      await db.from("list_views").delete().eq("id", view.id);
      throw new HttpError(500, `Could not save the schedule: ${sErr.message}`);
    }
    await db.from("agent_runs").update({ status: "approved", approved_by: ctx.staffId, journey_id: journey.id, saved_view_id: view.id }).eq("id", run.id);
    return json({ ok: true, kind: "journey", journey_id: journey.id, view_id: view.id });
  }

  if (plan.kind === "meta") {
    const verdict = checkMetaPlan(Number(plan.daily_budget_inr), settings);
    if (verdict.blocked) return json({ error: "This plan no longer passes the checks", checks: verdict.checks }, 409);
    const { data: conn } = await db.from("social_connections").select("id, default_ad_account_id").eq("platform", "meta").maybeSingle();
    const objective = ({ Leads: "leads", Traffic: "traffic", Awareness: "awareness" } as Record<string, string>)[String(plan.objective)] ?? "leads";
    const { data: camp, error: cErr } = await db.from("social_campaigns").insert({
      platform: "meta", connection_id: conn?.id ?? null, ad_account_id: conn?.default_ad_account_id ?? null,
      name: String(plan.campaign_name ?? "Agent campaign").slice(0, 120), objective, buying_type: "auction",
      budget_type: "daily", budget_amount: Number(plan.daily_budget_inr), status: "draft", created_by: ctx.staffId,
    }).select("id").single();
    if (cErr) throw new HttpError(500, `Could not create the campaign draft: ${cErr.message}`);
    await db.from("agent_runs").update({ status: "approved", approved_by: ctx.staffId, campaign_id: camp.id }).eq("id", run.id);
    return json({ ok: true, kind: "meta", campaign_id: camp.id });
  }

  throw new HttpError(400, "This run has nothing to create");
}

/* --------------------------------- other --------------------------------- */

async function rejectAction(db: SupabaseClient, body: Row) {
  const { error } = await db.from("agent_runs").update({ status: "rejected" }).eq("id", String(body.run_id ?? "")).eq("status", "planned");
  if (error) throw new HttpError(500, error.message);
  return json({ ok: true });
}

async function saveSettingsAction(db: SupabaseClient, ctx: { staffId: string }, body: Row) {
  const n = (v: unknown, min: number, max: number, label: string) => {
    const x = Number(v);
    if (!Number.isFinite(x) || x < min || x > max) throw new HttpError(400, `${label} must be between ${min} and ${max}`);
    return x;
  };
  const row = {
    id: true,
    audience_cap: Math.round(n(body.audience_cap, 1, 100000, "Audience cap")),
    send_window_start: Math.round(n(body.send_window_start, 0, 23, "Send window start")),
    send_window_end: Math.round(n(body.send_window_end, 1, 24, "Send window end")),
    ad_spend_cap: n(body.ad_spend_cap, 0, 10000000, "Daily ad spend cap"),
    cost_per_message: n(body.cost_per_message, 0, 1000, "Cost per message"),
    updated_by: ctx.staffId, updated_at: new Date().toISOString(),
  };
  if (row.send_window_end <= row.send_window_start) throw new HttpError(400, "The send window must end after it starts");
  const { error } = await db.from("comms_agent_settings").upsert(row, { onConflict: "id" });
  if (error) throw new HttpError(500, error.message);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await requireStaffId(req);
    if (auth instanceof Response) return auth;
    if (!(await isAdminOrManager(auth.staffId))) return json({ error: "Only an admin or manager can use Agentic Marketing" }, 403);

    const body: Row = await req.json().catch(() => ({}));
    const db = admin();
    switch (body.action) {
      case "plan": return await planAction(db, auth, body);
      case "approve": return await approveAction(db, auth, body);
      case "reject": return await rejectAction(db, body);
      case "save-settings": return await saveSettingsAction(db, auth, body);
      default: return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error("comms-agent failed", e instanceof Error ? e.message : e);
    return json({ error: e instanceof Error ? e.message : "Something went wrong" }, 500);
  }
});
