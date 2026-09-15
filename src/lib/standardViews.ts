// Thin patient-specific wrapper over src/lib/listViews/standardViews.ts -
// binds DEFAULT_VIEW_COLUMNS so Patients.tsx and its listviews/* components
// keep working with their original call signatures, unchanged.
import { DEFAULT_VIEW_COLUMNS, type ListView } from "@/lib/patientFields";
import * as generic from "@/lib/listViews/standardViews";

export { ALL_VIEW_ID, RECENT_VIEW_ID, isStandardViewId, setStandardColumns, setKanbanConfig } from "@/lib/listViews/standardViews";

export const getStandardColumns = (section: string, id: string): string[] =>
  generic.getStandardColumns(section, id, DEFAULT_VIEW_COLUMNS);

export const getKanbanConfig = (section: string, id: string) => generic.getKanbanConfig(section, id, "status");

export function buildStandardViews(section: string, objectLabel: string): ListView[] {
  return generic.buildStandardViews(section, objectLabel, DEFAULT_VIEW_COLUMNS) as ListView[];
}
