import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  buildJourneyCanvas, buildOneTimeSchedule, checkJourneyPlan, checkMetaPlan, DEFAULT_SETTINGS, normalizeCondition, parseIstStart,
  toolDefinitions, type TemplateInfo,
} from "./comms-agent-tools.ts";
import { applyFilters } from "./list-view-engine.ts";
import { PATIENT_FIELDS, rawValue } from "./patient-view-fields.ts";
import { parseCanvas, validateCanvas } from "./comms-journey-graph.ts";

const tpl = (status = "approved", variableMap: Record<string, string> | null = { "1": "patient_first_name" }): TemplateInfo => ({ id: "t1", name: "skin_welcome_offer", status, category: "MARKETING", body: "Hi {{1}}", variableMap });
const NOW = new Date("2026-11-18T06:30:00Z"); // 12:00 IST

Deno.test("since a date means on or after it (inclusive), using the engine's own operators", () => {
  const c = normalizeCondition({ field: "created_at", operator: "on_or_after", value: "2026-03-15" });
  const rows = [{ id: 1, created_at: "2026-03-14T10:00:00Z" }, { id: 2, created_at: "2026-03-15T00:30:00" }, { id: 3, created_at: "2026-06-01T10:00:00Z" }];
  const kept = applyFilters(rows, { match: "all", conditions: [c] }, PATIENT_FIELDS, rawValue).map((r) => r.id);
  assertEquals(kept, [2, 3]);
});

Deno.test("number gte/lte translate to between and include the boundary", () => {
  const gte = normalizeCondition({ field: "days_since_last_visit", operator: "gte", value: 90 });
  const rows = [{ id: 1, last_visit_date: null, days_since_last_visit: 89 }, { id: 2, days_since_last_visit: 90 }, { id: 3, days_since_last_visit: 200 }];
  const out = applyFilters(rows, { match: "all", conditions: [gte] }, PATIENT_FIELDS, (r, k) => (r as Record<string, unknown>)[k]).map((r) => r.id);
  assertEquals(out, [2, 3]);
});

Deno.test("invalid fields, operators and picklist values are rejected with a helpful message", () => {
  assertThrows(() => normalizeCondition({ field: "registered", operator: "after", value: "2026-03-15" }), Error, "Unknown field");
  assertThrows(() => normalizeCondition({ field: "city", operator: "gte", value: "x" }), Error, "not valid");
  assertThrows(() => normalizeCondition({ field: "engagement_tier", operator: "equals", value: "Diamond" }), Error, "Valid values");
  assertThrows(() => normalizeCondition({ field: "created_at", operator: "on_or_after", value: "15/03/2026" }), Error, "YYYY-MM-DD");
  assertThrows(() => normalizeCondition({ field: "total_visits", operator: "eq", value: "many" }), Error, "number");
});

Deno.test("picklist in accepts a list and keeps it in values", () => {
  const c = normalizeCondition({ field: "engagement_tier", operator: "in", values: ["Gold", "Platinum"] });
  assertEquals(c.operator, "in");
  assertEquals(c.values, ["Gold", "Platinum"]);
});

Deno.test("IST start parsing converts to the right UTC instant", () => {
  const s = parseIstStart("2026-11-23T10:00");
  assertEquals(s.utc.toISOString(), "2026-11-23T04:30:00.000Z");
  assertThrows(() => parseIstStart("next monday"), Error);
});

Deno.test("journey checks: approved template, future time, inside the window", () => {
  const ok = checkJourneyPlan({ template: tpl(), templateName: "skin_welcome_offer", start: parseIstStart("2026-11-23T10:00"), now: NOW, matching: 62, reachable: 59, withoutPhone: 3, optedOut: 0, settings: DEFAULT_SETTINGS });
  assertEquals(ok.blocked, false);
  assertEquals(ok.needsSecondConfirmation, false);
});

Deno.test("journey checks block: pending template, unknown template, past time, outside window, no patients", () => {
  const base = { templateName: "x", now: NOW, matching: 5, reachable: 5, withoutPhone: 0, optedOut: 0, settings: DEFAULT_SETTINGS };
  assertEquals(checkJourneyPlan({ ...base, template: tpl("pending"), start: parseIstStart("2026-11-23T10:00") }).blocked, true);
  assertEquals(checkJourneyPlan({ ...base, template: null, start: parseIstStart("2026-11-23T10:00") }).blocked, true);
  assertEquals(checkJourneyPlan({ ...base, template: tpl(), start: parseIstStart("2026-11-17T10:00") }).blocked, true);
  assertEquals(checkJourneyPlan({ ...base, template: tpl(), start: parseIstStart("2026-11-23T22:30") }).blocked, true);
  assertEquals(checkJourneyPlan({ ...base, template: tpl(), matching: 0, reachable: 0, start: parseIstStart("2026-11-23T10:00") }).blocked, true);
});

Deno.test("a template whose variables have no mapping blocks the plan", () => {
  const r = checkJourneyPlan({ template: tpl("approved", null), templateName: "x", start: parseIstStart("2026-11-23T10:00"), now: NOW, matching: 5, reachable: 5, withoutPhone: 0, optedOut: 0, settings: DEFAULT_SETTINGS });
  assertEquals(r.blocked, true);
});

Deno.test("audience above the cap needs a second confirmation but is not blocked", () => {
  const r = checkJourneyPlan({ template: tpl(), templateName: "x", start: parseIstStart("2026-11-23T10:00"), now: NOW, matching: 2000, reachable: 1500, withoutPhone: 0, optedOut: 0, settings: DEFAULT_SETTINGS });
  assertEquals(r.blocked, false);
  assertEquals(r.needsSecondConfirmation, true);
});

Deno.test("meta budget above the spend cap is blocked", () => {
  assertEquals(checkMetaPlan(3000, DEFAULT_SETTINGS).blocked, true);
  assertEquals(checkMetaPlan(500, DEFAULT_SETTINGS).blocked, false);
  assertEquals(checkMetaPlan(0, DEFAULT_SETTINGS).blocked, true);
});

Deno.test("the generated journey canvas is valid for the existing Journey Builder", () => {
  const canvas = parseCanvas(buildJourneyCanvas(tpl()));
  assertEquals(validateCanvas(canvas), []);
});

Deno.test("one-time schedule gets a next_run_at at the chosen IST time", () => {
  const s = buildOneTimeSchedule(parseIstStart("2026-11-23T10:00"));
  assertEquals(s.type, "one_time");
  assertEquals(s.execution_date, "2026-11-23");
  assertEquals(s.next_run_at, "2026-11-23T04:30:00.000Z");
});

Deno.test("tool definitions expose exactly the five tools", () => {
  assertEquals(toolDefinitions().map((t) => t.function.name), ["build_filter", "get_template", "propose_journey", "propose_meta_campaign", "ask_user"]);
});
