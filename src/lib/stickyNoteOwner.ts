/**
 * Which table a sticky note belongs to.
 *
 * The same card serves procedures and appointments, and the two keep their notes
 * in separate tables: procedure_sticky_notes.procedure_id is NOT NULL against
 * procedures, and most appointments never have a procedure, so they cannot share
 * a row. Resolving the table in one tested place keeps that fork out of the five
 * query/insert/update/delete sites in the component.
 */

export interface StickyNoteOwner {
  table: "procedure_sticky_notes" | "appointment_sticky_notes";
  column: "procedure_id" | "appointment_id";
  id: string;
}

export interface StickyNoteOwnerInput {
  procedureId?: string | null;
  appointmentId?: string | null;
}

/**
 * The owner to read and write, or null for draft mode - a note being composed
 * before its procedure exists, which the caller buffers and flushes itself.
 *
 * Throws when given both. Silently preferring one would write a therapist's note
 * to the wrong record, and no caller has a reason to pass both.
 */
export function stickyNoteOwner({ procedureId, appointmentId }: StickyNoteOwnerInput): StickyNoteOwner | null {
  const procedure = (procedureId ?? "").trim();
  const appointment = (appointmentId ?? "").trim();

  if (procedure && appointment) {
    throw new Error("StickyNotes: pass procedureId or appointmentId, not both.");
  }
  if (procedure) return { table: "procedure_sticky_notes", column: "procedure_id", id: procedure };
  if (appointment) return { table: "appointment_sticky_notes", column: "appointment_id", id: appointment };
  return null;
}
