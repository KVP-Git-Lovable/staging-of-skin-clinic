/**
 * Narrowing a list to a date, or a span of them.
 *
 * A saved view can already filter on a date, but only a view you own: on a
 * standard view like "All Prescriptions" the filters panel is locked, so there
 * was no way at all to ask for one day's visits. This is the other kind of
 * filter - not part of the view, just what the person is looking at right now
 * - so it needs its own rule rather than the view engine's.
 *
 * The periods themselves are not new: `getReportDateRange` in
 * `@/lib/reportDateRange` already resolves "Today", "Last 7 Days", "Current
 * Month" and a custom From/To, and every report in the app offers that same
 * list. This only answers whether one record falls inside the answer.
 */

export interface DateWindow {
  start?: Date;
  end?: Date;
}

/**
 * Is this record's date inside the chosen window?
 *
 * No window means no filtering, so everything passes - including records with
 * no date at all, which is how the list behaves today. Once a window is
 * chosen, a record without a readable date cannot be shown to fall inside it,
 * so it drops out: saying "these are September's visits" and including one of
 * unknown date would be a lie.
 *
 * Both ends are inclusive, and the window's own bounds decide the time of day
 * (the presets already run from the start of the first day to the end of the
 * last), so a visit at 3:39 PM on the last day of the range still counts.
 */
export function withinRange(
  value: string | number | Date | null | undefined,
  range: DateWindow | null | undefined,
): boolean {
  const start = range?.start;
  const end = range?.end;
  if (!start && !end) return true;

  if (value === null || value === undefined || value === "") return false;
  const when = value instanceof Date ? value : new Date(value);
  const at = when.getTime();
  if (Number.isNaN(at)) return false;

  if (start && at < start.getTime()) return false;
  if (end && at > end.getTime()) return false;
  return true;
}
