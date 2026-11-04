/**
 * What date does a prescription belong on?
 *
 * Diagnosis__c has no date field of its own, so the import used CreatedDate -
 * the moment someone typed the record up. For the overwhelming majority that
 * is the same day as the visit and nobody notices. For 156 records it is not,
 * because the prescription was written up days, months or years afterwards,
 * and one of them was reported by the clinic:
 *
 *   Nisha (9036276451) attended on 14 May. On 17 June a second prescription
 *   was saved in Salesforce against that same 14 May appointment. The app
 *   showed it on 17 June, while borrowing the 14 May appointment's label
 *   ("Review+ 1rx Peel B") because the record carries no treatment of its own.
 *   May's label on June's date reads as a duplicate of the real 14 May row.
 *
 * Salesforce itself never shows that pairing: it files the record under the
 * appointment it is linked to. So when a prescription is linked to an
 * appointment, the appointment's start is the visit date and the honest date to
 * show. CreatedDate remains on the row as `created_at`, so when it was typed up
 * is not lost - it just stops masquerading as when the patient was seen.
 */
export function procedureDate(
  createdDate: string | null | undefined,
  apptStart?: string | null,
): string | null {
  const start = apptStart ? String(apptStart).trim() : "";
  if (start && !Number.isNaN(new Date(start).getTime())) return start;
  return createdDate ?? null;
}
