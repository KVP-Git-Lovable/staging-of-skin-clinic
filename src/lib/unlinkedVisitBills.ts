/**
 * Finding a bill that was never attached to its visit.
 *
 * The appointments list reads bills strictly by appointment_id, so any bill
 * that saves with that column null makes a paid visit read "No bill" - the
 * clinic's most-reported complaint, because the front desk uses that column to
 * decide whether to ask for money. The link is settled properly at save now
 * (invoiceAppointmentLink.ts), but that only helps bills raised from here on:
 * older ones are already unlinked, and anything that deletes an appointment
 * detaches its bills silently, because invoices.appointment_id is ON DELETE
 * SET NULL.
 *
 * So the list also looks for an unattached bill belonging to the same patient
 * on the same day. It only claims one where there can be no doubt: exactly one
 * such bill, and exactly one visit that day for that patient. Two of either and
 * it says nothing, because a bill shown against the wrong visit is worse than
 * one shown against none.
 */

import { patientDayKey } from "@/lib/billedPatientDays";

export interface UnlinkedBillRow {
  id?: string;
  patient_id?: string | null;
  created_at?: string | null;
  status?: string | null;
}

export interface VisitRow {
  id: string;
  patient_id?: string | null;
  start_time?: string | null;
}

/**
 * The linked-bill map with the unambiguous unattached bills folded in.
 *
 * `linked` is left untouched: a bill that names its visit always wins.
 */
export function withUnlinkedBills<T extends UnlinkedBillRow>(
  linked: Map<string, T>,
  bills: T[],
  visits: VisitRow[],
): Map<string, T> {
  // A cancelled bill is not what a visit was charged, so it can neither be
  // claimed by a visit nor make the day look ambiguous enough to claim nothing.
  bills = bills.filter((b) => !["Cancelled", "Merged"].includes(String(b?.status ?? "")));
  if (!bills.length) return linked;

  // One entry per visit, however many of the page's lists it appears in.
  const seen = new Set<string>();
  const uniqueVisits: VisitRow[] = [];
  for (const visit of visits) {
    if (!visit?.id || seen.has(visit.id)) continue;
    seen.add(visit.id);
    uniqueVisits.push(visit);
  }

  const visitsByDay = new Map<string, VisitRow[]>();
  for (const visit of uniqueVisits) {
    const key = patientDayKey(visit.patient_id, visit.start_time);
    if (!key) continue;
    const list = visitsByDay.get(key);
    if (list) list.push(visit);
    else visitsByDay.set(key, [visit]);
  }

  const billsByDay = new Map<string, T[]>();
  for (const bill of bills) {
    const key = patientDayKey(bill.patient_id, bill.created_at);
    if (!key) continue;
    const list = billsByDay.get(key);
    if (list) list.push(bill);
    else billsByDay.set(key, [bill]);
  }

  const merged = new Map(linked);
  for (const [key, dayBills] of billsByDay) {
    if (dayBills.length !== 1) continue;
    const dayVisits = visitsByDay.get(key);
    if (!dayVisits || dayVisits.length !== 1) continue;
    // A visit that already carries its own bill is never overwritten.
    if (merged.has(dayVisits[0].id)) continue;
    merged.set(dayVisits[0].id, dayBills[0]);
  }
  return merged;
}
