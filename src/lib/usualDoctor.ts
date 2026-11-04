/**
 * The doctor a patient sees, read from their last visit.
 *
 * Booking from a patient's record opens with the patient already chosen and the
 * doctor blank, so front desk pick from memory the doctor that patient always
 * sees. The record already knows: their last visit says who saw them.
 *
 * Same evidence and the same caution as doctorForInvoice - read what is there,
 * and say nothing rather than guess.
 */

export interface PastVisit {
  start_time?: string | null;
  staff_id?: string | null;
}

export function usualDoctorId(
  visits: PastVisit[] | null | undefined,
  selectableStaffIds: Iterable<string>,
): string | null {
  const selectable = new Set(selectableStaffIds);
  if (selectable.size === 0) return null;

  let bestAt = Number.NEGATIVE_INFINITY;
  let bestDoctor: string | null = null;

  for (const visit of visits || []) {
    if (!visit?.staff_id || !visit.start_time) continue;
    // A doctor who has left is not in the list, and pre-selecting one would
    // leave the field looking empty while holding a value - which then saves
    // against a doctor nobody chose.
    if (!selectable.has(visit.staff_id)) continue;

    const when = new Date(visit.start_time).getTime();
    if (Number.isNaN(when)) continue;

    if (when > bestAt) {
      bestAt = when;
      bestDoctor = visit.staff_id;
    }
  }

  return bestDoctor;
}
