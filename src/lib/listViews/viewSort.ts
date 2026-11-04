/**
 * Which sort a list should actually use when a saved view is selected.
 *
 * `list_views.sort_by` defaults to 'created_at' and `sort_direction` to 'desc'
 * in the database, and the View editor opens pre-set to the same, so every view
 * saved without someone deliberately touching the Sort controls is stored that
 * way. Seven of seven appointment views were.
 *
 * No list offers `created_at` as a column, so it is not a choice anyone could
 * have made - but it was still being applied, falling through to the list's
 * natural column and dragging the stored "desc" with it. The appointments list
 * opened with the last patient of the day on top, and because the active view
 * id is remembered across navigation, it went back to that every time someone
 * returned to the module.
 *
 * So: honour a sort on a field the list actually knows, and ignore one it does
 * not. A sort someone really did pick in the View editor still wins - that is
 * what the setting is for.
 */

export interface ViewSort {
  column: string;
  direction: "asc" | "desc";
}

export function resolveViewSort(
  sortField: string | null | undefined,
  sortDir: "asc" | "desc" | null | undefined,
  knownFields: readonly { key: string }[],
  fallback: ViewSort,
): ViewSort {
  const field = (sortField ?? "").trim();
  if (!field || !knownFields.some((f) => f.key === field)) return fallback;
  return { column: field, direction: sortDir === "desc" ? "desc" : "asc" };
}
