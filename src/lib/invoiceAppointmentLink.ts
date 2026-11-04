/**
 * Settling which visit a bill belongs to at the moment it is saved.
 *
 * The create form already guesses the visit and shows the guess for staff to
 * correct, but the guess is computed from a list that is fetched when the
 * patient is picked. Billing is fast here - Bobby's bill was raised 37 seconds
 * after his appointment was touched - and a biller who picks the patient and
 * saves straight away can get there before that fetch returns. The form then
 * holds an empty list, the guess is null, and the bill saves with
 * appointment_id null. The appointments list looks bills up by that column, so
 * the visit reads "No bill" although the money was taken.
 *
 * So the save does not trust what happens to be in state: where nothing is
 * linked and nobody chose "Not linked", it reads the patient's appointments
 * itself and applies the same rule. Awaiting one query at save time is
 * cheaper than a bill that has to be found and re-linked by hand.
 */

import { pickAppointmentForInvoice, type LinkableAppointment } from "@/lib/appointmentForInvoice";

export interface ResolveInvoiceLinkOptions {
  /** undefined = staff never touched the picker; "" = they chose "Not linked". */
  explicitChoice: string | undefined;
  /** What the form currently shows - a prefilled or already-guessed visit. */
  formValue: string;
  patientId: string;
  invoiceDate?: Date | null;
  doctorId?: string | null;
  /** Reads the patient's appointments; only called when it can change the answer. */
  loadAppointments: (patientId: string) => Promise<LinkableAppointment[]>;
}

export async function resolveInvoiceAppointmentId({
  explicitChoice,
  formValue,
  patientId,
  invoiceDate,
  doctorId,
  loadAppointments,
}: ResolveInvoiceLinkOptions): Promise<string | null> {
  // "Not linked" is a decision, and a bill deliberately left off a visit stays
  // off it. Only an untouched picker gets a second opinion.
  if (explicitChoice === "") return null;
  if (formValue) return formValue;
  if (!patientId) return null;

  try {
    const appointments = await loadAppointments(patientId);
    return pickAppointmentForInvoice(appointments, { invoiceDate, doctorId });
  } catch {
    // A bill that saves unlinked is recoverable; a bill that does not save at
    // all is money the clinic has taken and has no record of.
    return null;
  }
}
