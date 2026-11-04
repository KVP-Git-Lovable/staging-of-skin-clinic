// Deciding whether a Salesforce visit was a plain doctor consultation, from its
// Investigation text. Kept out of index.ts so it can be unit-tested against real
// clinic data (index.ts only runs under Deno).
//
// This decides whether GST is charged, so it is deliberately conservative: a
// visit only counts as a consultation when EVERY part of the text is a
// consultation word. Anything unrecognised keeps its tax.

/** "New consult", "Old Consultation", "Review" - the whole of a consultation-only visit. */
const CONSULTATION_PART = /^(?:(?:new|old|re)\s*)?consult(?:ation)?$|^review$/i;

/**
 * The Investigation text with the importer's noise removed, ready to read or to
 * put on a bill.
 *
 * Drops the trailing "(Dr. Whoever)" the importer appends - and any other
 * parenthetical aside, because the clinic writes notes like "(After a month
 * Review - Rs 850 charges - Abroad)" that would otherwise stop an obvious
 * consultation from being recognised - plus the "last session on ..." trailer
 * that dates a repeat treatment without naming anything new.
 */
export function cleanInvestigationText(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/\([^()]*\)/g, " ")
    .replace(/\blast session\s+on\b.*$/i, " ")
    .replace(/[?]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*\+\s*$/, "")
    .trim();
}

/**
 * Was this visit nothing but a doctor's consultation?
 *
 * True only when every "+"-separated part is a consultation word, so
 * "New consult" and "Review" qualify while "New consult + RF + Excision" does
 * not - the clinic's rule is that only the consultation itself is exempt, and
 * anything sharing the bill with a procedure keeps whatever GST Salesforce set.
 */
export function isPureConsultation(raw: string | null | undefined): boolean {
  const cleaned = cleanInvestigationText(raw);
  if (!cleaned) return false;
  const parts = cleaned.split("+").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return false;
  return parts.every((p) => CONSULTATION_PART.test(p));
}

/**
 * The name to print on a bill line.
 *
 * A consultation-only visit is called "Consultation"; anything else is named by
 * its Investigation text, which is what the front desk needs to see instead of
 * the "Service" placeholder the importer stores when Salesforce gives no
 * procedure type. Falls back to the placeholder only when there is no text.
 */
export function billLineName(raw: string | null | undefined, fallback = "Service"): string {
  if (isPureConsultation(raw)) return "Consultation";
  return cleanInvestigationText(raw) || fallback;
}
