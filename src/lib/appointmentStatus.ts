// Single source of truth for appointment status values. Previously this
// option set was hand-copied into ~10 different files and had drifted out
// of sync (e.g. Dashboard/Reports still listed "Scheduled"/"No-show" long
// after a migration collapsed live data down to Reserved/Confirmed/
// Cancelled) - import from here instead of redefining the list locally.

// Staff pick one of these directly (a status <Select>).
export const MANUAL_APPOINTMENT_STATUSES = ["Reserved", "Confirmed", "Checked In", "Cancelled"] as const;

// The app sets these on its own - never offered in a manual status picker.
// "Completed" fires when the appointment's own invoice becomes fully paid;
// "No Show" fires for a past Confirmed appointment nobody checked in for.
export const AUTOMATIC_APPOINTMENT_STATUSES = ["Completed", "No Show"] as const;

export const ALL_APPOINTMENT_STATUSES = [
  ...MANUAL_APPOINTMENT_STATUSES,
  ...AUTOMATIC_APPOINTMENT_STATUSES,
] as const;

export type AppointmentStatus = (typeof ALL_APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_STATUS_STYLES: Record<string, string> = {
  Reserved: "bg-info/10 text-info",
  Confirmed: "bg-primary/10 text-primary",
  "Checked In": "bg-warning/10 text-warning",
  Cancelled: "bg-destructive/10 text-destructive",
  Completed: "bg-success/10 text-success",
  "No Show": "bg-destructive/10 text-destructive",
};

/**
 * The badge classes for a status, with a fallback.
 *
 * A patient's Appts tab showed every status in the same grey badge, so a
 * cancelled visit read exactly like a completed one. The map above already had
 * the colours - it simply had no callers. Anything the map does not know
 * (older Salesforce statuses such as "Scheduled") still gets a normal muted
 * badge rather than no classes at all.
 */
export const appointmentStatusClasses = (status: string | null | undefined): string =>
  APPOINTMENT_STATUS_STYLES[(status || "").trim()] || "bg-muted text-muted-foreground";

/**
 * What the clinic calls a status on screen.
 *
 * `billed` is whether this appointment actually has a bill, where the caller
 * knows. It is the honest answer and it should be passed wherever the invoice
 * data is already to hand, because the STATUS is not a reliable record of it:
 * "Completed" is written by a database trigger when the invoice is paid, and
 * that trigger skips any appointment whose start time has not yet arrived.
 * A patient who pays on arrival, minutes before their slot, is therefore left
 * on "Confirmed" for ever - nothing re-checks afterwards. Forty of October's
 * forty-six mismatches are exactly that, and the clinic reported it the first
 * day the badge said "Billed".
 *
 * Two answers, and no guessing:
 *   billed === true  -> "Billed". It has a bill; that is the whole question.
 *   anything else    -> the status as stored. A visit marked Completed with
 *                       no bill behind it says "Completed", not "Billed".
 *
 * `undefined` used to mean "the caller cannot tell, so read the status", and
 * that guess is what the clinic reported: a patient who never attended and
 * was never invoiced read "Billed" on her Appts tab, because a Salesforce
 * import had marked the visit Completed. Across the clinic 4,759 Completed
 * appointments have no invoice at all, and - the same mistake pointing the
 * other way - 8,147 Confirmed ones DO have one and were not saying so.
 *
 * So not knowing now looks exactly like not billed. A screen that forgets to
 * pass the flag renders "Completed", which is merely less informative; it can
 * no longer assert a bill that does not exist. That is the point: the only
 * way to get the word "Billed" on screen is to have looked for the bill.
 *
 * Either way this is a label. The stored value is still "Completed" - the
 * trigger writes it, the dashboard once counted it, saved views filter on it,
 * the visit rollups and the reports read it.
 */
export const appointmentStatusLabel = (
  status: string | null | undefined,
  billed?: boolean,
): string => (billed === true ? "Billed" : (status ?? ""));

/**
 * The badge for a visit that has been billed.
 *
 * Solid rather than a tint, because the tints had run out of room: in the
 * appointments list "Confirmed" and "Completed" were both
 * `bg-success/15 text-success`, so a paid visit and an unpaid one were the
 * same pale green and the word was the only thing telling them apart. Filled
 * green keeps the colour everyone already reads as money while sitting
 * unmistakably heavier than the Confirmed beside it.
 *
 * `billed-badge` is the arrival animation (see index.css) - a single scale and
 * fade, never a loop: a day's list runs to fifty rows, and fifty looping
 * badges is fifty compositor layers on a clinic PC.
 */
export const BILLED_BADGE_CLASSES =
  "billed-badge bg-success text-success-foreground border-transparent";

/**
 * Does this row read "Billed"?
 *
 * Asked through appointmentStatusLabel rather than re-deriving it, so the
 * colour and the word cannot disagree - including on the screens that fetch no
 * invoices and fall back to reading the status.
 */
export const showsAsBilled = (status: string | null | undefined, billed?: boolean): boolean =>
  appointmentStatusLabel(status, billed) === "Billed";
