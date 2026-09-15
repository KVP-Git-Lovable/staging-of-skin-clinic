import { useMemo } from "react";
import { useCustomFields, useCustomFieldSections } from "@/lib/custom-fields/api";
import { CustomField } from "@/lib/custom-fields/types";
import { CustomFieldInput } from "./CustomFieldInput";

interface Props {
  objectKey: string;
  values: Record<string, any>;
  onChange: (columnName: string, value: any) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}

/**
 * Drop this into any record form to render all admin-configured custom fields.
 * `values` / `onChange` operate on the real column names (cf_*).
 */
export function CustomFieldsRenderer({ objectKey, values, onChange, errors, disabled }: Props) {
  const { data: sections = [] } = useCustomFieldSections(objectKey);
  const { data: fields = [] } = useCustomFields(objectKey, true);

  const grouped = useMemo(() => {
    const map = new Map<string, CustomField[]>();
    for (const f of fields) {
      const key = f.section_id ?? "__none__";
      map.set(key, [...(map.get(key) ?? []), f]);
    }
    return map;
  }, [fields]);

  if (fields.length === 0) return null;

  const blocks = [
    ...sections.map((s) => ({ id: s.id, name: s.name, columns: s.column_count, fields: grouped.get(s.id) ?? [] })),
    { id: "__none__", name: "Additional Information", columns: 2, fields: grouped.get("__none__") ?? [] },
  ].filter((b) => b.fields.length > 0);

  return (
    <div className="space-y-6">
      {blocks.map((block) => (
        <div key={block.id} className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">{block.name}</h4>
          <div
            className={`grid gap-4 ${block.columns === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}
          >
            {block.fields.map((f) => (
              <CustomFieldInput
                key={f.id}
                field={f}
                value={values[f.column_name]}
                onChange={(v) => onChange(f.column_name, v)}
                error={errors?.[f.column_name]}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Validates required custom fields. Returns a map of column_name -> error. */
export function validateCustomFields(fields: CustomField[], values: Record<string, any>) {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (!f.is_required || !f.is_active) continue;
    const v = values[f.column_name];
    const empty =
      v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    if (empty) errors[f.column_name] = `${f.label} is required`;
  }
  return errors;
}