/**
 * Room for a horizontal bar chart whose categories are free text.
 *
 * The Dashboard's "Revenue by Service" and "Revenue by Primary Concern" plot up
 * to ten categories whose names come from Salesforce verbatim - "Old Consult +
 * 1RX Hydracleanup + Laser toning B" and the like, up to about sixty
 * characters. They were drawn in a fixed 220px box, which is 22px a row, with a
 * 110px label gutter. Recharts wraps a tick label that does not fit rather than
 * truncating it, so each one took two or three 12px lines inside that 22px band
 * and ran into the rows above and below.
 *
 * Two rules fix it: give every row a band taller than one line of text, and
 * make every label exactly one line.
 */

/** Vertical room per category. One 11px line plus air on both sides. */
export const BAR_BAND_HEIGHT = 30;
/** Never shorter than this, however few categories there are. */
export const BAR_CHART_MIN_HEIGHT = 220;
/** The x-axis band and the chart's own margins. */
const BAR_CHART_CHROME = 40;

export function horizontalBarHeight(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return BAR_CHART_MIN_HEIGHT;
  return Math.max(BAR_CHART_MIN_HEIGHT, Math.round(count) * BAR_BAND_HEIGHT + BAR_CHART_CHROME);
}

/**
 * Label gutter, and how many characters fit on ONE line inside it.
 *
 * The character counts are measured, not calculated: at fontSize 11 a mixed-case
 * clinical name runs about 6.5px a character once capitals and digits are in it,
 * and recharts keeps ~10px of the gutter for the tick mark. 24 characters in a
 * 150px gutter still wrapped onto a second line, which is what these numbers are
 * for - a wrapped label is the whole bug.
 */
export const BAR_LABEL_GUTTER = { desktop: 170, mobile: 110 };
export const BAR_LABEL_CHARS = { desktop: 22, mobile: 15 };

/**
 * One line, never wrapped. The full name is still on the tooltip - recharts
 * passes the raw category value there and a tickFormatter only changes what is
 * drawn - so truncating here hides nothing.
 */
export function truncateLabel(label: unknown, max: number): string {
  const text = String(label ?? "").trim();
  if (max <= 1) return text ? "…" : "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
