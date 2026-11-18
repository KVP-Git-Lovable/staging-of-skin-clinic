// Pure helpers for the Agentic Marketing planner. The model only proposes; everything here is
// the server-side check that a proposal is valid before it is stored or turned into a draft.
// No database or network access, so it is unit-tested directly.
import { OPERATORS, type FieldDef, type FilterCondition } from "./list-view-engine.ts";
import { PATIENT_FIELDS } from "./patient-view-fields.ts";
import { computeNextRun, type JourneySchedule } from "./comms-schedule.ts";
import type { CanvasData } from "./comms-journey-graph.ts";

/** Patient fields the agent may filter on, with the allowed values of the fixed picklists. */
const AGENT_FIELD_KEYS = [
  "city", "state", "gender", "age", "date_of_birth", "status", "skin_type", "source", "total_visits",
  "lifetime_value", "last_visit_date", "days_since_last_visit", "engagement_score", "engagement_tier",
  "registered_at", "created_at",
];
export const PICKLIST_VALUES: Record<string, string[]> = {
  gender: ["Male", "Female", "Other"],
  status: ["Active", "Inactive"],
  skin_type: ["Normal", "Dry", "Oily", "Combination", "Sensitive"],
  engagement_tier: ["Platinum", "Gold", "Silver", "Early"],
  source: ["Walk-in", "Referral", "Doctor Referral", "Google", "Facebook", "Instagram", "Advertisement", "Other"],
};
export const AGENT_FIELDS: FieldDef[] = PATIENT_FIELDS.filter((f) => AGENT_FIELD_KEYS.includes(f.key));

/** Operators the model may use. on_or_after / on_or_before / gte / lte are translated to engine operators. */
export const AGENT_OPERATORS: Record<string, string[]> = {
  text: ["equals", "contains", "starts_with", "in_list", "is_empty", "is_not_empty"],
  picklist: ["equals", "not_equals", "in", "is_empty"],
  date: ["on_or_after", "on_or_before", "after", "before", "on", "between", "last_n_days", "is_empty", "is_not_empty"],
  number: ["gte", "lte", "gt", "lt", "eq", "neq", "between"],
};

export interface RawCondition { field?: unknown; operator?: unknown; value?: unknown; value2?: unknown; values?: unknown }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Validates one model-proposed condition and returns the engine-ready condition. Throws a message the model can act on. */
export function normalizeCondition(raw: RawCondition): FilterCondition {
  const key = String(raw.field ?? "");
  const def = AGENT_FIELDS.find((f) => f.key === key);
  if (!def) throw new Error(`Unknown field "${key}". Valid fields: ${AGENT_FIELDS.map((f) => f.key).join(", ")}`);
  const op = String(raw.operator ?? "");
  const allowed = AGENT_OPERATORS[def.type];
  if (!allowed.includes(op)) throw new Error(`Operator "${op}" is not valid for ${key} (${def.type}). Use one of: ${allowed.join(", ")}`);
  const value = raw.value === undefined || raw.value === null ? "" : String(raw.value);
  const value2 = raw.value2 === undefined || raw.value2 === null ? undefined : String(raw.value2);
  const needsValue = !["is_empty", "is_not_empty"].includes(op);
  if (needsValue && value === "" && op !== "in") throw new Error(`${key} ${op} needs a value`);

  if (def.type === "date" && needsValue && op !== "last_n_days") {
    if (!DATE_RE.test(value)) throw new Error(`${key} needs a date as YYYY-MM-DD`);
    if (op === "between" && !(value2 && DATE_RE.test(value2))) throw new Error(`${key} between needs value and value2 as YYYY-MM-DD`);
  }
  if (def.type === "date" && op === "on_or_after") return { field: key, operator: "after", value: addDaysIso(value, -1) };
  if (def.type === "date" && op === "on_or_before") return { field: key, operator: "before", value: addDaysIso(value, 1) };
  if (def.type === "date" && op === "last_n_days") {
    if (!(Number(value) > 0)) throw new Error("last_n_days needs a positive number");
    return { field: key, operator: op, value };
  }

  if (def.type === "number" && needsValue) {
    if (value === "" || Number.isNaN(Number(value))) throw new Error(`${key} needs a number`);
    if (op === "between" && (value2 === undefined || Number.isNaN(Number(value2)))) throw new Error(`${key} between needs value and value2 as numbers`);
    if (op === "gte") return { field: key, operator: "between", value, value2: "1000000000000" };
    if (op === "lte") return { field: key, operator: "between", value: "-1000000000000", value2: value };
  }

  if (def.type === "picklist") {
    const fixed = PICKLIST_VALUES[key];
    if (op === "in") {
      const list = Array.isArray(raw.values) ? raw.values.map(String) : value ? value.split("|") : [];
      if (!list.length) throw new Error(`${key} in needs values`);
      if (fixed && key !== "source") {
        const bad = list.filter((v) => !fixed.includes(v));
        if (bad.length) throw new Error(`Invalid value ${bad.join(", ")} for ${key}. Valid values: ${fixed.join(", ")}`);
      }
      return { field: key, operator: "in", value: "", values: list };
    }
    if (fixed && key !== "source" && op !== "is_empty" && !fixed.includes(value)) {
      throw new Error(`Invalid value "${value}" for ${key}. Valid values: ${fixed.join(", ")}`);
    }
  }

  // Final guard against the engine's own operator list so a stored view always loads in the UI.
  const engineOp = OPERATORS[def.type].some((o) => o.value === op) ? op : null;
  if (!engineOp) throw new Error(`Operator "${op}" is not supported for ${key}`);
  const out: FilterCondition = { field: key, operator: op, value };
  if (value2 !== undefined) out.value2 = value2;
  return out;
}

/** Human-readable description for plan cards and the run log. */
export function describeCondition(c: FilterCondition): string {
  const label = AGENT_FIELDS.find((f) => f.key === c.field)?.label ?? c.field;
  const vals = c.values?.length ? c.values.join(" or ") : c.value;
  const rng = c.value2 !== undefined && c.value2 !== "" ? ` and ${c.value2}` : "";
  return `${label} ${c.operator.replace(/_/g, " ")} ${vals}${rng}`.trim();
}

export interface IstStart { date: string; time: string; hour: number; minute: number; utc: Date }

/** Parses "YYYY-MM-DDTHH:MM" as IST wall-clock time. Throws if malformed. */
export function parseIstStart(iso: unknown): IstStart {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) throw new Error("start_iso must look like 2026-11-23T10:00 (IST)");
  const [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], +m[4], +m[5]];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) throw new Error("start_iso is not a real date and time");
  const utc = new Date(Date.UTC(y, mo - 1, d, h, mi) - 330 * 60_000);
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}`, hour: h, minute: mi, utc };
}

export interface AgentSettings {
  audience_cap: number;
  send_window_start: number;
  send_window_end: number;
  ad_spend_cap: number;
  cost_per_message: number;
}
export const DEFAULT_SETTINGS: AgentSettings = { audience_cap: 1000, send_window_start: 9, send_window_end: 21, ad_spend_cap: 1500, cost_per_message: 0.85 };

export type CheckLevel = "ok" | "warn" | "bad" | "info";
export interface Check { level: CheckLevel; message: string }

export interface TemplateInfo { id: string; name: string; status: string; category: string; body: string; variableMap?: Record<string, string> | null }

/** Variable numbers ({{1}}, {{2}}) used in a template body. */
export function templateVariableNumbers(body: string): string[] {
  return Array.from(new Set(Array.from(body.matchAll(/\{\{(\d+)\}\}/g)).map((m) => m[1])));
}

/** Variables the template uses that have no clinic value chosen in its saved mapping. */
export function unmappedVariables(t: TemplateInfo): string[] {
  return templateVariableNumbers(t.body).filter((n) => !t.variableMap?.[n]);
}

export interface JourneyPlanInput {
  template: TemplateInfo | null;
  templateName: string;
  start: IstStart;
  now: Date;
  matching: number;
  reachable: number;
  withoutPhone: number;
  optedOut: number;
  settings: AgentSettings;
}

/** All server-side checks for a journey proposal. `blocked` means it cannot be approved as is. */
export function checkJourneyPlan(i: JourneyPlanInput): { checks: Check[]; blocked: boolean; needsSecondConfirmation: boolean } {
  const checks: Check[] = [];
  let blocked = false;
  if (!i.template) {
    blocked = true;
    checks.push({ level: "bad", message: `Template ${i.templateName} was not found among the synced templates.` });
  } else if (i.template.status.toLowerCase() !== "approved") {
    blocked = true;
    checks.push({ level: "bad", message: `Template ${i.template.name} is ${i.template.status.toLowerCase()} with WhatsApp and cannot be used yet.` });
  } else {
    checks.push({ level: "ok", message: `Template ${i.template.name} is approved (${i.template.category.toLowerCase()}).` });
    const missing = unmappedVariables(i.template);
    if (missing.length) {
      blocked = true;
      checks.push({ level: "bad", message: `Template ${i.template.name} has variable${missing.length === 1 ? "" : "s"} ${missing.map((n) => `{{${n}}}`).join(", ")} with no patient value chosen. Set them on the WhatsApp Templates page first.` });
    }
  }
  if (i.matching === 0) { blocked = true; checks.push({ level: "bad", message: "No patients match these filters." }); }
  if (i.withoutPhone > 0) checks.push({ level: "info", message: `${i.withoutPhone} patient${i.withoutPhone === 1 ? " has" : "s have"} no usable phone number and will be skipped.` });
  if (i.optedOut > 0) checks.push({ level: "info", message: `${i.optedOut} patient${i.optedOut === 1 ? " has" : "s have"} opted out of WhatsApp and will be skipped.` });
  const over = i.reachable > i.settings.audience_cap;
  if (over) checks.push({ level: "warn", message: `Audience of ${i.reachable} is above your cap of ${i.settings.audience_cap}. A second confirmation is required.` });
  else if (i.reachable > 0) checks.push({ level: "ok", message: `Audience of ${i.reachable} is within your cap of ${i.settings.audience_cap}.` });
  if (i.start.utc.getTime() <= i.now.getTime()) { blocked = true; checks.push({ level: "bad", message: "The start time is in the past." }); }
  if (i.start.hour < i.settings.send_window_start || i.start.hour >= i.settings.send_window_end) {
    blocked = true;
    checks.push({ level: "bad", message: `The start time is outside your send window (${i.settings.send_window_start}:00–${i.settings.send_window_end}:00 IST).` });
  } else {
    checks.push({ level: "ok", message: `The start time is inside your send window (${i.settings.send_window_start}:00–${i.settings.send_window_end}:00 IST).` });
  }
  checks.push({ level: "info", message: "Created as a draft. Another admin or manager must approve it before it can run." });
  return { checks, blocked, needsSecondConfirmation: over };
}

export function checkMetaPlan(budget: number, settings: AgentSettings): { checks: Check[]; blocked: boolean } {
  const checks: Check[] = [];
  let blocked = false;
  if (!(budget > 0)) { blocked = true; checks.push({ level: "bad", message: "The daily budget must be more than zero." }); }
  else if (budget > settings.ad_spend_cap) { blocked = true; checks.push({ level: "bad", message: `Daily budget ₹${budget} is above your spend cap of ₹${settings.ad_spend_cap}.` }); }
  else checks.push({ level: "ok", message: `Daily budget ₹${budget} is within your spend cap of ₹${settings.ad_spend_cap}.` });
  checks.push({ level: "ok", message: "Saved as a local draft. Nothing is published to Meta and nothing is spent." });
  checks.push({ level: "warn", message: "Medical and cosmetic ads must follow Meta advertising policy. Review the creative before publishing." });
  checks.push({ level: "info", message: "Publishing needs an admin or manager on the Meta pages." });
  return { checks, blocked };
}

/** Entry -> WhatsApp message -> exit. The start time lives on the journey's one-time schedule. */
export function buildJourneyCanvas(t: TemplateInfo): CanvasData {
  return {
    nodes: [
      { id: "entry", type: "entry", position: { x: 0, y: 0 }, data: { label: "Audience" } },
      { id: "msg1", type: "message", position: { x: 0, y: 140 }, data: { label: t.name, template_id: t.id, template_name: t.name, template_category: t.category, template_body: t.body, variables: Object.fromEntries(templateVariableNumbers(t.body).map((n) => [n, t.variableMap?.[n] ?? ""]).filter(([, v]) => v)) } },
      { id: "exit", type: "exit", position: { x: 0, y: 280 }, data: { label: "End" } },
    ],
    edges: [
      { id: "e-entry-msg1", source: "entry", target: "msg1" },
      { id: "e-msg1-exit", source: "msg1", target: "exit" },
    ],
  };
}

/** One-time schedule row for the journey, with next_run_at computed the same way the Journey Builder does. */
export function buildOneTimeSchedule(start: IstStart): JourneySchedule {
  const s: JourneySchedule = {
    type: "one_time", frequency: null, execution_date: start.date, execution_time: start.time,
    days_of_week: null, day_of_month: null, month_of_quarter: null, timezone: "Asia/Kolkata",
  };
  s.next_run_at = computeNextRun(s)?.toISOString() ?? null;
  return s;
}

/** Tool definitions in the OpenAI-compatible shape the Lovable AI gateway accepts. */
export function toolDefinitions() {
  const cond = {
    type: "object",
    properties: {
      field: { type: "string", enum: AGENT_FIELDS.map((f) => f.key) },
      operator: { type: "string", description: "text: equals|contains|starts_with|in_list|is_empty|is_not_empty; picklist: equals|not_equals|in|is_empty; date: on_or_after|on_or_before|after|before|on|between|last_n_days|is_empty|is_not_empty; number: gte|lte|gt|lt|eq|neq|between" },
      value: { type: "string", description: "Dates as YYYY-MM-DD. Numbers as plain digits." },
      value2: { type: "string", description: "Second value for between." },
      values: { type: "array", items: { type: "string" }, description: "For picklist operator in." },
    },
    required: ["field", "operator"],
  };
  const fn = (name: string, description: string, parameters: Record<string, unknown>) => ({ type: "function", function: { name, description, parameters } });
  return [
    fn("build_filter", "Set the extra filter conditions for the audience, on top of the filters already applied in the table. Returns how many patients then match. Call once with every condition.", { type: "object", properties: { conditions: { type: "array", items: cond } }, required: ["conditions"] }),
    fn("get_template", "Look up a synced WhatsApp template by exact name. Returns status, category and variables, or an error listing valid names.", { type: "object", properties: { name: { type: "string" } }, required: ["name"] }),
    fn("propose_journey", "Propose a WhatsApp journey: send the template to the audience at start_iso. Call after get_template.", { type: "object", properties: { template: { type: "string" }, start_iso: { type: "string", description: "YYYY-MM-DDTHH:MM in IST, 24-hour" }, label: { type: "string", description: "How the user phrased the start, e.g. next Monday" } }, required: ["template", "start_iso", "label"] }),
    fn("propose_meta_campaign", "Propose a Meta ad campaign draft. It is only saved locally and is never published.", { type: "object", properties: { service: { type: "string" }, city: { type: "string" }, objective: { type: "string", enum: ["Leads", "Traffic", "Awareness"] }, daily_budget_inr: { type: "number" } }, required: ["service", "city", "objective", "daily_budget_inr"] }),
    fn("ask_user", "Ask the user one short clarifying question when the template, start day or intent is missing or ambiguous. Stop after calling this.", { type: "object", properties: { question: { type: "string" } }, required: ["question"] }),
  ];
}

export function istDateParts(now: Date): { iso: string; weekday: string; next14: string } {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const wd = (d: Date) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  const full = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const days: string[] = [];
  for (let i = 1; i <= 14; i++) { const d = new Date(ist.getTime() + i * 86_400_000); days.push(`${wd(d)} ${d.toISOString().slice(0, 10)}`); }
  return { iso: ist.toISOString().slice(0, 10), weekday: full[ist.getUTCDay()], next14: days.join(", ") };
}

export function buildPlannerPrompt(opts: { prompt: string; currentFilters: string[]; templates: string[]; now: Date; settings: AgentSettings }): string {
  const { iso, weekday, next14 } = istDateParts(opts.now);
  const fields = AGENT_FIELDS.map((f) => `${f.key} (${f.label}, ${f.type}${PICKLIST_VALUES[f.key] ? `: ${PICKLIST_VALUES[f.key].join("|")}` : ""})`).join("; ");
  return [
    "You plan marketing campaigns for a skin clinic. You act ONLY by calling the provided tools; never describe a plan in prose.",
    `Today is ${weekday} ${iso} (IST). The next 14 days: ${next14}.`,
    `The object is Patients. Fields: ${fields}.`,
    `Filters already applied in the table (do not repeat them): ${opts.currentFilters.length ? opts.currentFilters.join("; ") : "none"}.`,
    `Synced WhatsApp templates: ${opts.templates.length ? opts.templates.join(", ") : "none"}.`,
    `Send window is ${opts.settings.send_window_start}:00 to ${opts.settings.send_window_end}:00 IST.`,
    "Rules: (1) Call build_filter once with every extra condition the request implies; skip it if there are none. 'Since 15 March 2026' means on_or_after 2026-03-15. (2) For a WhatsApp journey call get_template with the exact template name, then propose_journey with start_iso as YYYY-MM-DDTHH:MM in IST on 24-hour time (10:00 if no time is given). (3) For a Meta ads request call propose_meta_campaign. (4) If the template name or the start day is missing or unclear, call ask_user with one short question. (5) If a tool returns an error, fix the call. Never invent template names. After the tools, reply with one short sentence.",
    `Request: ${JSON.stringify(opts.prompt)}`,
  ].join("\n");
}
