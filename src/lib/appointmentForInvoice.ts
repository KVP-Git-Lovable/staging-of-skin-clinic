/**
 * Which appointment a bill belongs to, when nobody said.
 *
 * A bill started from an appointment carries its id through sessionStorage, so
 * it saves linked. A bill started from the Billing page - staff pick the
 * patient by hand - carried nothing, and saved with appointment_id null. The
 * appointments list looks bills up strictly by appointment_id, so that row read
 * "No bill" while the money had been taken: reported on Spoorthi's 24 September
 * visit, a Rs 600 UPI bill that showed in the appointment's own Billing tab
 * (which lists by patient, not by appointment) and nowhere on the list.
 *
 * So the create form guesses, and shows its guess for staff to correct.
 *
 * The guess only fires when it is not really a guess. One appointment that day
 * is the whole answer. Several, and the doctor on the bill has to single one
 * out. Anything still ambiguous stays unlinked, because a bill shown against
 * the wrong visit is worse than one shown against none - the clinic reads that
 * column as "was this visit paid for".
 */

export interface LinkableAppointment {
  id: string;
  start_time?: string | null;
  staff_id?: string | null;
}

/** Same calendar day in the browser's timezone, matching how both screens group dates. */
export function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * The appointment to attach, or null to leave the bill unlinked.
 *
 * `doctorId` is only a tie-breaker: it never overrides a single same-day
 * appointment, so billing a visit to a different doctor than the one who holds
 * the slot still links.
 */
export function pickAppointmentForInvoice(
  appointments: LinkableAppointment[] | null | undefined,
  opts: { invoiceDate?: Date | null; doctorId?: string | null },
): string | null {
  if (!opts.invoiceDate || Number.isNaN(opts.invoiceDate.getTime())) return null;

  const sameDay = (appointments || []).filter((a) => {
    if (!a?.id || !a.start_time) return false;
    const when = new Date(a.start_time);
    if (Number.isNaN(when.getTime())) return false;
    return sameLocalDay(when, opts.invoiceDate as Date);
  });

  if (sameDay.length === 0) return null;
  if (sameDay.length === 1) return sameDay[0].id;

  // More than one visit that day. The doctor named on the bill is the only
  // evidence available here; without it, or if it matches more than one, say
  // nothing rather than pick.
  if (!opts.doctorId) return null;
  const byDoctor = sameDay.filter((a) => a.staff_id === opts.doctorId);
  return byDoctor.length === 1 ? byDoctor[0].id : null;
}

/**
 * The doctor to put on a bill, read from the visit it is for.
 *
 * Billing a patient from their record used to open an empty form: staff picked
 * the patient again, then the doctor, from memory. The visit already says who
 * saw them, so this reads it rather than asking.
 *
 * Same evidence and the same caution as pickAppointmentForInvoice: only that
 * day's visits count, and where they disagree about the doctor this returns
 * null rather than name the wrong one on a bill.
 */
export function doctorForInvoice(
  appointments: LinkableAppointment[] | null | undefined,
  invoiceDate: Date | null | undefined,
): string | null {
  if (!invoiceDate || Number.isNaN(invoiceDate.getTime())) return null;

  const doctors = new Set<string>();
  for (const a of appointments || []) {
    if (!a?.start_time || !a.staff_id) continue;
    const when = new Date(a.start_time);
    if (Number.isNaN(when.getTime())) continue;
    if (sameLocalDay(when, invoiceDate)) doctors.add(a.staff_id);
  }

  return doctors.size === 1 ? [...doctors][0] : null;
}
