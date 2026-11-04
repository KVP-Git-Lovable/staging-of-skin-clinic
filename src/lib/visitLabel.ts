/**
 * Naming a visit the way the clinic names it.
 *
 * A bill was raised for Vaishnavi Shenoy on 5 October and attached to her
 * 13 June appointment - 114 days away from the money. Not carelessness: the
 * appointments list labels a visit by its Investigation
 * (reason_for_consultation), which is where every appointment booked in this app
 * puts the treatment, while the bill's Linked Appointment picker labelled it by
 * `service`, which the app leaves empty and only the Salesforce import ever
 * filled. 350 appointments since 1 September have an empty service.
 *
 * So the biller hunting for "5RX Face Hair Reduction" saw today's visit as a
 * bare "Visit" and the four-month-old one named after the treatment, and picked
 * the one that read right. One label now, from the column the clinic reads.
 */

export interface LabelledVisit {
  reason_for_consultation?: string | null;
  service?: string | null;
}

export function visitLabel(appointment: LabelledVisit | null | undefined): string {
  const investigation = (appointment?.reason_for_consultation ?? "").trim();
  if (investigation) return investigation;
  const service = (appointment?.service ?? "").trim();
  return service || "Visit";
}
