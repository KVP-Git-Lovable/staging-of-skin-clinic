/**
 * How many columns the dashboard's KPI row should use.
 *
 * The row was fixed at `grid-cols-2 lg:grid-cols-4`, but only Clinic 360
 * renders four stat cards - Patient 360 renders two, Marketing and Team one
 * each - so three of the four dashboards left two or three empty columns on a
 * wide screen.
 *
 * Every class is a complete literal string. Tailwind's scanner reads source
 * text, so an interpolated `lg:grid-cols-${n}` would never be emitted and the
 * row would silently fall back to one column.
 */
const COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
};

/** Capped at four: past that the row wraps, which is what it did before. */
export function kpiColumnClass(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return COLUMNS[1];
  return COLUMNS[Math.min(Math.round(count), 4)];
}
