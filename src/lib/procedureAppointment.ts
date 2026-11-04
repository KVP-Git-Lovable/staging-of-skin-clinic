import { supabase } from "@/integrations/supabase/client";

/**
 * Whether a visit can still be filed against the appointment it was opened from.
 *
 * procedures.appointment_id is a foreign key onto appointments, and the front
 * desk deletes appointments constantly - twenty in three days. Open a visit
 * from an appointment, have that appointment deleted while the consultation is
 * being written up, press Save, and the whole thing is rejected:
 *
 *   insert or update on table "procedures" violates foreign key constraint
 *   "procedures_appointment_id_fkey"
 *
 * which is what the clinic hit at 13:08 on 20 Oct, the same minute an
 * appointment was deleted. The doctor loses everything typed, over a link to a
 * record that no longer exists.
 *
 * So a link to an appointment that has gone is dropped and the visit saved
 * against the patient instead. That is not a compromise: the foreign key is
 * ON DELETE SET NULL, so a procedure whose appointment is deleted a second
 * later ends up with exactly this - no appointment, patient intact. Saving it
 * that way reaches the same state the database would have reached on its own,
 * and the clinical record survives.
 */

export interface AppointmentLink {
  /** What to write to procedures.appointment_id. */
  id: string | null;
  /** True when a real appointment was named and has since been deleted. */
  removed: boolean;
}

export function decideAppointmentLink(
  appointmentId: string | null | undefined,
  appointmentExists: boolean,
): AppointmentLink {
  const id = (appointmentId ?? "").trim();
  // No appointment named: a walk-in, or a visit opened from the patient. There
  // was never a link and nothing has been lost.
  if (!id) return { id: null, removed: false };
  return appointmentExists ? { id, removed: false } : { id: null, removed: true };
}

/** Said once, so the front desk knows why the visit is not under the appointment. */
export const APPOINTMENT_REMOVED_NOTICE =
  "That appointment has been deleted, so this visit was saved against the patient without it.";

/**
 * The same decision, after asking the database whether the appointment is
 * still there. Called immediately before the write, so the answer is as fresh
 * as it can be - a deletion in the moments after this is what ON DELETE SET
 * NULL is for.
 */
export async function appointmentLinkForSave(
  appointmentId: string | null | undefined,
): Promise<AppointmentLink> {
  const id = (appointmentId ?? "").trim();
  if (!id) return { id: null, removed: false };
  const { data, error } = await supabase.from("appointments").select("id").eq("id", id).maybeSingle();
  // A lookup that failed for its own reasons (offline, a transient error) must
  // not throw the link away - the insert is the better judge then, and it is
  // the case the foreign key already handles correctly.
  if (error) return { id, removed: false };
  return decideAppointmentLink(id, Boolean(data));
}

/**
 * Is this visit about to be filed under an appointment from another day?
 *
 * The Appointments list puts an "Add Prescription" button on every row, and it
 * carries that row's id straight into the form - which never showed which
 * appointment it was filing under. So an out-of-date row on screen became a
 * prescription on an out-of-date visit, with nothing to give it away.
 *
 * It is not rare. Of 1,643 prescriptions linked to an appointment in the last
 * 90 days, 14 sit on an appointment from a different day - 7, 11, 30, 49, 57,
 * 69, 121, 162, 325 and 612 days earlier - and 13 of those were written here
 * rather than imported. In every one of the 13 the patient had an appointment
 * that same day which was passed over. About one a week.
 *
 * Deliberately a question and not a rule. Writing up yesterday evening's
 * clinic the next morning is ordinary and has to stay possible, so the caller
 * asks rather than refuses. Nothing is flagged when no appointment was named -
 * a walk-in has no link to be wrong about.
 */
export interface AppointmentDayCheck {
  /** True when the appointment is on a different calendar day from the write-up. */
  mismatched: boolean;
  /** The appointment's own day, for saying so out loud. Empty when there is none. */
  dayLabel: string;
}

const DAY_LABEL: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

export function appointmentDayMismatch(
  appointmentStart: string | null | undefined,
  writtenOn: Date,
): AppointmentDayCheck {
  if (!appointmentStart) return { mismatched: false, dayLabel: "" };
  const when = new Date(appointmentStart);
  // An unreadable stored date is not evidence of anything; the save proceeds
  // and the foreign key remains the judge of whether the row exists.
  if (Number.isNaN(when.getTime())) return { mismatched: false, dayLabel: "" };

  const sameDay =
    when.getFullYear() === writtenOn.getFullYear() &&
    when.getMonth() === writtenOn.getMonth() &&
    when.getDate() === writtenOn.getDate();

  return {
    mismatched: !sameDay,
    dayLabel: when.toLocaleString(undefined, DAY_LABEL),
  };
}
