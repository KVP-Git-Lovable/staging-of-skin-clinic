// Field config for the Appointments table view's saved-views system. Keys
// intentionally match the existing APPOINTMENT_FIELDS/DEFAULT_APPOINTMENT_FIELDS
// column keys already used by Appointments.tsx's table rendering
// (shouldShowColumn etc.), so swapping the view-management layer to the
// shared engine needs no changes to how columns are displayed.
import type { FieldDef } from "./engine";

// Listed in the order the table renders them, so the field picker reads the
// same way the list does. "time" is gone: date and clock time are one column
// now. A saved view still naming it is dropped harmlessly, the same way the
// removed "visit_status" key already is - see displayColumns in Appointments.tsx.
export const APPOINTMENT_VIEW_FIELDS: FieldDef[] = [
  { key: "patient", label: "Patient", type: "text" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "doctor", label: "Doctor", type: "picklist", optionsSource: "doctor" },
  { key: "payment_mode", label: "Payment Mode", type: "text" },
  { key: "bill", label: "Bill Amount", type: "number" },
  { key: "start_time", label: "Date & Time", type: "date" },
  { key: "service", label: "Investigation", type: "text" },
  { key: "status", label: "Status", type: "picklist", optionsSource: "status" },
  // Who carried out the treatment. Deliberately absent from
  // DEFAULT_APPOINTMENT_VIEW_COLUMNS below: offering the column is not the
  // same as forcing it onto every existing saved view and every clinic
  // day sheet that is already nine columns wide.
  { key: "therapist", label: "Therapist", type: "picklist", optionsSource: "therapist" },
];

export const DEFAULT_APPOINTMENT_VIEW_COLUMNS = [
  "patient",
  "phone",
  "doctor",
  "payment_mode",
  "bill",
  "start_time",
  "service",
  "status",
];

// Fields that carry money: invoice total and payment mode. Hidden from roles
// whose "Billing amounts & payment modes" permission is switched off.
export const BILLING_FIELD_KEYS: readonly string[] = ["bill", "payment_mode"];

/** Drops the money fields from a field list or column-key list. */
export function withoutBillingFields<T extends string | { key: string }>(items: readonly T[]): T[] {
  return items.filter((i) => !BILLING_FIELD_KEYS.includes(typeof i === "string" ? i : i.key));
}

/** Drops filter conditions that test a money field, leaving the rest as they were. */
export function withoutBillingConditions<F extends { conditions: { field: string }[] }>(filters: F): F {
  return { ...filters, conditions: filters.conditions.filter((c) => !BILLING_FIELD_KEYS.includes(c.field)) };
}
