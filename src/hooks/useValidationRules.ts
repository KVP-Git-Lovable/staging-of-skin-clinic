import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { runValidations, ValidationMessage, ValidationRule } from "@/lib/validation/engine";
import { useCallback } from "react";

export function useValidationRules(objectKey: string | null) {
  return useQuery({
    queryKey: ["validation-rules", objectKey],
    enabled: !!objectKey,
    queryFn: async (): Promise<ValidationRule[]> => {
      const { data, error } = await (supabase as any)
        .from("validation_rules")
        .select("*")
        .eq("object_key", objectKey)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as ValidationRule[];
    },
  });
}

export function useAllValidationRules() {
  return useQuery({
    queryKey: ["validation-rules", "all"],
    queryFn: async (): Promise<ValidationRule[]> => {
      const { data, error } = await (supabase as any)
        .from("validation_rules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ValidationRule[];
    },
  });
}

/** Returns a validate(record) function for a given object. */
export function useValidator(objectKey: string) {
  const { data: rules = [] } = useValidationRules(objectKey);
  return useCallback(
    (record: Record<string, any>, context: { isEdit?: boolean } = {}): ValidationMessage[] =>
      runValidations(rules, record, context),
    [rules],
  );
}