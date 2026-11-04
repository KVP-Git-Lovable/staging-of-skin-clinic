/**
 * The order the appointment's Photos tab puts a patient's photos in.
 *
 * One query fetches every photo the patient has, newest first, and the tab
 * shows it as two grids: this appointment's photos under "This Appointment",
 * then the rest under "All Patient Photos".
 *
 * Which matters because the full-size viewer steps through the set with
 * chevrons and the arrow keys, and it has to step through what is on the
 * screen, in the order it is on the screen. Concatenating the two groups is
 * NOT the same as the date order they arrived in - the groups interleave by
 * date - so pressing "next" on a date-ordered list would jump to a photo
 * sitting somewhere else entirely on the page.
 *
 * The grids and the viewer therefore both come from here, and cannot end up
 * disagreeing about what follows what.
 */

export interface AppointmentLinkedPhoto {
  id: string;
  appointment_id?: string | null;
}

export interface OrderedAppointmentPhotos<T> {
  /** Shown first, under "This Appointment". */
  thisAppointment: T[];
  /** Shown after it, under "All Patient Photos". */
  others: T[];
  /** The two above, end to end: the order the page reads in. */
  ordered: T[];
}

/**
 * Split a patient's photos the way the tab displays them.
 *
 * The test for "this appointment's" is a strict id match, which is what the
 * tab has always used. The procedure sheet answers the same question with a
 * looser link-then-same-day heuristic (see `visitMedia.ts`); adopting that here
 * would change which photos appear under which heading, which is not what this
 * is for.
 */
export function orderAppointmentPhotos<T extends AppointmentLinkedPhoto>(
  photos: T[] | null | undefined,
  appointmentId: string | null | undefined,
): OrderedAppointmentPhotos<T> {
  const all = photos ?? [];
  // Without an appointment to compare against nothing can belong to it, so
  // every photo is simply "the patient's" - and the viewer still gets them all.
  const thisAppointment = appointmentId ? all.filter((p) => p.appointment_id === appointmentId) : [];
  const others = appointmentId ? all.filter((p) => p.appointment_id !== appointmentId) : [...all];
  return { thisAppointment, others, ordered: [...thisAppointment, ...others] };
}

/**
 * Where this photo sits in the order above.
 *
 * By id rather than by arithmetic on the grid's own index: the caller then
 * cannot drift out of step with the concatenation if the sections are ever
 * reordered. Returns null when the photo is not in the list, which the viewer
 * reads as "stay closed".
 */
export function photoPositionIn<T extends AppointmentLinkedPhoto>(
  ordered: T[],
  photo: Pick<T, "id">,
): number | null {
  const at = ordered.findIndex((p) => p.id === photo.id);
  return at === -1 ? null : at;
}
