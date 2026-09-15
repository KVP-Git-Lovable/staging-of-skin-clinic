import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CustomField,
  CustomFieldSection,
  getFieldTypeMeta,
} from "./types";

const client = supabase as any;

export function useCustomFieldSections(objectKey: string) {
  return useQuery({
    queryKey: ["custom-field-sections", objectKey],
    queryFn: async () => {
      const { data, error } = await client
        .from("custom_field_sections")
        .select("*")
        .eq("object_key", objectKey)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as CustomFieldSection[];
    },
    enabled: !!objectKey,
  });
}

export function useCustomFields(objectKey: string, onlyActive = false) {
  return useQuery({
    queryKey: ["custom-fields", objectKey, onlyActive],
    queryFn: async () => {
      let q = client
        .from("custom_fields")
        .select("*")
        .eq("object_key", objectKey)
        .order("display_order");
      if (onlyActive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((f) => ({
        ...f,
        options: Array.isArray(f.options) ? f.options : [],
      })) as CustomField[];
    },
    enabled: !!objectKey,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, objectKey: string) {
  qc.invalidateQueries({ queryKey: ["custom-fields", objectKey] });
  qc.invalidateQueries({ queryKey: ["custom-field-sections", objectKey] });
}

export function useSaveSection(objectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (section: Partial<CustomFieldSection> & { name: string }) => {
      const payload = {
        object_key: objectKey,
        name: section.name,
        description: section.description ?? null,
        column_count: section.column_count ?? 2,
        display_order: section.display_order ?? 0,
      };
      if (section.id) {
        const { error } = await client.from("custom_field_sections").update(payload).eq("id", section.id);
        if (error) throw error;
      } else {
        const { error } = await client.from("custom_field_sections").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate(qc, objectKey),
  });
}

export function useDeleteSection(objectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.from("custom_field_sections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, objectKey),
  });
}

export function useSaveField(objectKey: string, table: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (field: Partial<CustomField> & { label: string; field_type: any; column_name: string }) => {
      const meta = getFieldTypeMeta(field.field_type);
      const payload = {
        object_key: objectKey,
        section_id: field.section_id ?? null,
        column_name: field.column_name,
        label: field.label,
        field_type: field.field_type,
        options: field.options ?? [],
        is_required: field.is_required ?? false,
        is_active: field.is_active ?? true,
        default_value: field.default_value ?? null,
        help_text: field.help_text ?? null,
        placeholder: field.placeholder ?? null,
        max_length: field.max_length ?? null,
        decimal_places: field.decimal_places ?? null,
        display_order: field.display_order ?? 0,
      };

      if (field.id) {
        const { error } = await client.from("custom_fields").update(payload).eq("id", field.id);
        if (error) throw error;
        return;
      }

      // New field: create the real DB column first, then register it.
      const { error: ddlError } = await client.rpc("add_custom_field_column", {
        _table: table,
        _column: field.column_name,
        _sql_type: meta.sqlType,
      });
      if (ddlError) throw ddlError;

      const { error } = await client.from("custom_fields").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, objectKey),
  });
}

export function useDeleteField(objectKey: string, table: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, columnName, dropColumn }: { id: string; columnName: string; dropColumn: boolean }) => {
      const { error } = await client.from("custom_fields").delete().eq("id", id);
      if (error) throw error;
      if (dropColumn) {
        const { error: ddlError } = await client.rpc("drop_custom_field_column", {
          _table: table,
          _column: columnName,
        });
        if (ddlError) throw ddlError;
      }
    },
    onSuccess: () => invalidate(qc, objectKey),
  });
}

export function useReorderFields(objectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: { id: string; section_id: string | null; display_order: number }[]) => {
      for (const u of updates) {
        const { error } = await client
          .from("custom_fields")
          .update({ section_id: u.section_id, display_order: u.display_order })
          .eq("id", u.id);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate(qc, objectKey),
  });
}