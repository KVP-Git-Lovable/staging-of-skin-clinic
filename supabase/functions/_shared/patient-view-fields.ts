// Deno mirror of the patient field config + value resolver in src/lib/patientFields.ts.
// The saved-view filter engine reads patient rows through rawValue, so the field keys and the
// derived values (full_name, age, days_since_last_visit) must match the frontend; a vitest
// parity test enforces it. Generated from src/lib/patientFields.ts - edit that file, then
// regenerate this one, never the other way round.
import type { FieldDef } from "./list-view-engine.ts";

export const PATIENT_FIELDS: FieldDef[] = [
  { key: "full_name", label: "Patient Name", type: "text" },
  { key: "first_name", label: "First Name", type: "text" },
  { key: "last_name", label: "Last Name", type: "text" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "alternate_phone", label: "Alternate Phone", type: "text" },
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
  // What the clinic means by "when did this person become a patient". created_at
  // answers a different question - when the row was loaded here - and for 98% of
  // patients that is one of three bulk-import dates.
  { key: "registered_at", label: "Registered", type: "date" },
  { key: "created_at", label: "Created Date", type: "date" },
  { key: "updated_at", label: "Last Modified", type: "date" },
];

export function patientAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  if (isNaN(diff)) return null;
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

// Inlined from src/lib/visitStats.ts, which reaches for date-fns differenceInDays. Edge
// functions cannot import from src/, and pulling date-fns in for one subtraction is not worth
// the dependency: both truncate toward zero, so a whole-day floor agrees with the frontend.
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysSinceVisit(lastVisit: string | Date | null | undefined): number | null {
  if (!lastVisit) return null;
  const when = lastVisit instanceof Date ? lastVisit : new Date(lastVisit);
  if (Number.isNaN(when.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - when.getTime()) / MS_PER_DAY));
}

/** Resolve the comparable value of a field for a given patient row - full_name, age and
 *  days_since_last_visit are derived on read, not stored columns. */
export function rawValue(row: any, key: string): unknown {
  if (!row) return null;
  if (key === "full_name") return `${row.first_name || ""} ${row.last_name || ""}`.trim();
  if (key === "age") return patientAge(row.date_of_birth);
  if (key === "days_since_last_visit") return daysSinceVisit(row.last_visit_date);
  return row[key];
}
