/**
 * Mirror of src/lib/procedureRollup.ts - the app and the edge functions do not
 * share a module path (same arrangement as prescriptionText.ts beside this
 * file). Keep the two in step: the document and the screen must decide
 * identically whether a visit's Special Instructions are anything more than a
 * repeat of its service lines.
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
 * When it is, printing it again says the same thing twice - which is exactly
 * what happened to "1v2" on a two-service visit, once in the Procedure Details
 * table and again, prefixed, under Special Instructions. When it is not, it
 * holds something the lines do not account for; on 17,581 imported visits that
 * is Salesforce's Special Instructions, and it is the only copy.
 */
export const isRollUpOf = (stored: string | null | undefined, lines: RollUpLine[], field: RollUpField): boolean => {
  const value = normalize(stored ?? "");
  if (!value) return true;
  return value === normalize(rollUpServiceField(lines, field));
};
