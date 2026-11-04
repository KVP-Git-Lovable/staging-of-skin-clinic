import { hasRealName, isPhoneLikeName, rawPatientName, type NamedPatient } from "@/lib/patientName";
import { isVipPatient } from "@/lib/vipPatient";

/**
 * Whose name goes on an appointment.
 *
 * An appointment stores the patient twice: `patient_id`, the link to the record,
 * and `patient_name`, a text copy written when it was booked. Nineteen screens
 * each decided for themselves which to show and they did not agree - the list
 * showed the copy, the detail page showed the record, and one list row managed
 * to show both at once, the patient's photo and initials from the record beside
 * text from the copy.
 *
 * A family of four sharing one phone number is all it took for that to become
 * visible: a booking for the fifth session of Baazi's course was filed under her
 * sister Saher's name, so the list read Saher and the page behind it read Baazi.
 *
 * The linked record wins. That is the record the clinic prescribes on,
 * photographs, bills and counts visits against, so it is the name that has to be
 * on screen. The stored copy answers only where a screen fetched appointments
 * without the patient join - global search, staff detail, the photo picker, the
 * appointments report - and a trigger now keeps it in step with the record.
 */

export interface LabelledAppointment {
  patient_name?: string | null;
  patients?: (NamedPatient & { is_vip?: boolean | null }) | null;
}

const tidy = (text: string | null | undefined): string => (text ?? "").replace(/\s+/g, " ").trim();

/**
 * The name to show for an appointment: the linked record, else the stored copy.
 *
 * The one case where the copy still wins is a record with no readable name on
 * it - 153 imported patients hold their phone number where a first name should
 * be, and swapping a readable name for a row of digits would be a step back.
 * That cannot bring back the fault this module exists to end: that needs two
 * real names, and a real name on the record always wins.
 */
export function appointmentPatientName(
  appointment: LabelledAppointment | null | undefined,
  fallback = "—"
): string {
  const linked = rawPatientName(appointment?.patients);
  const stored = tidy(appointment?.patient_name);
  if (hasRealName(appointment?.patients)) return linked;
  if (stored && !isPhoneLikeName(stored)) return stored;
  return linked || stored || fallback;
}

/**
 * The two halves of that same name, for the avatar standing next to it.
 *
 * Taken from whichever source the text is taken from, because a photo of one
 * patient labelled with another's name is worse than either alone.
 */
export function appointmentPatientInitials(
  appointment: LabelledAppointment | null | undefined
): { firstName: string; lastName: string } {
  if (hasRealName(appointment?.patients)) {
    return {
      firstName: tidy(appointment?.patients?.first_name),
      lastName: tidy(appointment?.patients?.last_name),
    };
  }
  const parts = appointmentPatientName(appointment, "").split(" ");
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}

/**
 * Both names, for a search box - never for a label.
 *
 * A haystack is not a name. The server still searches the stored copy, because
 * PostgREST cannot filter rows by a joined column, so a client-side filter
 * reading only the record would hide rows the server had just matched - and a
 * booking anyone remembers by the name it was taken under stays findable by it.
 * Searching only ever finds more this way, never less.
 */
export function appointmentPatientHaystack(
  appointment: LabelledAppointment | null | undefined
): string {
  const linked = rawPatientName(appointment?.patients);
  const stored = tidy(appointment?.patient_name);
  if (!stored || stored.toLowerCase() === linked.toLowerCase()) return linked || stored;
  return `${linked} ${stored}`.trim();
}

/**
 * The initials for a plain lettered circle, by the same rule PatientAvatar uses.
 *
 * The dashboard built these by hand as `first_name[0] + last_name[0]`, which
 * renders the literal text "Bundefined" for a patient with no surname - and
 * every imported patient in this clinic whose name arrived as one word has no
 * surname.
 */
export function appointmentPatientInitialsText(
  appointment: LabelledAppointment | null | undefined
): string {
  const { firstName, lastName } = appointmentPatientInitials(appointment);
  return `${firstName[0] || "?"}${lastName[0] || ""}`.toUpperCase();
}

/**
 * Is the patient on this appointment one the front desk must recognise?
 *
 * Only the linked record can answer. The stored `patient_name` copy is text
 * written when the booking was taken, and it knows nothing about the patient
 * besides what they were called that day - so an appointment fetched without
 * the patient join reports false, rather than guessing from a name.
 *
 * That matters more here than for a label: a wrongly absent crown is a VIP the
 * front desk does not greet, but a wrongly present one sends them fussing over
 * somebody who is not. False is the safe way to be wrong, and the fix is to
 * join the column.
 */
export function appointmentPatientIsVip(
  appointment: LabelledAppointment | null | undefined
): boolean {
  // Delegated, so the appointment screens and the patients list cannot come to
  // disagree about who is a VIP.
  return isVipPatient(appointment?.patients);
}
