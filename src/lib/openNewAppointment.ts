/**
 * Does a newly booked appointment open for checking?
 *
 * Front desk book from the New Appointment dialog, it closes, and they are
 * back on the list with no sign of what they just entered - so the only way to
 * check the time, the doctor or the service was to find the row and open it.
 * Opening it for them turns that into nothing to do.
 *
 * Two things already appear the moment a booking is saved, and the detail must
 * not be thrown on top of either:
 *
 *   - a recurring booking makes a whole series, so there is no single
 *     appointment to show, and the billing prompt follows immediately;
 *   - a survey marked "fill now" opens its own form over the page.
 *
 * Neither is a rule about appointments; both are about what else is already
 * claiming the screen, which is why this is one place rather than a condition
 * grown onto the end of the save.
 */
export interface NewAppointmentOutcome {
  /** The appointment just inserted, when exactly one was. */
  appointmentId?: string | null;
  /** The booking made a series rather than a single appointment. */
  wasRecurring?: boolean;
  /** A survey form is about to open over the page. */
  surveyToFillNow?: boolean;
}

export function shouldOpenNewAppointment(outcome: NewAppointmentOutcome): boolean {
  if (!(outcome.appointmentId ?? "").trim()) return false;
  if (outcome.wasRecurring) return false;
  if (outcome.surveyToFillNow) return false;
  return true;
}
