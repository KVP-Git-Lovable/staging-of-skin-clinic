import type { KanbanConfig, ListView } from "@/lib/listViews/engine";

export const ALL_VIEW_ID = "__all__";
export const RECENT_VIEW_ID = "__recent__";

export const isStandardViewId = (id?: string | null) => id === ALL_VIEW_ID || id === RECENT_VIEW_ID;

const columnsKey = (section: string, id: string) => `lv.${section}.${id}.columns`;
const kanbanKey = (section: string, id: string) => `lv.${section}.${id}.kanban`;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* best effort */
  }
}

export const getStandardColumns = (section: string, id: string, defaultColumns: string[]): string[] =>
  readJson<string[]>(columnsKey(section, id)) ?? defaultColumns;

export const setStandardColumns = (section: string, id: string, columns: string[]) =>
  writeJson(columnsKey(section, id), columns);

export const getKanbanConfig = (section: string, id: string, defaultGroupField = "status"): KanbanConfig =>
  readJson<KanbanConfig>(kanbanKey(section, id)) ?? { group_field: defaultGroupField, summarize_field: null };

export const setKanbanConfig = (section: string, id: string, config: KanbanConfig) =>
  writeJson(kanbanKey(section, id), config);

/** The two always-available views: filters are locked and they cannot be deleted. */
export function buildStandardViews(section: string, objectLabel: string, defaultColumns: string[]): ListView[] {
  const base = {
    owner_id: "",
    filters: { match: "all" as const, conditions: [] },
    sort_field: "created_at",
    sort_dir: "desc" as const,
    visibility: "everyone" as const,
    shared_user_ids: [],
    is_default: false,
    charts: [],
    is_standard: true,
  };
  return [
    { ...base, id: ALL_VIEW_ID, name: `All ${objectLabel}`, columns: getStandardColumns(section, ALL_VIEW_ID, defaultColumns) },
    {
      ...base,
      id: RECENT_VIEW_ID,
      name: "Recently Viewed",
      sort_field: null,
      columns: getStandardColumns(section, RECENT_VIEW_ID, defaultColumns),
    },
  ];
}
