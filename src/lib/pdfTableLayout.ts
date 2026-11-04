/**
 * Where a table may start on a page of the prescription document.
 *
 * A prescription came out with "Procedure Details", its column header, and then
 * three quarters of a page of white space - the rows themselves appearing on the
 * next page under "Procedure Details (continued)". The heading was placed with
 * room reserved for itself and the column header alone, so a tall first row
 * could not fit beneath it and moved on, leaving an empty table behind.
 *
 * A table heading is only worth writing where its first row can follow it. These
 * two functions say how much room that needs, and are used by every table in the
 * document so none of them can orphan its heading again.
 *
 * Mirrored at supabase/functions/generate-prescription-pdf/pdfTableLayout.ts -
 * the app and the edge functions share no module path (same arrangement as
 * procedureRollup.ts). Keep the two in step.
 */

/** Line height inside a table cell, and the padding around the text. */
const LINE_HEIGHT = 12;
const CELL_PADDING = 9;
/** No row is shorter than this, however little it holds. */
const MIN_ROW_HEIGHT = 25;
/** The heading above a table: its text, and the gap down to the column header. */
const HEADING_BLOCK = 20;

/**
 * How tall a row has to be to hold its columns, given how many wrapped lines
 * each one came to.
 */
export function tableRowHeight(...lineCounts: number[]): number {
  const tallest = lineCounts.reduce((most, count) => Math.max(most, count || 0), 0);
  return Math.max(MIN_ROW_HEIGHT, tallest * LINE_HEIGHT + CELL_PADDING);
}

/**
 * How much room a table needs before its heading may be drawn: the heading, the
 * column header, and the first row - because a heading with nothing under it is
 * the fault this exists to prevent.
 *
 * A table with no rows asks only for its heading and header, as it did before.
 */
export function tableStartSpace(columnHeaderHeight: number, firstRowHeight = 0): number {
  return HEADING_BLOCK + columnHeaderHeight + firstRowHeight;
}
