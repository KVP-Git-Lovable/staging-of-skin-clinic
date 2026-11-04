import { displayDate } from "@/lib/dateInput";

/**
 * A date in the AI case analysis, shown the way the rest of the app shows dates.
 *
 * The analysis comes back as free-form JSON from the model, so its timeline
 * dates arrive in whatever shape it chose - "2026-04-06" echoing the raw data
 * it was given, or "April 6, 2026". Either way it read differently from every
 * other date in the clinic, which is dd/mm/yyyy everywhere else (see
 * displayDate).
 *
 * A timeline entry is not guaranteed to be a date at all - a model may write
 * "Six weeks later", "Ongoing", or a range - so anything that is not
 * recognisably a whole date is passed through untouched rather than blanked or,
 * worse, guessed at.
 *
 * The guard is a four-digit year plus at least one other number, because Date's
 * parser is far too willing: it reads a bare "6" as a date, and turns
 * "Early 2026" into the 1st of January, inventing a day nobody wrote. A range
 * like "2025-2026" clears the guard but does not parse, and falls through to
 * being shown as written.
 */
export function caseAnalysisDate(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "";

  // Annotated: match() returns RegExpMatchArray | null, and the ?? [] made the
  // type a union with never[], which left TypeScript inferring `never` for n
  // below in some module orderings. The annotation pins it to what it is.
  const numbers: string[] = text.match(/\d+/g) ?? [];
  const looksWhole = numbers.length >= 2 && numbers.some((n) => n.length === 4);
  if (!looksWhole) return text;

  return displayDate(text) || text;
}
