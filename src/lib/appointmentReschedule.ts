/**
 * A visit that happened is not a free slot.
 *
 * Tahniya was seen on 25 September and billed ₹3,000. Her history showed no
 * 25 September visit at all, and the bill sat against a 2 October booking that
 * had not happened yet. Nothing had gone wrong with the display: her next
 * session was booked by editing the date on the appointment she had already
 * attended, so the visit was overwritten and its bill rode along to a future
 * date. The app allowed it without a word.
 *
 * The clinic must keep rescheduling freely - a slot moves all day long - so
 * this asks in one case only: something has already happened at the
 * appointment (a bill or a procedure) and it is being moved to a different
 * day. That is not a reschedule; it is next week's booking being written over
 * a visit that has taken place, and the answer is almost always a new
 * appointment.
 *
 * It used to require the appointment to be in the past as well, and that let
 * the same thing happen again. Alister Moras was seen at 11:07 on 21 October,
 * his prescription written, and at 11:09 the date on that appointment was
 * moved to 19 November - two minutes later, and still an hour before the
 * 12:15 slot it was booked for. The clock said "future booking, move it
 * freely" while the notes said a consultation had already happened. The
 * clinic sees people early all day, so what matters is whether a visit is
 * recorded, not whether the hand has passed the hour.
 */

export interface ReschedulableAppointment {
  start_time?: string | null;
}

/** What booking a replacement needs to copy from the visit being protected. */
export interface BookableAppointment extends ReschedulableAppointment {
  id?: string;
  end_time?: string | null;
  patient_id?: string | null;
  patient_name?: string | null;
  staff_id?: string | null;
  service?: string | null;
}

export interface VisitEvidence {
  /** A bill raised for this appointment. */
  hasInvoice?: boolean;
  /** Clinical notes recorded against it. */
  hasProcedure?: boolean;
}

export type RescheduleVerdict = "allow" | "confirm";

/** Same calendar day in the browser's timezone, as every other screen groups dates. */
const sameLocalDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * "confirm" when moving this appointment would erase a visit that happened.
 *
 * Everything else is "allow", so the ordinary work of the day - dragging a
 * booking nothing has happened at, correcting a time, moving a slot nobody
 * turned up to - is untouched and silent.
 */
export function rescheduleVerdict(
  appointment: ReschedulableAppointment | null | undefined,
  newStart: string | Date | null | undefined,
  evidence: VisitEvidence = {},
): RescheduleVerdict {
  const current = appointment?.start_time ? new Date(appointment.start_time) : null;
  if (!current || Number.isNaN(current.getTime())) return "allow";

  // The evidence decides, not the clock. A slot with nothing recorded against
  // it moves freely whenever it is - that is the ordinary work of the day.
  if (!evidence.hasInvoice && !evidence.hasProcedure) return "allow";

  const next = newStart ? new Date(newStart) : null;
  if (!next || Number.isNaN(next.getTime())) return "allow";
  // Correcting the time of a visit that happened is still that visit.
  if (sameLocalDay(current, next)) return "allow";

  return "confirm";
}

/** What the dialog says, built from the evidence so it names the real cost. */
export function rescheduleWarning(evidence: VisitEvidence): string {
  if (evidence.hasInvoice && evidence.hasProcedure) {
    return "This visit already has a bill and clinical notes against it.";
  }
  if (evidence.hasInvoice) return "This visit already has a bill against it.";
  return "This visit already has clinical notes against it.";
}
