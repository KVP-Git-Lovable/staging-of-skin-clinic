// Field config for Procedures' saved-views system. Keys intentionally
// match the existing PROCEDURE_FIELDS/DEFAULT_PROCEDURE_FIELDS column keys
// already used by Procedures.tsx's table rendering (shouldShowColumn etc.),
// so swapping the view-management layer to the shared engine needs no
// changes to how columns are displayed.
import type { FieldDef } from "./engine";

export const PROCEDURE_VIEW_FIELDS: FieldDef[] = [
  { key: "procedure_date", label: "Date", type: "date" },
  { key: "patient", label: "Patient", type: "text" },
  { key: "service_name", label: "Service", type: "text" },
  { key: "doctor", label: "Doctor", type: "picklist", optionsSource: "doctor" },
  { key: "status", label: "Status", type: "picklist", optionsSource: "status" },
];

export const DEFAULT_PROCEDURE_VIEW_COLUMNS = ["procedure_date", "patient", "service_name", "doctor", "status"];
