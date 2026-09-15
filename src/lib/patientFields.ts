// Patient-specific field config + a thin wrapper over the generic
// src/lib/listViews/engine.ts (filtering/sorting/date-range/chart logic
// lives there now, shared with other modules' saved-views). Every function
// here keeps its original signature so nothing elsewhere in the Patients
// page/components needs to change.
import {
  type FieldType,
  type FieldDef,
  OPERATORS,
  type FilterCondition,
  type ViewFilters,
  type ChartType,
  type AggregateType,
  type ViewChart,
  type KanbanConfig,
  type ListDisplayMode,
  type ListView,
  type DateRange,
  dateRangeFor,
  fieldDefIn,
  applyFilters as applyFiltersGeneric,
  sortRows as sortRowsGeneric,
  formatCell as formatCellGeneric,
  computeChartData as computeChartDataGeneric,
} from "@/lib/listViews/engine";

export type {
  FieldType, FieldDef, FilterCondition, ViewFilters, ChartType, AggregateType,
  ViewChart, KanbanConfig, ListDisplayMode, ListView, DateRange,
};
export { OPERATORS, dateRangeFor };

export const PATIENT_FIELDS: FieldDef[] = [
  { key: "full_name", label: "Patient Name", type: "text" },
  { key: "first_name", label: "First Name", type: "text" },
  { key: "last_name", label: "Last Name", type: "text" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "gender", label: "Gender", type: "picklist", optionsSource: "gender" },
  { key: "age", label: "Age", type: "number" },
  { key: "date_of_birth", label: "Date of Birth (Birthday)", type: "date", anniversary: true },
  { key: "status", label: "Status", type: "picklist", optionsSource: "status" },
  { key: "skin_type", label: "Skin Type", type: "picklist", optionsSource: "skin_type" },
  { key: "skin_concerns", label: "Skin Concerns", type: "text" },
  { key: "blood_group", label: "Blood Group", type: "picklist", optionsSource: "blood_group" },
  { key: "allergies", label: "Allergies", type: "text" },
  { key: "current_medications", label: "Current Medications", type: "text" },
  { key: "medical_history", label: "Medical History", type: "text" },
  { key: "previous_treatments", label: "Previous Treatments", type: "text" },
  { key: "city", label: "City", type: "text" },
  { key: "state", label: "State", type: "text" },
  { key: "pincode", label: "Pincode", type: "text" },
  { key: "address", label: "Address", type: "text" },
  { key: "source", label: "Source", type: "picklist", optionsSource: "source" },
  { key: "source_referral_doctor", label: "Referral Doctor", type: "text" },
  { key: "doctor_id", label: "Assigned Doctor", type: "picklist", optionsSource: "doctor" },
  { key: "emergency_contact_name", label: "Emergency Contact", type: "text" },
  { key: "emergency_contact_phone", label: "Emergency Phone", type: "text" },
  { key: "notes", label: "Notes", type: "text" },
  { key: "total_visits", label: "# of Visits", type: "number" },
  { key: "lifetime_value", label: "Total Lifetime Value", type: "number" },
  { key: "last_visit_date", label: "Last Visit Date", type: "date" },
  { key: "days_since_last_visit", label: "# Days Since Last Visit", type: "number" },
  { key: "engagement_score", label: "Engagement Score", type: "number" },
  { key: "engagement_tier", label: "Engagement Tier", type: "picklist", optionsSource: "engagement_tier" },
  { key: "engagement_visit_frequency", label: "Engagement - Visit Frequency", type: "number" },
  { key: "engagement_revenue_value", label: "Engagement - Revenue Value", type: "number" },
  { key: "engagement_treatment_depth", label: "Engagement - Treatment Depth", type: "number" },
  { key: "engagement_retention_signal", label: "Engagement - Retention Signal", type: "number" },
  { key: "engagement_compliance", label: "Engagement - Compliance", type: "number" },
  { key: "engagement_updated_at", label: "Engagement Updated", type: "date" },
  { key: "created_at", label: "Created Date", type: "date" },
  { key: "updated_at", label: "Last Modified", type: "date" },
];

export const DEFAULT_VIEW_COLUMNS = ["full_name", "phone", "skin_type", "status", "created_at"];

export function fieldDef(key: string): FieldDef | undefined {
  return fieldDefIn(PATIENT_FIELDS, key);
}

export const GENDER_OPTIONS = ["Male", "Female", "Other"].map((v) => ({ value: v, label: v }));
export const STATUS_OPTIONS = ["Active", "Inactive"].map((v) => ({ value: v, label: v }));
export const SKIN_TYPE_OPTIONS = ["Normal", "Dry", "Oily", "Combination", "Sensitive"].map((v) => ({ value: v, label: v }));
export const BLOOD_GROUP_OPTIONS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((v) => ({ value: v, label: v }));
export const SOURCE_OPTIONS = [
  "Walk-in",
  "Referral",
  "Doctor Referral",
  "Google",
  "Facebook",
  "Instagram",
  "Advertisement",
  "Other",
].map((v) => ({ value: v, label: v }));

export const ENGAGEMENT_TIER_OPTIONS = ["Platinum", "Gold", "Silver", "Early"].map((v) => ({ value: v, label: v }));

/** Fields that can drive Kanban columns (picklists only). */
export const KANBAN_GROUP_FIELDS = PATIENT_FIELDS.filter((f) => f.type === "picklist");
/** Fields that can be summarised on a Kanban column header. */
export const KANBAN_SUMMARY_FIELDS = PATIENT_FIELDS.filter((f) => f.type === "number");

export function patientAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  if (isNaN(diff)) return null;
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

/** Resolve the comparable value of a field for a given patient row - full_name/age are derived, not stored columns. */
export function rawValue(row: any, key: string): unknown {
  if (!row) return null;
  if (key === "full_name") return `${row.first_name || ""} ${row.last_name || ""}`.trim();
  if (key === "age") return patientAge(row.date_of_birth);
  return row[key];
}

export function applyFilters<T>(rows: T[], filters?: ViewFilters | null): T[] {
  return applyFiltersGeneric(rows, filters, PATIENT_FIELDS, rawValue);
}

export function sortRows<T>(rows: T[], field?: string | null, dir: "asc" | "desc" = "desc"): T[] {
  return sortRowsGeneric(rows, field, dir, PATIENT_FIELDS, rawValue);
}

export function formatCell(row: any, key: string): string {
  return formatCellGeneric(row, key, PATIENT_FIELDS, rawValue);
}

export function computeChartData(rows: any[], chart: ViewChart): { name: string; value: number }[] {
  return computeChartDataGeneric(rows, chart, PATIENT_FIELDS, rawValue);
}
