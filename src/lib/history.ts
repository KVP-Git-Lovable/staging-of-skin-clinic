import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { REPORT_OBJECTS } from "@/lib/reportObjects";

export const MAX_TRACKED_FIELDS = 20;

/** Objects that support system-record auditing and field history. */
export const HISTORY_OBJECTS = [
  { key: "patients", label: "Patients" },
  { key: "appointments", label: "Appointments" },
  { key: "procedures", label: "Procedures" },
  { key: "invoices", label: "Invoices" },
  { key: "services", label: "Services" },
  { key: "pharma_products", label: "Pharmacy Products" },
  { key: "pharma_bills", label: "Pharmacy Bills" },
  { key: "expenses", label: "Expenses" },
  { key: "assets", label: "Assets" },
  { key: "vendors", label: "Vendors" },
  { key: "staff", label: "Staff" },
  { key: "doctors", label: "Doctors" },
  { key: "campaigns", label: "Campaigns" },
  { key: "prescriptions", label: "Prescriptions" },
  { key: "tax_master", label: "Tax Master" },
  { key: "hsn_tax_master", label: "HSN Tax Master" },
  { key: "survey_templates", label: "Survey Templates" },
];

export interface HistoryConfig {
  object_key: string;
  is_enabled: boolean;
  tracked_fields: string[];
}

export interface FieldHistoryRow {
  id: string;
  object_type: string;
  record_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string;
}

/** Selectable fields for an object (report metadata first, sensible fallback otherwise). */
export function fieldsForObject(objectKey: string): { key: string; label: string }[] {
  const obj = REPORT_OBJECTS.find((o) => o.key === objectKey);
  if (obj) return obj.fields.filter((f) => !f.key.startsWith("_")).map((f) => ({ key: f.key, label: f.label }));
  return [];
}

export const humanizeField = (name: string) =>
  name.replace(/^cf_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function useHistoryConfigs() {
  return useQuery({
    queryKey: ["history-configs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("history_tracking_config").select("*");
      if (error) throw error;
      return (data ?? []) as HistoryConfig[];
    },
  });
}

export function useSaveHistoryConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cfg: HistoryConfig) => {
      const { error } = await supabase
        .from("history_tracking_config")
        .upsert(
          {
            object_key: cfg.object_key,
            is_enabled: cfg.is_enabled,
            tracked_fields: cfg.tracked_fields.slice(0, MAX_TRACKED_FIELDS),
          },
          { onConflict: "object_key" }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["history-configs"] }),
  });
}

export function useFieldHistory(objectType: string, recordId?: string | null) {
  return useQuery({
    queryKey: ["field-history", objectType, recordId],
    enabled: !!recordId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("field_history")
        .select("*")
        .eq("object_type", objectType)
        .eq("record_id", recordId as string)
        .order("changed_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as FieldHistoryRow[];
    },
  });
}

/** Resolves auth user ids to a friendly staff name (falls back to short id). */
export function useUserNames(ids: (string | null | undefined)[]) {
  const clean = Array.from(new Set(ids.filter(Boolean) as string[]));
  return useQuery({
    queryKey: ["user-names", clean.sort().join(",")],
    enabled: clean.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select("auth_user_id, first_name, last_name")
        .in("auth_user_id", clean);
      const map: Record<string, string> = {};
      for (const s of data ?? []) {
        if (s.auth_user_id) map[s.auth_user_id] = `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim();
      }
      return map;
    },
  });
}
