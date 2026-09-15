// Generic saved-view engine: filtering, sorting, date-range resolution and
// chart aggregation, extracted from src/lib/patientFields.ts so any module
// (not just Patients) can drive the same "views" UI off its own FieldDef[]
// config instead of a hardcoded patient field list.
//
// Every function here takes the row data plus a `fields: FieldDef[]` config
// (and, where a module has computed/derived fields like Patients' "full_name"
// or "age", an optional `rawValue` resolver) rather than importing a fixed
// field list - that's what makes it reusable.

export type FieldType = "text" | "picklist" | "date" | "number";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** Where this field's picklist options come from - resolved at runtime by the caller's optionsResolver. */
  optionsSource?: string;
  /** Recurring yearly date (birthday/anniversary) - matched on day+month, ignoring year. */
  anniversary?: boolean;
}

export function fieldDefIn(fields: FieldDef[], key: string): FieldDef | undefined {
  return fields.find((f) => f.key === key);
}

export const OPERATORS: Record<FieldType, { value: string; label: string }[]> = {
  text: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "does not contain" },
    { value: "equals", label: "equals" },
    { value: "starts_with", label: "starts with" },
    { value: "in_list", label: "is one of (comma separated)" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  picklist: [
    { value: "equals", label: "equals" },
    { value: "not_equals", label: "not equals" },
    { value: "in", label: "is one of (multi-select)" },
    { value: "is_empty", label: "is empty" },
  ],
  date: [
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "tomorrow", label: "Tomorrow" },
    { value: "this_week", label: "This week" },
    { value: "last_week", label: "Last week" },
    { value: "next_week", label: "Next week" },
    { value: "this_month", label: "This month" },
    { value: "last_month", label: "Last month" },
    { value: "next_month", label: "Next month" },
    { value: "this_quarter", label: "This quarter" },
    { value: "last_quarter", label: "Last quarter" },
    { value: "next_quarter", label: "Next quarter" },
    { value: "this_year", label: "This year" },
    { value: "last_year", label: "Last year" },
    { value: "next_year", label: "Next year" },
    { value: "last_n_days", label: "In the last N days" },
    { value: "next_n_days", label: "In the next N days" },
    { value: "on", label: "On (specific date)" },
    { value: "before", label: "Before" },
    { value: "after", label: "After" },
    { value: "between", label: "Custom date range" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  number: [
    { value: "eq", label: "=" },
    { value: "neq", label: "≠" },
    { value: "gt", label: ">" },
    { value: "lt", label: "<" },
    { value: "between", label: "between" },
  ],
};

export interface FilterCondition {
  field: string;
  operator: string;
  value: string;
  value2?: string;
  values?: string[];
}

export interface ViewFilters {
  match: "all" | "any";
  conditions: FilterCondition[];
}

export type ChartType = "vertical_bar" | "horizontal_bar" | "donut" | "line";
export type AggregateType = "count" | "sum" | "avg";

export interface ViewChart {
  id: string;
  name: string;
  chart_type: ChartType;
  aggregate: AggregateType;
  aggregate_field?: string | null;
  group_field: string;
  limit?: number;
}

export interface KanbanConfig {
  /** Picklist field whose values become the Kanban columns. */
  group_field: string;
  /** Optional numeric field summed per column ("Summarize By"). */
  summarize_field?: string | null;
}

export type ListDisplayMode = "cards" | "table" | "kanban" | "split";

export interface ListView {
  id: string;
  name: string;
  owner_id: string;
  filters: ViewFilters;
  columns: string[];
  sort_field: string | null;
  sort_dir: "asc" | "desc";
  visibility: "private" | "everyone" | "selected";
  shared_user_ids: string[];
  is_default: boolean;
  charts: ViewChart[];
  /** Built-in views (All / Recently Viewed): filters are locked and they cannot be deleted. */
  is_standard?: boolean;
}

/** Default resolver: just reads the field straight off the row. Pass a custom one for derived fields (e.g. Patients' full_name/age). */
export type RawValueFn = (row: any, key: string) => unknown;
export const defaultRawValue: RawValueFn = (row, key) => (row ? row[key] : null);

function listValues(c: FilterCondition): string[] {
  if (c.values && c.values.length) return c.values.map((v) => String(v).trim()).filter(Boolean);
  return String(c.value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7)); // Monday start
const startOfMonth = (d: Date, offset = 0) => new Date(d.getFullYear(), d.getMonth() + offset, 1);
const startOfQuarter = (d: Date, offset = 0) =>
  new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + offset * 3, 1);
const startOfYear = (d: Date, offset = 0) => new Date(d.getFullYear() + offset, 0, 1);

export interface DateRange { from: Date; to: Date }

/** Resolve a date operator into an inclusive [from, to] day range (or null when not a preset/range op). */
export function dateRangeFor(operator: string, value?: string, value2?: string): DateRange | null {
  const now = new Date();
  const today = startOfDay(now);
  const end = (d: Date) => addDays(d, -1); // exclusive-start → inclusive-end helper
  switch (operator) {
    case "today": return { from: today, to: today };
    case "yesterday": return { from: addDays(today, -1), to: addDays(today, -1) };
    case "tomorrow": return { from: addDays(today, 1), to: addDays(today, 1) };
    case "this_week": return { from: startOfWeek(now), to: addDays(startOfWeek(now), 6) };
    case "last_week": return { from: addDays(startOfWeek(now), -7), to: addDays(startOfWeek(now), -1) };
    case "next_week": return { from: addDays(startOfWeek(now), 7), to: addDays(startOfWeek(now), 13) };
    case "this_month": return { from: startOfMonth(now), to: end(startOfMonth(now, 1)) };
    case "last_month": return { from: startOfMonth(now, -1), to: end(startOfMonth(now)) };
    case "next_month": return { from: startOfMonth(now, 1), to: end(startOfMonth(now, 2)) };
    case "this_quarter": return { from: startOfQuarter(now), to: end(startOfQuarter(now, 1)) };
    case "last_quarter": return { from: startOfQuarter(now, -1), to: end(startOfQuarter(now)) };
    case "next_quarter": return { from: startOfQuarter(now, 1), to: end(startOfQuarter(now, 2)) };
    case "this_year": return { from: startOfYear(now), to: end(startOfYear(now, 1)) };
    case "last_year": return { from: startOfYear(now, -1), to: end(startOfYear(now)) };
    case "next_year": return { from: startOfYear(now, 1), to: end(startOfYear(now, 2)) };
    case "last_n_days": {
      const n = Number(value || 0);
      if (!n) return null;
      return { from: addDays(today, -(n - 1)), to: today };
    }
    case "next_n_days": {
      const n = Number(value || 0);
      if (!n) return null;
      return { from: today, to: addDays(today, n - 1) };
    }
    case "on": {
      if (!value) return null;
      const d = startOfDay(new Date(value));
      return isNaN(d.getTime()) ? null : { from: d, to: d };
    }
    case "between": {
      if (!value || !value2) return null;
      const a = startOfDay(new Date(value));
      const b = startOfDay(new Date(value2));
      if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
      return a <= b ? { from: a, to: b } : { from: b, to: a };
    }
    default: return null;
  }
}

/** True when a recurring yearly date (birthday) falls inside the range, ignoring the stored year. */
function anniversaryInRange(d: Date, range: DateRange): boolean {
  for (let y = range.from.getFullYear() - 1; y <= range.to.getFullYear() + 1; y++) {
    const occ = new Date(y, d.getMonth(), d.getDate()).getTime();
    if (occ >= range.from.getTime() && occ <= range.to.getTime()) return true;
  }
  return false;
}

function matchOne(row: any, c: FilterCondition, fields: FieldDef[], rawValue: RawValueFn): boolean {
  const def = fieldDefIn(fields, c.field);
  if (!def) return true;
  const val = rawValue(row, c.field);

  if (c.operator === "is_empty") {
    return val === null || val === undefined || String(val).trim() === "";
  }
  if (c.operator === "is_not_empty") {
    return !(val === null || val === undefined || String(val).trim() === "");
  }

  if (def.type === "number") {
    const n = Number(val ?? 0);
    const a = Number(c.value);
    const b = Number(c.value2);
    switch (c.operator) {
      case "eq": return n === a;
      case "neq": return n !== a;
      case "gt": return n > a;
      case "lt": return n < a;
      case "between": return n >= Math.min(a, b) && n <= Math.max(a, b);
      default: return true;
    }
  }

  if (def.type === "date") {
    if (!val) return false;
    const d = new Date(String(val));
    if (isNaN(d.getTime())) return false;
    const dayValue = startOfDay(d).getTime();

    if (c.operator === "before" || c.operator === "after") {
      if (!c.value) return true;
      const target = startOfDay(new Date(c.value));
      if (isNaN(target.getTime())) return true;
      if (def.anniversary) {
        const occ = new Date(target.getFullYear(), d.getMonth(), d.getDate()).getTime();
        return c.operator === "before" ? occ < target.getTime() : occ > target.getTime();
      }
      return c.operator === "before" ? dayValue < target.getTime() : dayValue > target.getTime();
    }

    const range = dateRangeFor(c.operator, c.value, c.value2);
    if (!range) return true;
    if (def.anniversary) return anniversaryInRange(d, range);
    return dayValue >= range.from.getTime() && dayValue <= range.to.getTime();
  }

  const s = String(val ?? "").toLowerCase();
  const q = String(c.value ?? "").toLowerCase();
  switch (c.operator) {
    case "contains": return s.includes(q);
    case "not_contains": return !s.includes(q);
    case "equals": return String(val ?? "") === c.value;
    case "not_equals": return String(val ?? "") !== c.value;
    case "starts_with": return s.startsWith(q);
    case "in": return listValues(c).includes(String(val ?? ""));
    case "in_list": return listValues(c).map((v) => v.toLowerCase()).includes(s);
    default: return true;
  }
}

export function applyFilters<T>(
  rows: T[],
  filters: ViewFilters | null | undefined,
  fields: FieldDef[],
  rawValue: RawValueFn = defaultRawValue,
): T[] {
  const conditions = filters?.conditions?.filter((c) => c.field && c.operator) ?? [];
  if (!conditions.length) return rows;
  const match = filters?.match ?? "all";
  return rows.filter((row) =>
    match === "all"
      ? conditions.every((c) => matchOne(row, c, fields, rawValue))
      : conditions.some((c) => matchOne(row, c, fields, rawValue))
  );
}

export function sortRows<T>(
  rows: T[],
  field: string | null | undefined,
  dir: "asc" | "desc" = "desc",
  fields: FieldDef[],
  rawValue: RawValueFn = defaultRawValue,
): T[] {
  if (!field) return rows;
  const def = fieldDefIn(fields, field);
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = rawValue(a, field);
    const bv = rawValue(b, field);
    if (av === null || av === undefined || av === "") return 1;
    if (bv === null || bv === undefined || bv === "") return -1;
    if (def?.type === "number") return (Number(av) - Number(bv)) * sign;
    if (def?.type === "date") return (new Date(String(av)).getTime() - new Date(String(bv)).getTime()) * sign;
    return String(av).localeCompare(String(bv)) * sign;
  });
}

export function formatCell(row: any, key: string, fields: FieldDef[], rawValue: RawValueFn = defaultRawValue): string {
  const def = fieldDefIn(fields, key);
  const val = rawValue(row, key);
  if (val === null || val === undefined || val === "") return "—";
  if (def?.type === "date") {
    const d = new Date(String(val));
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }
  return String(val);
}

/** Group + aggregate rows for a saved view chart. */
export function computeChartData(
  rows: any[],
  chart: ViewChart,
  fields: FieldDef[],
  rawValue: RawValueFn = defaultRawValue,
): { name: string; value: number }[] {
  const buckets = new Map<string, number[]>();
  for (const row of rows) {
    const raw = rawValue(row, chart.group_field);
    let key: string;
    const def = fieldDefIn(fields, chart.group_field);
    if (raw === null || raw === undefined || raw === "") key = "—";
    else if (def?.type === "date") key = new Date(String(raw)).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    else key = String(raw);
    const metric =
      chart.aggregate === "count"
        ? 1
        : Number(rawValue(row, chart.aggregate_field || "") ?? 0) || 0;
    const arr = buckets.get(key) ?? [];
    arr.push(metric);
    buckets.set(key, arr);
  }
  const data = Array.from(buckets.entries()).map(([name, values]) => ({
    name,
    value:
      chart.aggregate === "avg"
        ? Math.round((values.reduce((a, b) => a + b, 0) / (values.length || 1)) * 100) / 100
        : values.reduce((a, b) => a + b, 0),
  }));
  data.sort((a, b) => b.value - a.value);
  return data.slice(0, chart.limit && chart.limit > 0 ? chart.limit : 12);
}
