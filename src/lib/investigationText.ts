/**
 * What the "Investigation" column shows, for one appointment.
 *
 * There is no `investigation` column in the database. The label sits over
 * `appointments.reason_for_consultation`, which the Salesforce importer fills
 * from `Investigation__c` (see cleanInvestigationText in
 * supabase/functions/sf-import-clinical/consultation.ts).
 *
 * The resolved `service` is the fallback rather than the primary, because on
 * imported records it usually collapses to "Consultation" and hides what was
 * actually done - which is the whole reason the column was relabelled.
 *
 * That fallback is only right for records nobody here typed. On a visit this
 * app booked, blank means the doctor left it blank - and showing the service
 * instead read as the app inventing an investigation of its own. On a
 * recurring course with no service lines it was worse: the booking writes
 * "Follow Up" as the service, so the Investigation column announced
 * "Follow Up" for a visit nobody had described. 64 of the 69 visits booked
 * from a prescription were blank and every one of them showed something.
 *
 * So the fallback now applies only to rows this app did not create. A row
 * whose source is not one of ours - Salesforce's 56,274, or anything whose
 * source was not fetched - behaves exactly as before, which is the safe
 * direction to fail in: 6,221 imported visits rely on it.
 *
 * One function rather than the expression written out at each call site: the
 * list and the printout disagreeing about what a row says is exactly the bug
 * this replaced.
 */

/** Values `appointments.source` carries for a visit booked inside the app. */
const APP_CREATED_SOURCES = ["procedure", "walk-in", "restored visit"];

export interface InvestigationRow {
  reason_for_consultation?: string | null;
  service?: string | null;
  /** Where the visit came from. Absent is treated as "not ours". */
  source?: string | null;
}

export function investigationText(row: InvestigationRow | null | undefined, fallback = ""): string {
  // Trimmed, so a whitespace-only imported value falls through to the service
  // name instead of rendering an empty cell.
  const reason = String(row?.reason_for_consultation ?? "").trim();
  if (reason) return reason;
  if (APP_CREATED_SOURCES.includes(String(row?.source ?? "").trim().toLowerCase())) return fallback;
  const service = String(row?.service ?? "").trim();
  if (service) return service;
  return fallback;
}
