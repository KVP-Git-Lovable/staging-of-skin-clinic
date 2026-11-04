/**
 * The appointment someone is in the middle of, so they can get back to it.
 *
 * Front desk open a patient's appointment, go to Billing to raise the bill, then
 * tap Appointments to return - and land on the list, because that is what a
 * top-level menu item does. The browser's Back button works, but nobody reaches
 * for it. Remembering which appointment is open lets every other page offer one
 * tap back to it.
 *
 * sessionStorage, not a store: it has to survive a full page navigation, and it
 * should not outlive the tab. Every read and write is guarded - a private window
 * or blocked site data throws rather than returning null.
 */

const KEY = "openAppointment";

/**
 * How long the offer stands.
 *
 * Front desk finish in Billing and move on: they do not tap the chip and they
 * do not close the sheet, so nothing forgot the appointment and the chip
 * followed them onto every page for the rest of the day. Half an hour is about
 * one visit's working window, and the clock restarts every time the
 * appointment is looked at.
 */
const EXPIRY_MS = 30 * 60 * 1000;

export interface OpenAppointment {
  id: string;
  patientName: string;
}

interface StoredAppointment extends OpenAppointment {
  /** When the appointment was last open, in epoch milliseconds. */
  at: number;
}

export function rememberOpenAppointment(appointment: OpenAppointment, now = Date.now()): void {
  try {
    const stored: StoredAppointment = { ...appointment, at: now };
    sessionStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    /* private window, or site data blocked - the chip simply will not appear */
  }
}

export function forgetOpenAppointment(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* as above */
  }
}

export function readOpenAppointment(now = Date.now()): OpenAppointment | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAppointment>;
    if (!parsed?.id) return null;

    // No timestamp means it was written before the offer had an end - and a
    // chip already stuck on somebody's screen is exactly what this fixes, so it
    // counts as expired rather than living on.
    const at = typeof parsed.at === "number" ? parsed.at : null;
    if (at === null || now - at > EXPIRY_MS) {
      forgetOpenAppointment();
      return null;
    }

    return { id: parsed.id, patientName: parsed.patientName || "" };
  } catch {
    // Unparseable or unreadable. Treated as "nothing open" rather than thrown,
    // because a bad storage value must not take the whole layout down.
    return null;
  }
}

/**
 * Offer the way back everywhere except the appointment's own page - including
 * on the appointments list, which is exactly where tapping the menu item lands
 * you and where the offer is most wanted.
 */
export function shouldOfferReturn(
  pathname: string,
  remembered: OpenAppointment | null,
): boolean {
  if (!remembered?.id) return false;
  return pathname !== `/appointments/${remembered.id}`;
}

/** "Back to Ram Sundar's appointment", or a plain label when the name is unknown. */
export function returnLabel(remembered: OpenAppointment | null): string {
  const name = (remembered?.patientName || "").trim();
  return name ? `Back to ${name}'s appointment` : "Back to the appointment";
}
