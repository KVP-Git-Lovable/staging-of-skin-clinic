/**
 * A visit's notes and recommendations live on its service lines. The parent
 * `procedures` row carries a rolled-up copy of them, prefixed with the service
 * name when there is more than one line, so a reader can tell which treatment
 * each part belongs to:
 *
 *     Scar Remodelling: Additional 2-3 sessions
 *
 *     FILLERS: 1v2
 *
 * Two screens used to compute that separately and a third compared against it
 * by hand, which is how a doctor ended up seeing her own "1v2" twice - once as
 * FILLERS' Recommendations, and again as "FILLERS: 1v2" under another heading,
 * because the comparison tested the raw line text against the prefixed roll-up
 * and could never match. One function now, used by everything that needs it.
 */

export interface RollUpLine {
  service_name?: string | null;
  procedure_notes?: string | null;
  recommendations?: string | null;
}

export type RollUpField = "procedure_notes" | "recommendations";

/** The parent-row value that a set of service lines adds up to. */
export const rollUpServiceField = (lines: RollUpLine[], field: RollUpField): string =>
  lines
    .filter((line) => (line?.[field] ?? "").trim())
    .map((line) => (lines.length > 1 ? `${line.service_name ?? ""}: ${line[field]}` : String(line[field])))
    .join("\n\n");

/**
 * The same words in the same order, whatever the spacing.
 *
 * A prescription printed the doctor's own three recommendations a second time
 * under Special Instructions. The parent row held exactly the roll-up of its
 * lines - but the first service is stored as "Radiance Plus ", with a trailing
 * space, so the stored text read "Radiance Plus : ..." while the document,
 * which trims every value before comparing, computed "Radiance Plus: ...". One
 * character apart, the equality failed, and the block printed.
 *
 * So the space before the service name's colon is ignored, along with the two
 * other spacing faults this data carries: the \r\n line endings on imported
 * visits, and a double space typed between words. Only the comparison
 * normalises - what gets stored is untouched, so no save moves any value.
 */
const normalize = (text: string): string =>
  text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").replace(/\s+:/g, ":").trim())
    .join("\n")
    .trim();

/**
 * Is the parent value nothing more than a repeat of the lines?
 *
 * When it is, showing it again is duplication and it can be hidden. When it is
 * not, it holds something the lines do not account for - on 17,581 imported
 * visits that is Salesforce's Special Instructions, which is the only copy.
 */
export const isRollUpOf = (stored: string | null | undefined, lines: RollUpLine[], field: RollUpField): boolean => {
  const value = normalize(stored ?? "");
  if (!value) return true;
  return value === normalize(rollUpServiceField(lines, field));
};

/**
 * Does this visit's parent text hold anything of its own?
 *
 * Judged against the service lines **as the visit was opened**, never against
 * the lines as they are being typed. A doctor adding a recommendation to a
 * service makes the stored parent text stop matching the lines, and a screen
 * that asks this question again on every keystroke concludes, mid-sentence,
 * that the parent is now something of its own - so a Special Instructions box
 * appears by itself, already filled with words the doctor never typed into it.
 *
 * nextRollUpValue decides the same way on save, so what is shown and what is
 * written cannot disagree.
 */
export const parentHoldsOwnText = (
  stored: string | null | undefined,
  openingLines: RollUpLine[],
  field: RollUpField,
): boolean => !isRollUpOf(stored, openingLines, field);

/**
 * What to write to the parent row on save.
 *
 * Re-roll it from the lines only where the lines account for what is stored -
 * it is blank, or it is exactly what the lines it was loaded with added up to.
 * Anything else was written by a person or imported from Salesforce, and is the
 * editable box on screen, so what was typed there is what gets saved. A save on
 * this visit is never permission to destroy it.
 */
export const nextRollUpValue = (
  stored: string | null | undefined,
  originalLines: RollUpLine[],
  currentLines: RollUpLine[],
  field: RollUpField,
  edited: string,
): string => (isRollUpOf(stored, originalLines, field) ? rollUpServiceField(currentLines, field) : edited);
