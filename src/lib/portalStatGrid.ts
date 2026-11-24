/**
 * How the patient portal's home stat cards fill their row.
 *
 * The grid is a fixed `grid-cols-2` and the cards inside it are conditional:
 * Outstanding Balance, Clinical Photos and Surveys each appear only when the
 * clinic has that module switched on. So the number of cards is 2, 3, 4 or 5
 * depending on the settings row, and at 3 or 5 the last one sat alone with an
 * empty cell beside it - which is what the clinic reported after switching
 * Clinical Photos off.
 *
 * Rather than guess a column count, the odd card out is stretched across both
 * columns. That keeps two columns at every width - this grid lives inside
 * `max-w-lg` and is mostly read on a phone, where three columns would crush
 * labels like "Upcoming Appointments" - and leaves no hole whatever
 * combination of modules is enabled.
 *
 * The class is a complete literal. Tailwind's scanner reads source text, so an
 * interpolated `col-span-${n}` would never be emitted and the card would
 * quietly stay half-width. Same trap as src/lib/kpiGrid.ts.
 *
 * kpiGrid.ts itself is deliberately not reused here: it picks a column count
 * for the dashboard's wide KPI row, which is the opposite problem.
 */

/** Tailwind must see this spelled out somewhere it scans. */
const FULL_WIDTH = "col-span-2";

/**
 * The extra class for the card at `index`, in a row of `count` cards.
 *
 * Only the last card of an odd-numbered row spans both columns; everything
 * else gets nothing. An even row is already flush.
 */
export function statCardSpan(index: number, count: number): string {
  if (!Number.isInteger(index) || !Number.isInteger(count)) return "";
  if (index < 0 || count <= 0 || index >= count) return "";
  if (count % 2 === 0) return "";
  return index === count - 1 ? FULL_WIDTH : "";
}
