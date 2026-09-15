/**
 * Custom Fields — portable core types.
 * Drop `src/lib/custom-fields` + `src/components/custom-fields` into any org,
 * run the matching migration, and adjust CUSTOM_FIELD_OBJECTS below.
 */

export type CustomFieldType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "url"
  | "picklist"
  | "multiselect"
  | "number"
  | "decimal"
  | "currency"
  | "percent"
  | "date"
  | "datetime"
  | "checkbox";

export interface CustomFieldTypeMeta {
  type: CustomFieldType;
  label: string;
  /** lucide-react icon name */
  icon: string;
  sqlType: "text" | "text[]" | "integer" | "numeric" | "boolean" | "date" | "timestamptz";
  hasOptions?: boolean;
  hasLength?: boolean;
  hasDecimals?: boolean;
}

export const CUSTOM_FIELD_TYPES: CustomFieldTypeMeta[] = [
  { type: "text", label: "Single Line", icon: "Minus", sqlType: "text", hasLength: true },
  { type: "textarea", label: "Multi-Line", icon: "AlignLeft", sqlType: "text", hasLength: true },
  { type: "email", label: "Email", icon: "Mail", sqlType: "text" },
  { type: "phone", label: "Phone", icon: "Phone", sqlType: "text" },
  { type: "picklist", label: "Pick List", icon: "List", sqlType: "text", hasOptions: true },
  { type: "multiselect", label: "Multi-Select", icon: "ListChecks", sqlType: "text[]", hasOptions: true },
  { type: "date", label: "Date", icon: "Calendar", sqlType: "date" },
  { type: "datetime", label: "Date/Time", icon: "CalendarClock", sqlType: "timestamptz" },
  { type: "number", label: "Number", icon: "Hash", sqlType: "integer" },
  { type: "decimal", label: "Decimal", icon: "Percent", sqlType: "numeric", hasDecimals: true },
  { type: "currency", label: "Currency", icon: "IndianRupee", sqlType: "numeric", hasDecimals: true },
  { type: "percent", label: "Percent", icon: "Percent", sqlType: "numeric", hasDecimals: true },
  { type: "checkbox", label: "Checkbox", icon: "CheckSquare", sqlType: "boolean" },
  { type: "url", label: "URL", icon: "Link", sqlType: "text" },
];

export function getFieldTypeMeta(type: string): CustomFieldTypeMeta {
  return CUSTOM_FIELD_TYPES.find((t) => t.type === type) ?? CUSTOM_FIELD_TYPES[0];
}

export interface CustomFieldObject {
  key: string;
  label: string;
  table: string;
}

/** Objects that support custom fields. Must match the DB helper whitelist. */
export const CUSTOM_FIELD_OBJECTS: CustomFieldObject[] = [
  { key: "patients", label: "Patients", table: "patients" },
  { key: "appointments", label: "Appointments", table: "appointments" },
  { key: "procedures", label: "Procedures", table: "procedures" },
  { key: "invoices", label: "Invoices", table: "invoices" },
  { key: "pharma_products", label: "Pharma Products", table: "pharma_products" },
];

export function getCustomFieldObject(key: string) {
  return CUSTOM_FIELD_OBJECTS.find((o) => o.key === key) ?? null;
}

export interface CustomFieldSection {
  id: string;
  object_key: string;
  name: string;
  description: string | null;
  column_count: number;
  display_order: number;
}

export interface CustomField {
  id: string;
  object_key: string;
  section_id: string | null;
  column_name: string;
  label: string;
  field_type: CustomFieldType;
  options: string[];
  is_required: boolean;
  is_active: boolean;
  default_value: string | null;
  help_text: string | null;
  placeholder: string | null;
  max_length: number | null;
  decimal_places: number | null;
  display_order: number;
}

/** Turns "Referral Source" into "cf_referral_source". */
export function toColumnName(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 45);
  return `cf_${slug || "field"}`;
}