/**
 * Column widths a user can drag, held as shares of the table.
 *
 * The list tables are table-fixed with a colgroup built from these shares -
 * they have to be, because the rows are windowed by a virtualizer that
 * measures real heights, and under table-layout:auto the widths chase the
 * measurements and never settle. So widening a column means changing its
 * share and taking the difference from its neighbour, keeping the total the
 * same; it cannot mean letting the browser work it out.
 */
export type ColumnWidth = [string, number];

/** No column may be dragged narrower than this share, or it becomes unclickable. */
export const MIN_COLUMN_SHARE = 4;

/**
 * Widen (or narrow) one column by `delta` shares, taking it from the column
 * to its right. Both ends are held at MIN_COLUMN_SHARE, so a drag that would
 * crush either one is clamped rather than refused - the header keeps moving
 * with the pointer until it genuinely cannot.
 *
 * Returns the list unchanged when the column is the last one or is not found:
 * there is no neighbour to take from, and silently resizing a different
 * column would be worse than doing nothing.
 */
export function resizeColumn(widths: ColumnWidth[], key: string, delta: number): ColumnWidth[] {
  const i = widths.findIndex(([k]) => k === key);
  if (i === -1 || i === widths.length - 1) return widths;

  const [, own] = widths[i];
  const [, neighbour] = widths[i + 1];

  // Clamped against both floors, so the pair's total is untouched and the
  // table still adds up to what it did before.
  const lowest = MIN_COLUMN_SHARE - own;
  const highest = neighbour - MIN_COLUMN_SHARE;
  const applied = Math.max(lowest, Math.min(highest, delta));
  if (applied === 0) return widths;

  return widths.map((entry, index) => {
    if (index === i) return [entry[0], entry[1] + applied] as ColumnWidth;
    if (index === i + 1) return [entry[0], entry[1] - applied] as ColumnWidth;
    return entry;
  });
}

/**
 * The saved widths for a table, merged over its defaults.
 *
 * Only shares for columns that still exist are taken, and any column the
 * saved copy has never heard of keeps its default - so adding or removing a
 * column in a later release cannot leave someone with a table whose widths
 * do not add up.
 */
export function mergeSavedWidths(defaults: ColumnWidth[], saved: unknown): ColumnWidth[] {
  if (!saved || typeof saved !== "object") return defaults;
  const map = saved as Record<string, unknown>;
  return defaults.map(([key, weight]) => {
    const value = Number(map[key]);
    return [key, Number.isFinite(value) && value >= MIN_COLUMN_SHARE ? value : weight] as ColumnWidth;
  });
}
