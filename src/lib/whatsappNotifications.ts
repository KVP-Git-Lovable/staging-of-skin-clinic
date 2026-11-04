/**
 * Which WhatsApp messages the clinic is sending about appointments.
 *
 * Switched off on 1 October 2026 at the clinic's request and back on on
 * 14 October, once the reworded template - CONFIRM / RESCHEDULE / CANCEL, with
 * the date and the time on their own lines - was approved by WhatsApp.
 *
 * On means both: a patient is messaged when an appointment is booked as
 * Confirmed, and when the front desk sets an existing one to Confirmed. A
 * booking made as Reserved, which is a provisional hold, sends nothing until
 * somebody confirms it.
 *
 * Cancellations never went off and do not read this. Somebody who has been told
 * not to come needs to know, whatever else is switched off.
 *
 * Every send site reads this one constant, so it is the only thing that has to
 * change either way - the templates, the edge functions and the quick-reply
 * buttons all stay where they are.
 */
export const APPOINTMENT_CONFIRMATION_WHATSAPP_ENABLED = true;
