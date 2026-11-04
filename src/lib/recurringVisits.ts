/**
 * Editing the visits a recurring course books.
 *
 * The dates are a fixed-length list with gaps in it - a doctor fills visit 1
 * and visit 3 and leaves visit 2 for later - and each has its own
 * investigation beside it, held in a second list at the same index. Anything
 * that moves one list has to move the other in the same breath, or visit 3's
 * investigation slides onto visit 1's appointment. reservedVisits.ts pairs
 * them before dropping blanks for exactly this reason; these keep the pairing
 * while the doctor is still editing.
 *
 * The date is stored the way <input type="datetime-local"> holds it,
 * "YYYY-MM-DDTHH:mm", because that is what the save already reads. Splitting
 * it lets the date and the clock be separate controls - a date box and a
 * 12-hour picker - without changing what is stored.
 */

export interface VisitLists {
  dates: string[];
  investigations: string[];
}

/** "2026-10-21T14:30" -> { date: "2026-10-21", time: "14:30" } */
export function splitVisitDateTime(value: string | null | undefined): { date: string; time: string } {
  const [date = "", rest = ""] = String(value ?? "").split("T");
  // Seconds are dropped: the picker works in minutes and nothing books to the
  // second, but a stored value may carry them.
  const time = rest.slice(0, 5);
  return { date, time };
}

/**
 * The two halves back into one value.
 *
 * No date means no visit, whatever the clock says - a time on its own would
 * save as an unparseable date. A date with no time defaults to 09:00 rather
 * than midnight, which is nobody's appointment.
 */
export function joinVisitDateTime(date: string, time: string): string {
  const day = (date ?? "").trim();
  if (!day) return "";
  const clock = (time ?? "").trim() || "09:00";
  return `${day}T${clock}`;
}

/** Empty one visit, leaving the row in place to be filled in later. */
export function clearVisitAt({ dates, investigations }: VisitLists, index: number): VisitLists {
  const nextDates = [...dates];
  const nextInvestigations = [...investigations];
  nextDates[index] = "";
  nextInvestigations[index] = "";
  return { dates: nextDates, investigations: nextInvestigations };
}

/**
 * Take one visit out of the course entirely.
 *
 * Both lists are spliced at the same index so everything below keeps the
 * investigation it was written with. The investigations list can be shorter
 * than the dates list - it is only as long as the boxes somebody has typed in
 * - so it is padded first, or a splice at the end would silently do nothing.
 */
export function removeVisitAt({ dates, investigations }: VisitLists, index: number): VisitLists {
  const padded = [...investigations];
  while (padded.length < dates.length) padded.push("");
  const nextDates = [...dates];
  nextDates.splice(index, 1);
  padded.splice(index, 1);
  return { dates: nextDates, investigations: padded };
}

/**
 * A timestamp Postgres' way into a timestamp every browser reads.
 *
 * recurring_dates is a timestamptz[], and PostgREST sends those as
 * "2026-12-01 03:30:00+00" - a space where ISO wants a T, and a two-digit
 * offset where ISO wants four. Chrome parses it anyway; Safari returns Invalid
 * Date, and Safari is what the clinic's iPhones run. Left alone, a doctor
 * opening a recurring prescription on a phone would find the visit dates blank
 * and saving would write that blank back over the real ones.
 */
function normaliseTimestamp(value: string): string {
  const text = String(value).trim();
  // Only the forms Postgres actually sends; anything already ISO is untouched.
  return text.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
}

/**
 * A stored visit date back into what the date and time controls hold.
 *
 * recurring_dates are written as ISO instants, but the boxes on the form work
 * in "YYYY-MM-DDTHH:mm" local time - so coming back to edit a course, the
 * stored dates have to be turned back into the clinic's own clock. Built by
 * hand from the local parts rather than slicing the ISO string, because
 * slicing would show a 2:30pm Mangalore visit as 9:00am UTC.
 *
 * Empty for anything that is not a date, so one bad stored value leaves its
 * box blank instead of writing "Invalid Date" into the course.
 */
export function toVisitInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const when = new Date(normaliseTimestamp(iso));
  if (Number.isNaN(when.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
    `T${pad(when.getHours())}:${pad(when.getMinutes())}`
  );
}

/** The minute a visit falls on, as one comparable key. */
function minuteKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const when = new Date(normaliseTimestamp(value));
  if (Number.isNaN(when.getTime())) return null;
  return when.toISOString().slice(0, 16);
}

/**
 * Which planned visits still need an appointment booked.
 *
 * Editing a course has to be able to ADD visits without booking the ones that
 * are already in the diary a second time. A doctor opens a prescription with
 * three visits booked, adds a fourth and saves: only the fourth is new.
 *
 * Compared to the minute, because a stored instant carries seconds that a
 * picker working in minutes never will - an exact string match would call
 * every existing visit new and book the whole course again.
 *
 * Nothing is ever removed from the diary here. Taking a date off the plan
 * leaves its appointment alone: cancelling a booked visit is a decision for
 * the Appointments page, which asks first, and not something a prescription
 * save should do quietly.
 */
export function visitsNeedingAppointment<T extends { date: string }>(
  planned: T[],
  alreadyBooked: (string | null | undefined)[],
): T[] {
  const booked = new Set<string>();
  for (const value of alreadyBooked) {
    const key = minuteKey(value);
    if (key) booked.add(key);
  }
  const seen = new Set<string>();
  return planned.filter((visit) => {
    const key = minuteKey(visit.date);
    // An unparseable date is never booked - that is how an appointment came to
    // be reserved in the year 268.
    if (!key || booked.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
