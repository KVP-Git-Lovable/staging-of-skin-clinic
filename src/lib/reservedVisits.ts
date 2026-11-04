/**
 * The visits a prescription reserves, each with the investigation it is for.
 *
 * A recurring course used to carry one investigation copied onto every visit
 * it booked. The doctors asked for it the other way round and they are right:
 * the second session of a course and the review that follows it are not the
 * same thing, and the appointment list, the Investigation column and the
 * patient's reminder all read that one field.
 *
 * So each date now has its own text - which makes the pairing the thing that
 * can go wrong. The dates are a fixed list with gaps in it (a doctor fills
 * visit 1 and visit 3 and leaves visit 2 for later), so dropping the blanks
 * before pairing would slide visit 3's investigation onto visit 1's
 * appointment. Here they are paired first and dropped afterwards.
 */

export interface ReservedVisit {
  /** The date and time typed for this visit, as the form holds it. */
  date: string;
  /** What this visit is for. Empty when the doctor wrote nothing. */
  investigation: string;
}

/** The visits that have a date, each keeping its own investigation. */
export function reservedVisits(
  dates: (string | null | undefined)[],
  investigations: (string | null | undefined)[],
): ReservedVisit[] {
  return dates
    .map((date, index) => ({
      date: (date ?? "").trim(),
      investigation: (investigations[index] ?? "").trim(),
    }))
    .filter((visit) => visit.date !== "");
}
