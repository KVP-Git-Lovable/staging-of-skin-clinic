// Field config for the Appointments table view's saved-views system. Keys
// intentionally match the existing APPOINTMENT_FIELDS/DEFAULT_APPOINTMENT_FIELDS
// column keys already used by Appointments.tsx's table rendering
// (shouldShowColumn etc.), so swapping the view-management layer to the
// shared engine needs no changes to how columns are displayed.
import type { FieldDef } from "./engine";

export const APPOINTMENT_VIEW_FIELDS: FieldDef[] = [
  { key: "start_time", label: "Date", type: "date" },
  { key: "time", label: "Time", type: "text" },
  { key: "patient", label: "Patient", type: "text" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "service", label: "Service", type: "text" },
  { key: "doctor", label: "Doctor", type: "picklist", optionsSource: "doctor" },
  { key: "status", label: "Status", type: "picklist", optionsSource: "status" },
  { key: "bill", label: "Bill Amount", type: "number" },
  { key: "visit_status", label: "Next Visit", type: "picklist", optionsSource: "visit_status" },
  { key: "payment_mode", label: "Payment Mode", type: "text" },
];

export const DEFAULT_APPOINTMENT_VIEW_COLUMNS = [
  "patient",
  "phone",
  "service",
  "doctor",
  "start_time",
  "time",
  "status",
  "bill",
  "visit_status",
  "payment_mode",
];
