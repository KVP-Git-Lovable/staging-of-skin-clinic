/**
 * Whether a booking's WhatsApp confirmation goes out, and what to say when it
 * does not.
 *
 * A send that does not happen used to be completely invisible: the booking
 * said "Appointment(s) created" and the failure went to the browser console,
 * where nobody looks. The clinic reported confirmations not reaching patients
 * and there was nothing on screen, in the app or in the database to say which
 * bookings had been skipped or why - the only way to tell was to read Twilio's
 * records afterwards and work backwards.
 *
 * So the reason is a value rather than a comment, decided in one place and
 * shown wherever a booking is confirmed - the appointments list and the
 * appointment itself - which also stops the two drifting apart.
 */

import { APPOINTMENT_CONFIRMATION_WHATSAPP_ENABLED } from "@/lib/whatsappNotifications";

export interface ConfirmationSendInput {
  /** The booking's status. Only a Confirmed one is messaged about. */
  status?: string | null;
  phone?: string | null;
  patientName?: string | null;
  /** Defaults to the clinic's setting; passed in so it can be tested. */
  enabled?: boolean;
}

export interface ConfirmationSendPlan {
  send: boolean;
  /**
   * Why not, in words a receptionist can act on. Absent when the booking was
   * never a candidate - a Reserved hold is not a missed message, and saying so
   * on every booking would be noise.
   */
  skippedBecause?: string;
}

export function confirmationSendPlan({
  status,
  phone,
  patientName,
  enabled = APPOINTMENT_CONFIRMATION_WHATSAPP_ENABLED,
}: ConfirmationSendInput): ConfirmationSendPlan {
  // A provisional hold is not a missed confirmation. Confirming it later goes
  // through the status-change path, which sends the same template.
  if ((status ?? "").trim() !== "Confirmed") return { send: false };

  if (!enabled) {
    return { send: false, skippedBecause: "Appointment confirmations are switched off, so no WhatsApp was sent." };
  }
  if (!(phone ?? "").trim()) {
    return { send: false, skippedBecause: "No phone number on this patient's record, so no WhatsApp was sent." };
  }
  if (!(patientName ?? "").trim()) {
    return { send: false, skippedBecause: "This appointment has no patient linked, so no WhatsApp was sent." };
  }
  return { send: true };
}
