/**
 * Reading the prescription the way the doctor wrote it.
 *
 * Salesforce keeps a visit's medicines in one free-text field (Diagnosis__c's
 * Prescription__c, imported into procedures.procedure_notes). 25,346 visits
 * have one, and they are not written to a single pattern:
 *
 *   18,786  blocks separated by a blank line
 *    5,003  one per line, no blank lines
 *      991  numbered "1)" or "1."
 *      584  a single line
 *   10,697  of the above open with a "Prescription:" header
 *
 * and a medicine is not always one line. This is a real entry:
 *
 *   Prescription:
 *   SOTRET 20MG
 *   1-0-0
 *   ALTERNATE DAY
 *   X 6 WEEKS
 *
 *   TRILUMA CREAM
 *   ...
 *
 * where name, dose, schedule and duration each sit on their own line and the
 * blank line is what separates one medicine from the next. Splitting that on
 * newlines would print "1-0-0" and "X 6 WEEKS" as if they were products, on a
 * document a doctor prescribes from. So the separator is chosen per entry,
 * strongest signal first: explicit numbering, else blank lines, else one per
 * line.
 *
 * The rule this must never break: **no text is discarded.** Every branch keeps
 * the whole item, and an entry that matches no pattern comes back whole in
 * `product`. Grouping may differ from what the doctor pictured; the words may
 * not. Nothing here tries to split out dose, frequency or duration into
 * separate fields - that is where free text gets mangled, and the app has no
 * use for the pieces.
 */

export type PrescriptionItem = {
  /** The medicine as written, newlines and all. */
  product: string;
  /** A trailing "(...)" lifted out for the Instruction column; "" if none. */
  instruction: string;
};

/** "Prescription:" / "Prescriptions:" opening a block - a label, not a medicine. */
const HEADER = /^\s*prescriptions?\s*:\s*/i;

/** "1)" or "1." at the start of a line. */
const NUMBERED = /(?:^|\n)[ \t]*\d+[ \t]*[).][ \t]*/;

/**
 * A trailing parenthetical, taken as the instruction: "T-bact cream 1-0-1 x 1
 * month (apply over the peri-anal skin)". Requires something before it, and no
 * nested brackets, so "Candid cream (clotrimazole) 1-0-1 x 1 month" - where the
 * bracket is mid-text and not trailing - keeps its full name.
 */
const TRAILING_PAREN = /^(.*\S)\s*\(([^()]*)\)\s*$/;

/**
 * A line that is only a dose, a schedule or a duration - "1-0-0", "X 6 WEEKS",
 * "ALTERNATE DAY", "0-0-1/2", "2 months". It belongs to the medicine above it,
 * never to a row of its own.
 *
 * 82 of the 5,003 entries that carry no blank lines have one of these, so the
 * per-line split needs it; without it those visits print "1-0-0" in the Product
 * column of a document a doctor prescribes from.
 */
const CONTINUATION =
  /^(?:[0-9]+(?:\/[0-9]+)?(?:-[0-9]+(?:\/[0-9]+)?){1,3}|[Xx]\s*[0-9].*|[0-9]+\s*(?:weeks?|months?|days?|hours?)\b.*|alternate\s+day|once|twice|thrice|daily|weekly|stat|sos|[A-Z\s]{0,20}(?:MORNING|NIGHT|EVENING|SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY))\s*$/i;

const splitIntoItems = (body: string): string[] => {
  // Numbering is the only separator the writer stated outright, so it wins even
  // when blank lines are also present.
  if (NUMBERED.test(body)) {
    return body.split(new RegExp(NUMBERED, "g"));
  }
  // A blank line separates medicines that may each run over several lines.
  if (/\n[ \t]*\n/.test(body)) {
    return body.split(/\n[ \t]*\n+/);
  }
  // No blank lines: each line stands on its own, except a bare dose or
  // schedule, which rejoins the medicine it qualifies.
  const items: string[] = [];
  for (const line of body.split("\n")) {
    if (items.length && CONTINUATION.test(line.trim()) && line.trim()) {
      items[items.length - 1] += `\n${line.trim()}`;
      continue;
    }
    items.push(line);
  }
  return items;
};

const toItem = (chunk: string): PrescriptionItem => {
  const text = chunk.trim();
  // Only a single-line item can have a "trailing" parenthetical; on a
  // multi-line one the brackets belong to whichever line they are on.
  if (!text.includes("\n")) {
    const match = text.match(TRAILING_PAREN);
    if (match) return { product: match[1].trim(), instruction: match[2].trim() };
  }
  return { product: text, instruction: "" };
};

/**
 * The medicines in a Salesforce prescription, one entry per row of the
 * Products/Medications table. Returns [] for empty text, so the caller can tell
 * "nothing prescribed" from "something prescribed" and omit the table entirely
 * rather than print an empty one.
 */
export const parsePrescriptionText = (raw: string | null | undefined): PrescriptionItem[] => {
  const text = String(raw ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  const body = text.replace(HEADER, "").trim();
  if (!body) return [];
  return splitIntoItems(body)
    .map(toItem)
    .filter((item) => item.product || item.instruction);
};
