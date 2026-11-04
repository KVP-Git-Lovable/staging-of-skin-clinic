/**
 * Which patient-days already have a bill somewhere in view.
 *
 * A patient can hold two appointment records for the same slot - the clinic's
 * 21 September list showed Kiran Shetty twice at 4:00 PM, once as "GFC" and
 * once as "Old Consult". Salesforce raised one bill of Rs 6,300 and attached it
 * to one of the two, which is correct: there was one charge. But the other row
 * then read "No bill", and that is the single case on the whole day where the
 * screen genuinely misleads - the patient WAS billed, and the money is one row
 * away.
 *
 * So the cell needs to know whether this patient has a bill on this day at all,
 * not merely whether this appointment carries it.
 *
 * Built from the rows already on screen, so it adds no query. That bounds it:
 * a sibling appointment on another page is not visible and the cell falls back
 * to "No bill", which is what it said before. Same-day duplicates sit together
 * in a date-ordered list, so in practice they are on the same page.
 */

export interface BilledDayRow {
  id: string;
  patient_id?: string | null;
  start_time?: string | null;
}

/** One key per patient per calendar day, or null when either is missing. */
export function patientDayKey(
  patientId: string | null | undefined,
  startTime: string | null | undefined,
): string | null {
  if (!patientId || !startTime) return null;
  const d = new Date(startTime);
  if (Number.isNaN(d.getTime())) return null;
  // Local day, matching how the list renders and groups its dates.
  return `${patientId}|${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function billedPatientDays(
  rows: BilledDayRow[],
  hasInvoice: (appointmentId: string) => boolean,
): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    if (!row?.id || !hasInvoice(row.id)) continue;
    const key = patientDayKey(row.patient_id, row.start_time);
    if (key) out.add(key);
  }
  return out;
}
