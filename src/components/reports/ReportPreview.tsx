import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getObjectByKey, isValidFieldKey, evaluateFilterLogic, type ReportFilter, type ReportDisplayOptions, DEFAULT_DISPLAY_OPTIONS } from "@/lib/reportObjects";
import { Badge } from "@/components/ui/badge";
import { useReportSchema } from "@/lib/reportSchema";
import { applyWidgetShaping, formatMetric, mergeWidgetOptions, type WidgetOptions } from "@/lib/dashboardWidgets";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(210, 80%, 55%)",
  "hsl(152, 60%, 40%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)",
  "hsl(280, 60%, 50%)",
  "hsl(340, 70%, 50%)",
  "hsl(200, 60%, 45%)",
];

interface Props {
  primaryObject: string;
  relatedObject: string;
  columns: string[];
  groupRows: string[];
  groupColumns: string[];
  filters: ReportFilter[];
  chartType: string;
  displayOptions?: ReportDisplayOptions;
  compact?: boolean;
  /** Salesforce-style dashboard widget presentation options. */
  widget?: WidgetOptions;
}

// Deep-link builders per object; each opens the specific record.
const RECORD_URL_BUILDERS: Record<string, (id: string) => string> = {
  patients: (id) => `/patients/${id}`,
  appointments: (id) => `/appointments/${id}`,
  staff: (id) => `/staff/${id}`,
  campaigns: (id) => `/campaigns/${id}`,
  procedures: (id) => `/procedures?id=${id}`,
  invoices: (id) => `/billing?viewInvoice=${id}`,
  services: (id) => `/services?id=${id}`,
  assets: (id) => `/assets?id=${id}`,
  vendors: (id) => `/vendors?id=${id}`,
  pharma_products: (id) => `/pharma?id=${id}`,
  asset_issues: (id) => `/assets?issue=${id}`,
  leave_applications: (id) => `/leave?id=${id}`,
  patient_feedback: (id) => `/appointments?feedback=${id}`,
};

// ---- Virtual / aggregate field helpers ----
// Field keys starting with "_" are computed client-side. They fall into:
//   _doctor_name              -> embed staff(first_name,last_name), join on FK
//   _full_name                -> derived from staff.first_name + last_name
//   _month                    -> YYYY-MM bucket from `created_at` (or start_time fallback)
//   _count                    -> COUNT(*) aggregate
//   _sum_<col> / _avg_<col>   -> SUM/AVG aggregate over <col>
//   _count_distinct_<col>     -> COUNT(DISTINCT <col>)

type AggInfo =
  | { fn: "count" }
  | { fn: "sum" | "avg" | "min" | "max"; col: string }
  | { fn: "count_distinct"; col: string };

function parseAgg(fieldKey: string): AggInfo | null {
  if (fieldKey === "_count") return { fn: "count" };
  let m = fieldKey.match(/^_count_distinct_(.+)$/);
  if (m) return { fn: "count_distinct", col: m[1] };
  m = fieldKey.match(/^_(sum|avg|min|max)_(.+)$/);
  if (m) return { fn: m[1] as any, col: m[2] };
  return null;
}

function virtualRealDeps(fieldKey: string): string[] {
  if (fieldKey === "_month") return ["created_at"];
  if (fieldKey === "_full_name") return ["first_name", "last_name"];
  if (fieldKey === "_doctor_name") return []; // handled via embed
  const agg = parseAgg(fieldKey);
  if (agg) {
    if (agg.fn === "count") return [];
    return [agg.col];
  }
  return [];
}

function isVirtualField(fieldKey: string): boolean {
  return fieldKey.startsWith("_");
}

function isAggField(fieldKey: string): boolean {
  return parseAgg(fieldKey) !== null;
}

function monthBucket(val: any): string {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// FK column on the parent table that links to "staff" for the doctor relation.
const DOCTOR_FK_BY_OBJECT: Record<string, string> = {
  invoices: "doctor_id",
  appointments: "staff_id",
};

// Resolve a stored filter value, expanding special tokens.
function resolveFilterValue(v: string): string {
  if (v === "__today__") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (v === "__start_of_month__") {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  return v;
}

// Client-side equivalent of the server-side operator handling.
function matchesValue(val: any, operator: string, fv: string): boolean {
  const strVal = String(val ?? "");
  const lower = strVal.toLowerCase();
  const fvLower = (fv ?? "").toLowerCase();
  const list = (fv ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const asDate = (x: any) => {
    const d = new Date(x);
    return isNaN(d.getTime()) ? null : d;
  };
  const dv = asDate(val);
  const df = asDate(fv);
  switch (operator) {
    case "equals": return lower === fvLower;
    case "not_equals": return lower !== fvLower;
    case "contains": return lower.includes(fvLower);
    case "does_not_contain": return !lower.includes(fvLower);
    case "starts_with": return lower.startsWith(fvLower);
    case "ends_with": return lower.endsWith(fvLower);
    case "in": return list.includes(lower);
    case "not_in": return !list.includes(lower);
    case "gt": return dv && df ? dv > df : Number(val) > Number(fv);
    case "lt": return dv && df ? dv < df : Number(val) < Number(fv);
    case "gte": return dv && df ? dv >= df : Number(val) >= Number(fv);
    case "lte": return dv && df ? dv <= df : Number(val) <= Number(fv);
    case "is_null": return val === null || val === undefined || strVal === "";
    case "is_not_null": return !(val === null || val === undefined || strVal === "");
    default: return true;
  }
}


function isTextCol(objectKey: string, fieldKey: string): boolean {
  const obj = getObjectByKey(objectKey);
  const f = obj?.fields.find((x) => x.key === fieldKey);
  return !f || f.type === "text";
}

export function ReportPreview({
  primaryObject,
  relatedObject,
  columns,
  groupRows,
  groupColumns,
  filters,
  chartType,
  displayOptions: displayOptionsProp,
  compact,
  widget: widgetProp,
}: Props) {
  const widget = mergeWidgetOptions(widgetProp);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const opts = displayOptionsProp || DEFAULT_DISPLAY_OPTIONS;
  const filterLogic = (opts.filter_logic || "").trim();
  const schemaReady = useReportSchema();

  useEffect(() => {
    if (!schemaReady) return;
    fetchData();
  }, [schemaReady, primaryObject, relatedObject, columns, groupRows, groupColumns, filters, filterLogic]);


  const fetchData = async () => {
    setLoading(true);
    setErrorMsg(null);
    const primaryObj = getObjectByKey(primaryObject);
    if (!primaryObj) { setLoading(false); return; }

    // Sanitize: drop any selected field that doesn't exist on the
    // current primary/related objects. This protects against stale saved
    // reports or leftover chips after switching objects.
    const allowed = [primaryObject, relatedObject].filter(Boolean);
    const allFieldKeys = [...new Set([...columns, ...groupRows, ...groupColumns])]
      .filter((fk) => isValidFieldKey(fk, allowed));

    const primaryValidFieldSet = new Set(primaryObj.fields.map((f) => f.key));
    // Expand virtual fields to their real DB column dependencies. Only keep
    // real columns in the actual SELECT — virtuals are computed in JS below.
    const expandToReal = (fieldKey: string): string[] => {
      if (!isVirtualField(fieldKey)) return [fieldKey];
      return virtualRealDeps(fieldKey);
    };
    const primaryRequested = allFieldKeys
      .filter((fk) => fk.startsWith(`${primaryObject}.`))
      .map((fk) => fk.split(".")[1]);
    const primaryNeedsDoctorName = primaryRequested.includes("_doctor_name");
    const primaryFieldKeys = Array.from(
      new Set(primaryRequested.flatMap(expandToReal))
    ).filter((k) => primaryValidFieldSet.has(k));
    // Pull the doctor FK so we can resolve names client-side as a fallback.
    if (primaryNeedsDoctorName) {
      const fk = DOCTOR_FK_BY_OBJECT[primaryObject];
      if (fk && primaryValidFieldSet.has(fk) && !primaryFieldKeys.includes(fk)) {
        primaryFieldKeys.push(fk);
      }
    }
    if (!primaryFieldKeys.includes("id")) primaryFieldKeys.push("id");

    if (allFieldKeys.length === 0) {
      primaryObj.fields.forEach((f) => {
        if (isVirtualField(f.key)) return;
        if (!primaryFieldKeys.includes(f.key)) primaryFieldKeys.push(f.key);
      });
    }

    const relatedObj = relatedObject ? getObjectByKey(relatedObject) : null;
    const relatedValidFieldSet = new Set(relatedObj?.fields.map((f) => f.key) || []);
    const relatedRequested = relatedObj
      ? allFieldKeys
          .filter((fk) => fk.startsWith(`${relatedObject}.`))
          .map((fk) => fk.split(".")[1])
      : [];
    const relatedNeedsDoctorName = relatedRequested.includes("_doctor_name");
    const relatedFieldKeys = Array.from(
      new Set(relatedRequested.flatMap(expandToReal))
    ).filter((k) => relatedValidFieldSet.has(k));
    if (relatedNeedsDoctorName && relatedObject) {
      const fk = DOCTOR_FK_BY_OBJECT[relatedObject];
      if (fk && relatedValidFieldSet.has(fk) && !relatedFieldKeys.includes(fk)) {
        relatedFieldKeys.push(fk);
      }
    }

    // Always select the columns referenced by filters so client-side
    // evaluation (filter logic / OR branches) has the data it needs.
    filters.forEach((f) => {
      const [objKey, col] = (f.field || "").split(".");
      if (!col) return;
      // Virtual fields (e.g. _month, _full_name) are computed client-side, so
      // pull in the real columns they depend on.
      const deps = isVirtualField(col) ? virtualRealDeps(col) : [col];
      deps.forEach((c) => {
        if (objKey === primaryObject && primaryValidFieldSet.has(c) && !primaryFieldKeys.includes(c)) {
          primaryFieldKeys.push(c);
        }
        if (objKey === relatedObject && relatedValidFieldSet.has(c) && !relatedFieldKeys.includes(c)) {
          relatedFieldKeys.push(c);
        }
      });
      if (col === "_doctor_name") {
        if (objKey === primaryObject) {
          const dfk = DOCTOR_FK_BY_OBJECT[primaryObject];
          if (dfk && primaryValidFieldSet.has(dfk) && !primaryFieldKeys.includes(dfk)) primaryFieldKeys.push(dfk);
        }
        if (objKey === relatedObject && relatedObject) {
          const dfk = DOCTOR_FK_BY_OBJECT[relatedObject];
          if (dfk && relatedValidFieldSet.has(dfk) && !relatedFieldKeys.includes(dfk)) relatedFieldKeys.push(dfk);
        }
      }
    });


    let selectStr = primaryFieldKeys.join(",");
    // Embed staff for primary-side doctor_name
    if (primaryNeedsDoctorName && DOCTOR_FK_BY_OBJECT[primaryObject]) {
      selectStr += `,staff(first_name,last_name)`;
    }
    let foreignKey = "";
    if (relatedObj && relatedObject) {
      const relation = primaryObj.relations?.find((r) => r.objectKey === relatedObject);
      if (relation) {
        foreignKey = relation.foreignKey;
        const relFields = relatedFieldKeys.length > 0
          ? relatedFieldKeys
          : relatedObj.fields.filter((f) => !isVirtualField(f.key)).map((f) => f.key);
        const relSelect = relatedNeedsDoctorName && DOCTOR_FK_BY_OBJECT[relatedObject]
          ? `${relFields.join(",")},staff(first_name,last_name)`
          : relFields.join(",");
        selectStr += `,${relatedObj.table}(${relSelect})`;
        // Only include the FK column in the primary select when it actually
        // exists on the primary table (i.e. primary is the "child" side of the
        // relation). For one-to-many where the FK lives on the related table,
        // Supabase resolves the embed via the FK on the related table itself.
        const fkOnPrimary = primaryValidFieldSet.has(foreignKey);
        if (fkOnPrimary && !primaryFieldKeys.includes(foreignKey)) {
          selectStr = `${foreignKey},${selectStr}`;
        }
      } else {
        const reverseRelation = relatedObj.relations?.find((r) => r.objectKey === primaryObject);
        if (reverseRelation) {
          const relFields = relatedFieldKeys.length > 0
            ? relatedFieldKeys
            : relatedObj.fields.filter((f) => !isVirtualField(f.key)).map((f) => f.key);
          const relSelect = relatedNeedsDoctorName && DOCTOR_FK_BY_OBJECT[relatedObject]
            ? `${relFields.join(",")},staff(first_name,last_name)`
            : relFields.join(",");
          selectStr += `,${relatedObj.table}(${relSelect})`;
        }
      }
    }

    let query = supabase.from(primaryObj.table as any).select(selectStr);
    // With custom filter logic (OR / grouping) everything is evaluated
    // client-side, so no server-side narrowing is applied.
    // Any filter on a computed/virtual field must be evaluated client-side; in
    // that case skip server narrowing entirely so nothing is lost.
    const hasVirtualFilter = filters.some((f) => {
      const c = (f.field || "").split(".")[1];
      return !!c && isVirtualField(c);
    });
    // Custom filter logic is normally evaluated client-side, but when the
    // expression is pure AND (no OR branches) every condition must hold, so
    // pushing them to the database is safe and keeps the query bounded.
    const logicIsAndOnly = !!filterLogic && !/\bOR\b/i.test(filterLogic);
    if ((!filterLogic || logicIsAndOnly) && !hasVirtualFilter) {
      filters
        .filter((f) => f.field.startsWith(`${primaryObject}.`))
        .filter((f) => {
          const c = f.field.split(".")[1];
          return primaryValidFieldSet.has(c) && !isVirtualField(c);
        })
        .forEach((f) => {
          const col = f.field.split(".")[1];
          const v = resolveFilterValue(f.value);
          const list = v.split(",").map((s) => s.trim()).filter(Boolean);
          switch (f.operator) {
            case "equals":
              // Case-insensitive match for text columns so "Active" == "active".
              query = isTextCol(primaryObject, col) ? query.ilike(col, v) : query.eq(col, v);
              break;
            case "not_equals":
              query = isTextCol(primaryObject, col) ? query.not(col, "ilike", v) : query.neq(col, v);
              break;
            case "contains": query = query.ilike(col, `%${v}%`); break;
            case "does_not_contain": query = query.not(col, "ilike", `%${v}%`); break;
            case "starts_with": query = query.ilike(col, `${v}%`); break;
            case "ends_with": query = query.ilike(col, `%${v}`); break;
            case "in": if (list.length) query = query.in(col, list); break;
            case "not_in": if (list.length) query = query.not(col, "in", `(${list.join(",")})`); break;
            case "gt": query = query.gt(col, v); break;
            case "lt": query = query.lt(col, v); break;
            case "gte": query = query.gte(col, v); break;
            case "lte": query = query.lte(col, v); break;
            case "is_null": query = query.is(col, null); break;
            case "is_not_null": query = query.not(col, "is", null); break;
          }
        });
    }


    query = query.limit(500);
    const { data: result, error } = await query;

    if (error) {
      console.error("Report query error:", error);
      const timedOut = (error as any)?.code === "57014" || /timeout/i.test(error.message || "");
      setErrorMsg(
        timedOut
          ? "This report took too long to run. Narrow the date range or add a filter, then try again."
          : error.message || "Failed to load report data."
      );
      setData([]);
      setLoading(false);
      return;
    }

    if (!result) { setData([]); setLoading(false); return; }

    const flattenedData = (result as any[]).map((row) => {
      const flat: any = {};
      for (const key of Object.keys(row)) {
        if (relatedObj && key === relatedObj.table) {
          const nested = row[key];
          if (nested && typeof nested === "object" && !Array.isArray(nested)) {
            for (const nk of Object.keys(nested)) flat[`__related__.${nk}`] = nested[nk];
            // Surface a doctor_name embedded under the related row.
            if (nested.staff && typeof nested.staff === "object" && !Array.isArray(nested.staff)) {
              const fn = nested.staff.first_name ?? "";
              const ln = nested.staff.last_name ?? "";
              flat[`__related__._doctor_name`] = `${fn} ${ln}`.trim() || null;
            }
          } else if (Array.isArray(nested) && nested.length > 0) {
            for (const nk of Object.keys(nested[0])) flat[`__related__.${nk}`] = nested[0][nk];
            const nestStaff = nested[0].staff;
            if (nestStaff && typeof nestStaff === "object" && !Array.isArray(nestStaff)) {
              const fn = nestStaff.first_name ?? "";
              const ln = nestStaff.last_name ?? "";
              flat[`__related__._doctor_name`] = `${fn} ${ln}`.trim() || null;
            }
          }
        } else if (key === "staff") {
          // Primary-side staff embed -> doctor_name
          const s = row[key];
          if (s && typeof s === "object" && !Array.isArray(s)) {
            const fn = s.first_name ?? "";
            const ln = s.last_name ?? "";
            flat["_doctor_name"] = `${fn} ${ln}`.trim() || null;
          }
        } else {
          flat[key] = row[key];
        }
      }
      // Derive _month / _full_name on primary side
      if (flat.created_at) flat["_month"] = monthBucket(flat.created_at);
      if (flat.first_name !== undefined || flat.last_name !== undefined) {
        flat["_full_name"] = `${flat.first_name ?? ""} ${flat.last_name ?? ""}`.trim();
      }
      // Derive _month on related side
      if (flat["__related__.created_at"]) {
        flat["__related__._month"] = monthBucket(flat["__related__.created_at"]);
      }
      return flat;
    });

    // Client-side evaluation. Related-object filters always run here; primary
    // filters also run here when custom filter logic is in play.
    const evalFilters = filters.filter((f) => {
      const [objKey, c] = (f.field || "").split(".");
      if (!c) return false;
      if (isVirtualField(c)) return true; // computed values -> always client-side
      if (objKey === relatedObject && relatedValidFieldSet.has(c)) return true;
      if (objKey === primaryObject && primaryValidFieldSet.has(c)) return !!filterLogic || hasVirtualFilter;
      return false;
    });

    let filteredData = flattenedData;
    if (evalFilters.length > 0) {
      // Filter logic numbering follows the full filter list, so map back.
      filteredData = flattenedData.filter((row) => {
        const results = filters.map((f) => {
          if (!evalFilters.includes(f)) return true;
          const [objKey, col] = f.field.split(".");
          const val = objKey === relatedObject ? row[`__related__.${col}`] : row[col];
          return matchesValue(val, f.operator, resolveFilterValue(f.value));
        });
        return evaluateFilterLogic(filterLogic, results);
      });
    }


    // ---- Aggregation pass ----
    // If any selected column / groupColumn is an aggregate AND we have group_rows,
    // collapse the rows into one row per group with computed aggregate values.
    const allRequested = [...columns, ...groupColumns];
    const hasAgg = allRequested.some((fk) => {
      const k = fk.split(".")[1];
      return k && isAggField(k);
    });
    if (hasAgg && groupRows.length > 0) {
      const groupKeys = groupRows; // array of fully-qualified field keys
      const keyFor = (row: any) =>
        groupKeys.map((gk) => String(row[resolveDataKeyStatic(gk)] ?? "")).join("||");
      const buckets = new Map<string, any[]>();
      filteredData.forEach((row) => {
        const k = keyFor(row);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k)!.push(row);
      });
      const aggregated: any[] = [];
      buckets.forEach((rows) => {
        const out: any = {};
        // Carry group keys
        groupKeys.forEach((gk) => {
          const dk = resolveDataKeyStatic(gk);
          out[dk] = rows[0][dk];
        });
        // Compute each aggregate column
        allRequested.forEach((fk) => {
          const [objKey, fieldKey] = fk.split(".");
          const agg = parseAgg(fieldKey);
          if (!agg) {
            // Carry through a representative value for non-agg, non-group cols
            const dk = resolveDataKeyStatic(fk);
            if (out[dk] === undefined) out[dk] = rows[0][dk];
            return;
          }
          const dk = resolveDataKeyStatic(fk);
          if (agg.fn === "count") {
            out[dk] = rows.length;
          } else if (agg.fn === "count_distinct") {
            const srcKey =
              objKey === primaryObject ? agg.col : `__related__.${agg.col}`;
            out[dk] = new Set(rows.map((r) => r[srcKey]).filter((v) => v !== null && v !== undefined)).size;
          } else {
            const srcKey =
              objKey === primaryObject ? agg.col : `__related__.${agg.col}`;
            const nums = rows
              .map((r) => Number(r[srcKey]))
              .filter((n) => !isNaN(n));
            if (nums.length === 0) {
              out[dk] = 0;
            } else if (agg.fn === "sum") {
              out[dk] = nums.reduce((a, b) => a + b, 0);
            } else if (agg.fn === "avg") {
              out[dk] = nums.reduce((a, b) => a + b, 0) / nums.length;
            } else if (agg.fn === "min") {
              out[dk] = Math.min(...nums);
            } else if (agg.fn === "max") {
              out[dk] = Math.max(...nums);
            }
          }
        });
        aggregated.push(out);
      });
      setData(aggregated);
    } else {
      setData(filteredData);
    }
    setLoading(false);
  };

  // Static helper duplicated from instance method so we can use it inside fetchData
  // without `this` ordering issues (fetchData is defined before `resolveDataKey`).
  function resolveDataKeyStatic(fk: string): string {
    const [objKey, fieldKey] = fk.split(".");
    if (objKey === primaryObject) return fieldKey;
    if (objKey === relatedObject) return `__related__.${fieldKey}`;
    return fieldKey;
  }

  const resolveDataKey = (fk: string): string => {
    const [objKey, fieldKey] = fk.split(".");
    if (objKey === primaryObject) return fieldKey;
    if (objKey === relatedObject) return `__related__.${fieldKey}`;
    return fieldKey;
  };

  const getFieldLabel = (fk: string) => {
    const [objKey, fieldKey] = fk.split(".");
    const obj = getObjectByKey(objKey);
    const field = obj?.fields.find((f) => f.key === fieldKey);
    if (!field) return fieldKey;
    if (relatedObject && obj) return `${obj.label} · ${field.label}`;
    return field.label;
  };

  const handleRecordClick = (record: any) => {
    const build = RECORD_URL_BUILDERS[primaryObject];
    const id = record?.id ?? record?.[`${primaryObject}.id`];
    if (build && id) {
      window.open(build(String(id)), "_blank", "noopener,noreferrer");
    }
  };

  const formatVal = (val: any) => {
    if (val === null || val === undefined) return "—";
    if (typeof val === "boolean") return val ? "Yes" : "No";
    if (typeof val === "number") return val.toLocaleString("en-IN");
    if (String(val).match(/^\d{4}-\d{2}-\d{2}/)) {
      try {
        return new Date(val).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      } catch { return String(val); }
    }
    return String(val);
  };

  const isNumericField = (fk: string) => {
    const [objKey, fieldKey] = fk.split(".");
    const obj = getObjectByKey(objKey);
    return obj?.fields.find((f) => f.key === fieldKey)?.type === "number";
  };

  const sumColumn = (rows: any[], fk: string) => {
    const dataKey = resolveDataKey(fk);
    return rows.reduce((s, r) => s + (Number(r[dataKey]) || 0), 0);
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading report data...</div>;
  }

  if (errorMsg) {
    return (
      <div className="text-sm py-8 text-center space-y-1">
        <div className="text-destructive font-medium">Couldn't load report data</div>
        <div className="text-xs text-muted-foreground">
          Some selected fields may no longer exist on the chosen objects. Try editing the report and re-adding the fields.
        </div>
        <div className="text-[11px] text-muted-foreground/80 italic">{errorMsg}</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        No records found. Try adjusting your filters or selecting different fields.
      </div>
    );
  }

  const allDisplayCols = columns.length > 0 ? columns : [];
  const groupRowFields = groupRows;
  const groupColFields = groupColumns;

  const groupField = groupRowFields.length > 0 ? resolveDataKey(groupRowFields[0]) : null;
  const groupField2 = groupRowFields.length > 1 ? resolveDataKey(groupRowFields[1]) : null;
  const groupColField = groupColFields.length > 0 ? resolveDataKey(groupColFields[0]) : null;

  const numericCols = [...columns, ...groupColumns].filter((c) => isNumericField(c));

  const buildChartData = () => {
    if (!groupField) return [];
    const grouped: Record<string, any> = {};
    data.forEach((row) => {
      const key = String(row[groupField] || "N/A");
      if (!grouped[key]) grouped[key] = { name: key, count: 0 };
      grouped[key].count += 1;
      numericCols.forEach((nc) => {
        const dataKey = resolveDataKey(nc);
        grouped[key][dataKey] = (grouped[key][dataKey] || 0) + (Number(row[dataKey]) || 0);
      });
    });
    return Object.values(grouped);
  };

  let chartNode: React.ReactNode = null;

  // Number summary
  if (chartType === "number") {
    const total = data.length;
    if (widgetProp) {
      const measure = widget.measure && widget.measure !== "record_count" ? widget.measure : null;
      const value = measure
        ? data.reduce((s, r) => s + (Number(r[resolveDataKey(measure)]) || 0), 0)
        : total;
      const label = measure ? getFieldLabel(measure) : "Record Count";
      chartNode = (
        <div className="flex flex-col items-center justify-center py-4">
          <div className="font-display font-bold text-primary leading-none text-[clamp(2rem,7vw,4rem)]">
            {formatMetric(value, widget)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-2 uppercase tracking-wide">{label}</div>
        </div>
      );
    } else {
    const sums = numericCols.map((nc) => {
      const dataKey = resolveDataKey(nc);
      const sum = data.reduce((s, r) => s + (Number(r[dataKey]) || 0), 0);
      return { label: getFieldLabel(nc), sum };
    });
    chartNode = (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="data-table p-4 text-center">
          <div className="text-3xl font-display font-bold text-primary">{total}</div>
          <div className="text-xs text-muted-foreground mt-1">Total Records</div>
        </div>
        {sums.map((s) => (
          <div key={s.label} className="data-table p-4 text-center">
            <div className="text-3xl font-display font-bold text-foreground">{s.sum.toLocaleString("en-IN")}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
          </div>
        ))}
      </div>
      );
    }
  }

  // Charts
  if (chartType !== "table" && chartType !== "number" && groupField) {
    const valueKey = numericCols.length > 0 ? resolveDataKey(numericCols[0]) : "count";
    const chartData = applyWidgetShaping(buildChartData() as any[], valueKey, widget);
    const height = compact ? 200 : 350;

    if (chartType === "bar") {
      chartNode = (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey={valueKey} fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }
    if (chartType === "hbar") {
      chartNode = (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey={valueKey} fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }
    if (chartType === "doughnut") {
      const legendPos = widget.legend_position || "bottom";
      chartNode = (
        <div className={legendPos === "right" ? "flex flex-row items-center gap-2" : "flex flex-col items-center"}>
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" innerRadius={compact ? 40 : 60} outerRadius={compact ? 70 : 100} paddingAngle={3} dataKey={valueKey} nameKey="name">
                {chartData.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div
            className={
              legendPos === "none"
                ? "hidden"
                : legendPos === "right"
                  ? "flex flex-col gap-1.5 shrink-0"
                  : "flex flex-wrap gap-3 justify-center mt-2"
            }
          >
            {chartData.map((item, i) => (
              <div key={item.name} className="flex items-center gap-1.5 text-xs">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-muted-foreground">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    if (chartType === "line") {
      chartNode = (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey={valueKey} stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ fill: "hsl(var(--primary))", r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      );
    }
  }

  // TABLE VIEW — always rendered, below the chart when one is selected.
  const renderTable = (): React.ReactNode => {
  const displayCols = allDisplayCols.length > 0 ? allDisplayCols : groupRowFields;
  const finalDisplayCols = displayCols.length > 0
    ? displayCols
    : (getObjectByKey(primaryObject)?.fields.slice(0, 6).map((f) => `${primaryObject}.${f.key}`) || []);

  const numericDisplayCols = finalDisplayCols.filter((c) => isNumericField(c));

  // Matrix report
  if (groupField && groupColField && chartType === "table") {
    const colValues = [...new Set(data.map((r) => String(r[groupColField] || "N/A")))].sort();
    const groupLabel = getFieldLabel(groupRowFields[0]);

    const grouped: Record<string, Record<string, any[]>> = {};
    data.forEach((row) => {
      const g1 = String(row[groupField] || "N/A");
      const g2 = groupField2 ? String(row[groupField2] || "N/A") : "__all__";
      if (!grouped[g1]) grouped[g1] = {};
      if (!grouped[g1][g2]) grouped[g1][g2] = [];
      grouped[g1][g2].push(row);
    });

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-border rounded overflow-hidden">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left py-1.5 px-3 text-[11px] font-semibold text-muted-foreground">{groupLabel}</th>
              {groupField2 && (
                <th className="text-left py-1.5 px-3 text-[11px] font-semibold text-muted-foreground">
                  {getFieldLabel(groupRowFields[1])}
                </th>
              )}
              {colValues.map((cv) => (
                <th key={cv} className="text-center py-1.5 px-3 text-[11px] font-semibold text-muted-foreground">{cv}</th>
              ))}
              <th className="text-center py-1.5 px-3 text-[11px] font-semibold text-primary">Total</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([g1Key, subGroups]) => {
              if (!groupField2) {
                const allRows = Object.values(subGroups).flat();
                return (
                  <tr key={g1Key} className="border-b border-border/50 hover:bg-accent/20">
                    <td className="py-1.5 px-3 text-xs font-medium">{g1Key}</td>
                    {colValues.map((cv) => {
                      const count = allRows.filter((r) => String(r[groupColField] || "N/A") === cv).length;
                      return <td key={cv} className="py-1.5 px-3 text-xs text-center">{count || "—"}</td>;
                    })}
                    <td className="py-1.5 px-3 text-xs text-center font-semibold text-primary">{allRows.length}</td>
                  </tr>
                );
              }
              const subEntries = Object.entries(subGroups);
              return subEntries.map(([g2Key, rows], si) => (
                <tr key={`${g1Key}-${g2Key}`} className="border-b border-border/50 hover:bg-accent/20">
                  {si === 0 ? (
                    <td rowSpan={subEntries.length} className="py-1.5 px-3 text-xs font-semibold bg-muted/20 border-r border-border/50 align-top">
                      {g1Key}
                    </td>
                  ) : null}
                  <td className="py-1.5 px-3 text-xs">{g2Key}</td>
                  {colValues.map((cv) => {
                    const count = rows.filter((r) => String(r[groupColField] || "N/A") === cv).length;
                    return <td key={cv} className="py-1.5 px-3 text-xs text-center">{count || "—"}</td>;
                  })}
                  <td className="py-1.5 px-3 text-xs text-center font-semibold text-primary">{rows.length}</td>
                </tr>
              ));
            })}
            {opts.show_grand_total && (
              <tr className="bg-muted/30 font-semibold">
                <td className="py-1.5 px-3 text-xs" colSpan={groupField2 ? 2 : 1}>Grand Total</td>
                {colValues.map((cv) => {
                  const count = data.filter((r) => String(r[groupColField] || "N/A") === cv).length;
                  return <td key={cv} className="py-1.5 px-3 text-xs text-center">{count}</td>;
                })}
                <td className="py-1.5 px-3 text-xs text-center text-primary">{data.length}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  // Excel-style grouped rows
  if (groupField && chartType === "table") {
    const groupLabel = getFieldLabel(groupRowFields[0]);

    type GroupNode = { rows: any[]; subGroups?: Record<string, GroupNode> };
    const buildGroups = (): Record<string, GroupNode> => {
      const result: Record<string, GroupNode> = {};
      data.forEach((row) => {
        const g1 = String(row[groupField] || "N/A");
        if (!result[g1]) result[g1] = { rows: [], subGroups: groupField2 ? {} : undefined };
        if (groupField2 && result[g1].subGroups) {
          const g2 = String(row[groupField2] || "N/A");
          if (!result[g1].subGroups![g2]) result[g1].subGroups![g2] = { rows: [] };
          result[g1].subGroups![g2].rows.push(row);
        }
        result[g1].rows.push(row);
      });
      return result;
    };

    const grouped = buildGroups();
    let groupCounter = 0;

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-border rounded overflow-hidden">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left py-1.5 px-3 text-[11px] font-semibold text-muted-foreground w-10">#</th>
              <th className="text-left py-1.5 px-3 text-[11px] font-semibold text-muted-foreground">{groupLabel}</th>
              {groupField2 && (
                <th className="text-left py-1.5 px-3 text-[11px] font-semibold text-muted-foreground">
                  {getFieldLabel(groupRowFields[1])}
                </th>
              )}
              {finalDisplayCols.map((c) => (
                <th key={c} className="text-left py-1.5 px-3 text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                  {getFieldLabel(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([g1Key, node]) => {
              groupCounter++;
              const currentGroupNum = groupCounter;
              const rowLimit = compact ? (groupField2 ? 3 : 5) : 50;
              const showSub = opts.show_subtotals && numericDisplayCols.length > 0;

              if (groupField2 && node.subGroups) {
                const subEntries = Object.entries(node.subGroups);
                // total rows the merged G1 cell spans
                const g1Span = subEntries.reduce((s, [, sn]) => {
                  const vis = Math.min(sn.rows.length, rowLimit);
                  return s + vis + (showSub ? 1 : 0);
                }, 0);
                let emittedG1Cell = false;
                let subCounter = 0;

                return (
                  <React.Fragment key={`g1-${g1Key}`}>
                    {subEntries.map(([g2Key, subNode]) => {
                      subCounter++;
                      const visRows = subNode.rows.slice(0, rowLimit);
                      const g2Span = visRows.length;
                      return (
                        <React.Fragment key={`g2-${g1Key}-${g2Key}`}>
                          {visRows.map((row, ri) => {
                            const cells: JSX.Element[] = [];
                            if (!emittedG1Cell) {
                              emittedG1Cell = true;
                              cells.push(
                                <td
                                  key="gnum"
                                  rowSpan={g1Span}
                                  className="py-1.5 px-3 text-xs font-bold text-primary align-top bg-primary/5 border-r border-border"
                                >
                                  G{currentGroupNum}
                                </td>
                              );
                              cells.push(
                                <td
                                  key="g1"
                                  rowSpan={g1Span}
                                  className="py-1.5 px-3 text-xs font-semibold text-foreground align-top bg-primary/5 border-r border-border whitespace-nowrap"
                                >
                                  {g1Key}
                                  {opts.show_row_counts && (
                                    <span className="text-[9px] ml-2 text-muted-foreground">({node.rows.length})</span>
                                  )}
                                </td>
                              );
                            }
                            if (ri === 0) {
                              cells.push(
                                <td
                                  key="g2"
                                  rowSpan={g2Span}
                                  className="py-1 px-3 text-[11px] font-medium text-foreground align-top bg-muted/20 border-r border-border/50 whitespace-nowrap"
                                >
                                  {g2Key}
                                  {opts.show_row_counts && (
                                    <span className="text-[9px] ml-2 text-muted-foreground">({subNode.rows.length})</span>
                                  )}
                                </td>
                              );
                            }
                            return (
                              <tr
                                key={`row-${g1Key}-${g2Key}-${ri}`}
                                className="border-b border-border/30 hover:bg-accent/20 cursor-pointer transition-colors"
                                onClick={() => handleRecordClick(row)}
                              >
                                {cells}
                                {finalDisplayCols.map((c) => (
                                  <td key={c} className="py-1 px-3 whitespace-nowrap text-xs">
                                    <span className="text-primary underline cursor-pointer">{formatVal(row[resolveDataKey(c)])}</span>
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                          {showSub && (
                            <tr className="bg-muted/10 border-b border-border/30">
                              <td className="py-1 px-3 text-[10px] font-semibold text-muted-foreground border-r border-border/50">
                                Subtotal
                              </td>
                              {finalDisplayCols.map((c) => (
                                <td key={c} className="py-1 px-3 text-[10px] font-semibold text-muted-foreground">
                                  {isNumericField(c) ? formatVal(sumColumn(subNode.rows, c)) : ""}
                                </td>
                              ))}
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {showSub && (
                      <tr className="bg-primary/5 border-b border-border">
                        <td className="py-1 px-3" colSpan={3}>
                          <span className="text-[10px] font-semibold text-primary">Subtotal — {g1Key}</span>
                        </td>
                        {finalDisplayCols.map((c) => (
                          <td key={c} className="py-1 px-3 text-[10px] font-bold text-primary">
                            {isNumericField(c) ? formatVal(sumColumn(node.rows, c)) : ""}
                          </td>
                        ))}
                      </tr>
                    )}
                  </React.Fragment>
                );
              }

              // Single-level group — merged group cell across its rows
              const visRows = node.rows.slice(0, rowLimit);
              const span = visRows.length;
              return (
                <React.Fragment key={`g1-${g1Key}`}>
                  {visRows.map((row, ri) => (
                    <tr
                      key={`row-${g1Key}-${ri}`}
                      className="border-b border-border/30 hover:bg-accent/20 cursor-pointer transition-colors"
                      onClick={() => handleRecordClick(row)}
                    >
                      {ri === 0 && (
                        <>
                          <td
                            rowSpan={span}
                            className="py-1.5 px-3 text-xs font-bold text-primary align-top bg-primary/5 border-r border-border"
                          >
                            G{currentGroupNum}
                          </td>
                          <td
                            rowSpan={span}
                            className="py-1.5 px-3 text-xs font-semibold text-foreground align-top bg-primary/5 border-r border-border whitespace-nowrap"
                          >
                            {g1Key}
                            {opts.show_row_counts && (
                              <span className="text-[9px] ml-2 text-muted-foreground">({node.rows.length})</span>
                            )}
                          </td>
                        </>
                      )}
                      {finalDisplayCols.map((c) => (
                        <td key={c} className="py-1 px-3 whitespace-nowrap text-xs">
                          <span className="text-primary underline cursor-pointer">{formatVal(row[resolveDataKey(c)])}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                  {showSub && (
                    <tr className="bg-primary/5 border-b border-border">
                      <td className="py-1 px-3" colSpan={2}>
                        <span className="text-[10px] font-semibold text-primary">Subtotal</span>
                      </td>
                      {finalDisplayCols.map((c) => (
                        <td key={c} className="py-1 px-3 text-[10px] font-bold text-primary">
                          {isNumericField(c) ? formatVal(sumColumn(node.rows, c)) : ""}
                        </td>
                      ))}
                    </tr>
                  )}
                  {node.rows.length > rowLimit && (
                    <tr>
                      <td colSpan={finalDisplayCols.length + 2} className="text-xs text-muted-foreground text-center py-1">
                        +{node.rows.length - rowLimit} more
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {opts.show_grand_total && (
              <tr className="bg-muted/30 font-semibold">
                <td className="py-1.5 px-3 text-xs" colSpan={groupField2 ? 3 : 2}>Grand Total</td>
                {finalDisplayCols.map((c) => (
                  <td key={c} className="py-1.5 px-3 text-xs font-bold text-primary">
                    {isNumericField(c) ? formatVal(sumColumn(data, c)) : ""}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
        <div className="text-xs text-muted-foreground text-center mt-2">
          {Object.keys(grouped).length} groups · {data.length} total records
        </div>
      </div>
    );
  }

  // Flat table (no grouping)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {finalDisplayCols.map((c) => (
              <th key={c} className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                {getFieldLabel(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, compact ? 10 : 100).map((row, i) => (
            <tr
              key={row.id || i}
              className="border-b border-border/50 hover:bg-accent/20 cursor-pointer transition-colors"
              onClick={() => handleRecordClick(row)}
            >
              {finalDisplayCols.map((c) => (
                <td key={c} className="py-2 px-3 whitespace-nowrap">
                  <span className="text-primary underline cursor-pointer">{formatVal(row[resolveDataKey(c)])}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {opts.show_grand_total && numericDisplayCols.length > 0 && (
          <tfoot>
            <tr className="bg-muted/30 font-semibold border-t border-border">
              {finalDisplayCols.map((c) => (
                <td key={c} className="py-2 px-3 text-xs font-bold text-primary">
                  {isNumericField(c) ? formatVal(sumColumn(data, c)) : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {data.length > (compact ? 10 : 100) && (
        <p className="text-xs text-muted-foreground py-2 text-center">
          Showing {compact ? 10 : 100} of {data.length} records
        </p>
      )}
    </div>
  );
  };

  // Dashboard widgets show only the visual, never the raw table underneath
  // (unless the widget itself is a tabular one).
  if (widgetProp && chartType !== "table") {
    return <div className="space-y-2">{chartNode}</div>;
  }

  return (
    <div className="space-y-4">
      {chartNode}
      {renderTable()}
    </div>
  );
}
