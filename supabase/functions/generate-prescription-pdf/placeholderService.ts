/**
 * Is this service line a consultation rather than a procedure?
 *
 * "Consultation" on a visit does not mean a treatment was performed; it means
 * the patient was seen. Printing it in the Procedure Details table of a
 * prescription reads as though something was done, so it is lifted out and any
 * notes on it print under "Visit notes" instead.
 *
 * The check used to be an exact match on "consultation", and the clinic's
 * Service Master does not stop there - it carries one consultation per doctor:
 *
 *   CONSULTATION - DR P SURAKSHA
 *   CONSULTATION - DR PUNYA SUVARNA
 *   CONSULTATION - DR ASHWINI ASHOKAN
 *   CONSULTATION- DR VINDHYA PAI      (no space before the dash)
 *
 * None of those matched, so Dr Suraksha's prescriptions kept printing
 * "CONSULTATION - DR P SURAKSHA" as a procedure. They are the same thing with
 * the doctor's name on the end, and they are priced that way - the consultation
 * fee, not a treatment.
 *
 * Only a name that IS a consultation counts. Everything after it must be a
 * dash and a name, so "COSMETIC CONSULT" - a real, separately listed service -
 * and anything like "Consultation + Peel" are left exactly where the doctor
 * put them.
 */
const CONSULTATION_ONLY = /^consultation\s*(?:-\s*.*)?$/i;

export function isPlaceholderService(name: unknown): boolean {
  return CONSULTATION_ONLY.test(String(name ?? "").trim());
}
