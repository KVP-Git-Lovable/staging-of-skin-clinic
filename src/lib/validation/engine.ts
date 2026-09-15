import { getField, NO_VALUE_OPERATORS } from "./schema";

export interface Criterion {
  id: string;
  field: string;
  operator: string;
  value: string;
  value2?: string;
}

export interface RuleCase {
  id: string;
  criteria: Criterion[];
  pattern: string; // e.g. "1 and 2"
  preference: "error" | "alert";
  message: string;
  errorLocation: "primary" | "top";
}

export interface RuleBranch {
  id: string;
  /** Primary field value this branch applies to. "__any__" = any value. */
  optionValue: string;
  cases: RuleCase[];
}

export interface RuleConfig {
  branches: RuleBranch[];
}

export interface ValidationRule {
  id: string;
  object_key: string;
  field_key: string;
  name: string;
  description: string | null;
  execute_when: "criteria_met" | "always";
  validate_on: "save_only" | "save_and_edit";
  config: RuleConfig;
  is_active: boolean;
}

export interface ValidationMessage {
  ruleId: string;
  ruleName: string;
  field: string;
  message: string;
  severity: "error" | "alert";
  location: "primary" | "top";
}

export const ANY_VALUE = "__any__";

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function toNumber(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function toTime(v: any): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

function isEmpty(v: any) {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

export function evaluateCriterion(c: Criterion, record: Record<string, any>, objectKey: string): boolean {
  const raw = record[c.field];
  const type = getField(objectKey, c.field)?.type || "text";

  switch (c.operator) {
    case "is_empty":
      return isEmpty(raw);
    case "is_not_empty":
      return !isEmpty(raw);
    case "is_true":
      return raw === true;
    case "is_false":
      return raw !== true;
  }

  if (type === "number") {
    const a = toNumber(raw);
    const b = toNumber(c.value);
    const b2 = toNumber(c.value2);
    if (a === null) return false;
    switch (c.operator) {
      case "eq": return b !== null && a === b;
      case "neq": return b !== null && a !== b;
      case "gt": return b !== null && a > b;
      case "gte": return b !== null && a >= b;
      case "lt": return b !== null && a < b;
      case "lte": return b !== null && a <= b;
      case "between": return b !== null && b2 !== null && a >= b && a <= b2;
      default: return false;
    }
  }

  if (type === "date" || type === "datetime") {
    const a = toTime(raw);
    const b = toTime(c.value);
    const b2 = toTime(c.value2);
    if (a === null) return false;
    switch (c.operator) {
      case "on": return b !== null && new Date(a).toDateString() === new Date(b).toDateString();
      case "before": return b !== null && a < b;
      case "after": return b !== null && a > b;
      case "between": return b !== null && b2 !== null && a >= b && a <= b2;
      default: return false;
    }
  }

  const s = raw === null || raw === undefined ? "" : String(raw);
  const target = c.value ?? "";
  const lower = s.toLowerCase();
  const t = target.toLowerCase();

  switch (c.operator) {
    case "is": return lower === t;
    case "isnt": return lower !== t;
    case "contains": return lower.includes(t);
    case "not_contains": return !lower.includes(t);
    case "starts_with": return lower.startsWith(t);
    case "ends_with": return lower.endsWith(t);
    case "length_gt": return s.length > Number(target || 0);
    case "length_lt": return s.length < Number(target || 0);
    case "in": return target.split(",").map((x) => x.trim().toLowerCase()).includes(lower);
    case "not_in": return !target.split(",").map((x) => x.trim().toLowerCase()).includes(lower);
    case "matches":
      try { return new RegExp(target).test(s); } catch { return false; }
    default: return false;
  }
}

/** Evaluates a criteria pattern like "(1 and 2) or 3" against boolean results. */
export function evaluatePattern(pattern: string, results: boolean[]): boolean {
  const clean = (pattern || "").trim();
  if (!clean) return results.every(Boolean);
  const tokens = clean
    .replace(/\(/g, " ( ")
    .replace(/\)/g, " ) ")
    .split(/\s+/)
    .filter(Boolean);

  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseFactor(): boolean {
    const tok = next();
    if (tok === "(") {
      const v = parseOr();
      if (peek() === ")") next();
      return v;
    }
    const idx = parseInt(tok, 10);
    if (Number.isNaN(idx)) return false;
    return !!results[idx - 1];
  }
  function parseAnd(): boolean {
    let v = parseFactor();
    while (peek() && peek().toLowerCase() === "and") { next(); v = parseFactor() && v; }
    return v;
  }
  function parseOr(): boolean {
    let v = parseAnd();
    while (peek() && peek().toLowerCase() === "or") { next(); v = parseAnd() || v; }
    return v;
  }

  try {
    return parseOr();
  } catch {
    return results.every(Boolean);
  }
}

export function defaultPattern(count: number) {
  return Array.from({ length: count }, (_, i) => i + 1).join(" and ");
}

export function criterionSummary(c: Criterion, objectKey: string) {
  const field = getField(objectKey, c.field);
  const label = field?.label || c.field;
  if (NO_VALUE_OPERATORS.includes(c.operator)) return `${label} ${c.operator.replace(/_/g, " ")}`;
  const val = c.operator === "between" ? `${c.value} - ${c.value2 ?? ""}` : c.value;
  return `${label} ${c.operator} ${val}`;
}

/** Runs every active rule for an object against a record. */
export function runValidations(
  rules: ValidationRule[],
  record: Record<string, any>,
  context: { isEdit?: boolean } = {},
): ValidationMessage[] {
  const out: ValidationMessage[] = [];

  for (const rule of rules) {
    if (!rule.is_active) continue;
    if (rule.validate_on === "save_only" && context.isEdit === true) {
      // "Save Only" still runs on save; edit-time inline validation uses save_and_edit
    }
    const primaryValue = record[rule.field_key];
    const branches = rule.config?.branches || [];

    for (const branch of branches) {
      const matchesBranch =
        branch.optionValue === ANY_VALUE ||
        String(primaryValue ?? "").toLowerCase() === String(branch.optionValue ?? "").toLowerCase();
      if (!matchesBranch) continue;

      for (const rc of branch.cases) {
        const results = rc.criteria.map((c) => evaluateCriterion(c, record, rule.object_key));
        if (rc.criteria.length === 0) continue;
        const matched =
          rule.execute_when === "always" ? true : evaluatePattern(rc.pattern, results);
        if (!matched) continue;
        out.push({
          ruleId: rule.id,
          ruleName: rule.name,
          field: rc.errorLocation === "primary" ? rule.field_key : "__top__",
          message: rc.message || `${rule.name}: value is not allowed.`,
          severity: rc.preference,
          location: rc.errorLocation,
        });
      }
    }
  }

  return out;
}