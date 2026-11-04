/**
 * Who carried out the treatment on an appointment.
 *
 * The clinic records a doctor on every appointment, but the person who
 * actually performs the treatment is usually a therapist, and until now there
 * was nowhere to put them - the name was typed into the notes by hand, or
 * lost. These are the few decisions that go with the new `therapist_id`
 * column, kept here rather than inlined so the four screens that assign a
 * therapist cannot drift apart from one another.
 */

/**
 * Whose names fill the therapist lookup.
 *
 * Matched against `staff.role`, which is free text with no constraint behind
 * it - the values come from FALLBACK_ROLES in StaffManagement. Exactly one
 * role for now; the clinic was asked and chose therapists only, not nurses.
 * Widening the lookup is a matter of adding to this array, and every picker
 * follows, which is the entire reason it is a shared constant and not four
 * copies of `["Therapist"]`.
 */
export const THERAPIST_ROLES = ["Therapist"] as const;

/** The staff columns a therapist picker needs, and nothing more. */
export interface TherapistCandidate {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  role?: string | null;
}

/**
 * Whether a staff row may be assigned as a therapist.
 *
 * Case- and whitespace-insensitive on purpose: `staff.role` is free text with
 * no constraint behind it, so a row saved as "therapist" must not quietly
 * vanish from the lookup.
 */
export function isTherapistRole(role: string | null | undefined): boolean {
  const r = String(role ?? "").trim().toLowerCase();
  return THERAPIST_ROLES.some((t) => t.toLowerCase() === r);
}

/** The shape the name helpers need - anything appointment-like will do. */
export interface TherapistBearing {
  therapist_name?: string | null;
  /** The embedded staff row, when a query joined one. */
  therapist?: { first_name?: string | null; last_name?: string | null } | null;
}

/**
 * The therapist's name for display, or "" when nobody is assigned.
 *
 * `therapist_name` is preferred over the joined staff row for the same reason
 * `getDoctorName` prefers its equivalent: the column is filled by a database
 * trigger and then kept, so a therapist who has since left the clinic still
 * shows on the visits they worked, where the join would have gone null.
 */
export function therapistDisplayName(
  appointment: TherapistBearing | null | undefined,
): string {
  if (!appointment) return "";
  const stored = String(appointment.therapist_name ?? "").trim();
  if (stored) return stored;
  const joined = appointment.therapist;
  if (!joined) return "";
  return `${joined.first_name ?? ""} ${joined.last_name ?? ""}`.trim();
}

/**
 * The title a new note opens with once a therapist is assigned.
 *
 * Deliberately the same sentence `sf-import-therapy-notes` writes for notes
 * imported from Salesforce (its `noteTitle`), so a note typed here and a note
 * that came across in the migration read identically in the same list. If one
 * of the two is ever reworded, the other has to follow - there is a test that
 * fails when they disagree.
 *
 * Returns "" for no therapist, which means "no prefill": the composer must
 * open empty rather than with a title about nobody.
 */
export function therapistNoteTitle(name: string | null | undefined): string {
  const trimmed = String(name ?? "").trim();
  return trimmed ? `Therapy note - ${trimmed}` : "";
}
