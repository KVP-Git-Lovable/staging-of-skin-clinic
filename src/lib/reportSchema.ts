import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { REPORT_OBJECTS, type ReportField } from "@/lib/reportObjects";

/**
 * The report catalog (reportObjects.ts) ships a curated list of fields per
 * object. That list goes stale the moment a new column (or a Custom Field)
 * is added to the database, so we merge the *real* table columns in at
 * runtime. Every real column becomes selectable as a report column, a row /
 * column grouping and a filter — automatically.
 */

let loadPromise: Promise<boolean> | null = null;
let loaded = false;

/** Columns that are noise in a report picker. */
const HIDDEN_COLUMNS = new Set([
  "search_vector",
  "password",
  "pdf_url",
]);

/** Nicer labels than the auto-generated ones. */
const LABEL_OVERRIDES: Record<string, string> = {
  "invoices.created_at": "Invoice Date",
  "invoices.due_date": "Due Date",
  "appointments.start_time": "Appointment Date/Time",
  "procedures.created_at": "Created Date",
};

const humanize = (col: string): string =>
  col
    .replace(/^cf_/, "")
    .split("_")
    .filter(Boolean)
    .map((w) => (w.length <= 3 && w === w.toLowerCase() && ["id", "gst", "hsn", "nps", "amc", "mrp", "sf"].includes(w)
      ? w.toUpperCase()
      : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

const mapType = (dataType: string): ReportField["type"] => {
  const t = (dataType || "").toLowerCase();
  if (t.includes("bool")) return "boolean";
  if (
    t.includes("int") ||
    t.includes("numeric") ||
    t.includes("decimal") ||
    t.includes("real") ||
    t.includes("double")
  )
    return "number";
  if (t.includes("date") || t.includes("time")) return "date";
  return "text";
};

/** Loads real DB columns once and merges them into REPORT_OBJECTS in place. */
export function loadReportSchema(): Promise<boolean> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const { data, error } = await supabase.rpc("get_report_fields" as any);
      if (error || !Array.isArray(data)) return false;

      const byTable = new Map<string, { column_name: string; data_type: string }[]>();
      (data as any[]).forEach((row) => {
        const list = byTable.get(row.table_name) || [];
        list.push({ column_name: row.column_name, data_type: row.data_type });
        byTable.set(row.table_name, list);
      });

      REPORT_OBJECTS.forEach((obj) => {
        const cols = byTable.get(obj.table);
        if (!cols) return;
        const known = new Set(obj.fields.map((f) => f.key));
        const extra: ReportField[] = cols
          .filter((c) => !known.has(c.column_name) && !HIDDEN_COLUMNS.has(c.column_name))
          .map((c) => ({
            key: c.column_name,
            label:
              LABEL_OVERRIDES[`${obj.key}.${c.column_name}`] ||
              humanize(c.column_name) +
                (c.column_name.startsWith("cf_") ? " (Custom)" : ""),
            type: mapType(c.data_type),
          }));

        // Apply label overrides to curated fields too (e.g. Invoice Date).
        obj.fields.forEach((f) => {
          const override = LABEL_OVERRIDES[`${obj.key}.${f.key}`];
          if (override) f.label = override;
        });

        const real = obj.fields.filter((f) => !f.key.startsWith("_"));
        const virtual = obj.fields.filter((f) => f.key.startsWith("_"));
        obj.fields = [...real, ...extra, ...virtual];
      });

      loaded = true;
      return true;
    } catch {
      return false;
    }
  })();
  return loadPromise;
}

/** True once the live column list has been merged into the catalog. */
export function useReportSchema(): boolean {
  const [ready, setReady] = useState(loaded);
  useEffect(() => {
    if (loaded) return;
    let alive = true;
    loadReportSchema().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}
