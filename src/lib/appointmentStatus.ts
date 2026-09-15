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
