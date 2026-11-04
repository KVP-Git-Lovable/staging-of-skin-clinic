/**
 * Which of a patient's photos and documents belong to the visit on screen.
 *
 * The prescription screen used to ask for images by procedure_id alone. Of the
 * 89,922 photos and 40,833 documents imported from Salesforce, none carry a
 * procedure_id and four carry an appointment_id - the import kept the patient
 * link and nothing else. So the screen read "No photos yet" for every patient
 * who had any, which is how a clinic concludes its consent forms were lost.
 *
 * They were not lost. They just have to be found by patient and then sorted,
 * which is what this does: an image belongs to this visit if it is linked to it,
 * or - failing any link - if it was taken on the same day. Everything else is
 * still the same patient's and stays on screen under "other visits", because
 * guessing wrong here should never hide a clinical photo.
 */

export interface VisitMediaItem {
  procedure_id?: string | null;
  appointment_id?: string | null;
  taken_at?: string | null;
  created_at?: string | null;
}

export interface VisitRef {
  procedureId?: string | null;
  appointmentId?: string | null;
  date?: string | null;
}

/** The date an image carries: when it was taken, or failing that when it landed. */
export function mediaDate(item: VisitMediaItem): string | null {
  return item.taken_at || item.created_at || null;
}

/** Same calendar day, in the viewer's timezone - which is the clinic's. */
export function isSameDay(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const x = new Date(a);
  const y = new Date(b);
  if (Number.isNaN(x.getTime()) || Number.isNaN(y.getTime())) return false;
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

/**
 * True when this image belongs to the visit on screen.
 *
 * An explicit link always wins over the date, in both directions: an image
 * linked to a different procedure is not this visit's even if it was taken the
 * same day, because someone recorded where it belongs and that beats a guess.
 */
export function belongsToVisit(item: VisitMediaItem, visit: VisitRef): boolean {
  if (item.procedure_id && visit.procedureId) return item.procedure_id === visit.procedureId;
  if (item.appointment_id && visit.appointmentId) return item.appointment_id === visit.appointmentId;
  // Linked to some other visit entirely - not ours to claim.
  if (item.procedure_id || item.appointment_id) return false;
  return isSameDay(mediaDate(item), visit.date);
}

/** Split a patient's images into this visit's and the rest, newest first. */
export function partitionVisitMedia<T extends VisitMediaItem>(
  items: T[],
  visit: VisitRef,
): { thisVisit: T[]; otherVisits: T[] } {
  const thisVisit: T[] = [];
  const otherVisits: T[] = [];
  for (const item of items) (belongsToVisit(item, visit) ? thisVisit : otherVisits).push(item);
  return { thisVisit, otherVisits };
}
