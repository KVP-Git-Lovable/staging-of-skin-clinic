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
 * it - the values come from FALLBACK_ROLES in StaffManagement. Therapists and
 * nurses: the clinic was asked once before and chose therapists only, then
 * found that nurses assist just as often, so both are offered now. Widening
 * the lookup further is a matter of adding to this array, and all four
 * pickers follow, which is the entire reason it is a shared constant and not
 * four copies of the same list.
 */
export const THERAPIST_ROLES = ["Therapist", "Nurse"] as const;

/**
 * What the appointment screens call the field.
 *
 * Only the appointment screens. The Appointments list column, the report
 * fields and every saved list view still say "Therapist", because renaming a
 * column renames it inside views the clinic has already built and saved, and
 * they asked for the picker to change, not their reports.
 */
export const THERAPIST_FIELD_LABEL = "Therapist / Nurse";

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
  therapist_id?: string | null;
  /** Everyone assigned, newest column. Empty on a row the published build wrote. */
  therapist_ids?: string[] | null;
  /** The embedded staff row, when a query joined one. */
  therapist?: { first_name?: string | null; last_name?: string | null } | null;
}

/**
 * Everyone assigned to an appointment, in the order they were chosen.
 *
 * The same fallback ProcedureDetailSheet uses for assisted_by_ids: the array
 * when it has anything in it, otherwise the single column. Both halves are
 * needed and neither is redundant - an appointment saved on clinic.quickapp.ai
 * sets therapist_id alone and leaves the array at its '{}' default, and that
 * appointment has to open here showing the person it was given.
 */
export function therapistIdsOf(
  appointment: TherapistBearing | null | undefined,
): string[] {
  if (!appointment) return [];
  const many = (appointment.therapist_ids ?? []).filter(Boolean) as string[];
  if (many.length > 0) return many;
  const one = String(appointment.therapist_id ?? "").trim();
  return one ? [one] : [];
}

/**
 * The names of everyone assigned, as one string - "Reena ., Rita .".
 *
 * Takes the ids and a lookup rather than fetching: the screens that show this
 * already have the staff loaded, and a helper that queried would be untestable
 * without mocking. `fallback` is the stored therapist_name, used when the
 * lookup has nothing for an id - a staff record that has since been deleted
 * still has its name kept on the appointment, and losing it on screen would
 * undo the whole point of keeping it.
 */
export function therapistNamesOf(
  ids: string[],
  names: Record<string, string>,
  fallback?: string | null,
): string {
  const resolved = ids.map((id) => String(names[id] ?? "").trim()).filter(Boolean);
  if (resolved.length > 0) return resolved.join(", ");
  return String(fallback ?? "").trim();
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
