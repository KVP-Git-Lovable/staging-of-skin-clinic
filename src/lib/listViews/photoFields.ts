// Field config for Photos' saved-views system. Unlike the table pages,
// Photos has no prior list-views system and no meaningful "columns" concept
// (every card shows the same fixed layout) - fields exist purely to drive
// the filter builder.
import type { FieldDef } from "./engine";

export const PHOTO_VIEW_FIELDS: FieldDef[] = [
  { key: "patient", label: "Patient", type: "text" },
  { key: "photo_type", label: "Photo Type", type: "picklist", optionsSource: "photo_type" },
  { key: "procedure", label: "Procedure", type: "text" },
  { key: "notes", label: "Notes", type: "text" },
  { key: "taken_at", label: "Date Taken", type: "date" },
];

export const DEFAULT_PHOTO_VIEW_COLUMNS: string[] = [];
