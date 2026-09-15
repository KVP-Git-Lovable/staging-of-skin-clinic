// Field config for AllSurveys' saved-views system. Sits alongside the
// existing status/template/date-range dropdowns (left untouched) as an
// additional, richer multi-condition filter builder + saved views layer.
import type { FieldDef } from "./engine";

export const SURVEY_VIEW_FIELDS: FieldDef[] = [
  { key: "patient", label: "Patient", type: "text" },
  { key: "template", label: "Template", type: "picklist", optionsSource: "template" },
  { key: "status", label: "Status", type: "picklist", optionsSource: "status" },
  { key: "created_at", label: "Date", type: "date" },
];

export const DEFAULT_SURVEY_VIEW_COLUMNS: string[] = [];
