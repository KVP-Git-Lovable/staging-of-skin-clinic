// Pure helpers for deciding a procedure's service name, kept out of index.ts so
// they can be unit-tested (index.ts only runs under Deno).

export interface DiagnosisFields {
  Treatment__c?: string | null;
  Procedure_Type__c?: string | null;
  Service__c?: string | null;
  Service_Type__c?: string | null;
  Type_Of_Appointment__c?: string | null;
  Visit_type__c?: string | null;
  Appointment__c?: string | null;
}

/** Shown when Salesforce records no treatment or procedure type at all. */
export const NO_SERVICE_RECORDED = "Consultation";

/**
 * What the procedure is FOR.
 *
 * Deliberately does NOT fall back to Type_Of_Appointment__c. That is a
 * visit-type picklist ("Walk-In", "Online"), not a service, and using it put
 * "Walk-In" in the Service column of every visit that was synced before its
 * treatment had been recorded in Salesforce. The field is stored verbatim in
 * review_notes, so leaving it out here loses nothing.
 */
export function procedureServiceName(
  d: DiagnosisFields,
  fromBilling?: string | null,
  fromAppointment?: string | null,
): string {
  const treatment = d.Treatment__c ? String(d.Treatment__c).replace(/;/g, ", ").trim() : "";
  return (
    treatment ||
    (d.Procedure_Type__c || "").trim() ||
    (d.Service__c || "").trim() ||
    (d.Service_Type__c || "").trim() ||
    (fromBilling || "").trim() ||
    (fromAppointment || "").trim() ||
    NO_SERVICE_RECORDED
  );
}

/**
 * Is this stored service name one we are still waiting on - i.e. safe to
 * overwrite on a re-sync?
 *
 * True for an empty value, for the "Consultation" placeholder, and for the
 * visit type an older import wrote. Anything else is a real service, whether it
 * was imported or typed into the app, and must never be overwritten.
 */
export function awaitingRealService(current: string | null | undefined, d: DiagnosisFields): boolean {
  const v = (current || "").trim().toLowerCase();
  if (!v) return true;
  if (v === NO_SERVICE_RECORDED.toLowerCase()) return true;
  return [d.Type_Of_Appointment__c, d.Visit_type__c]
    .filter(Boolean)
    .map((x) => String(x).trim().toLowerCase())
    .includes(v);
}

/**
 * Does this Investigation text say anything beyond "they came in"?
 *
 * Salesforce's Investigation__c is where the clinic types what the visit was
 * for. Most of it is a visit marker - "New Consult", "Old consult", "Review" -
 * which "Consultation" renders faithfully and keeps reports groupable. But
 * 1,244 of them carry the actual treatment on the end ("New consult + RF",
 * "Review+ 1rx Peel B"), and collapsing those to the bare word "Consultation"
 * is how a prescription came to show less than Salesforce does.
 *
 * So: strip the visit markers and the punctuation joining them. Anything left
 * is real detail and belongs in the Service column.
 */
export function investigationAddsDetail(raw: string | null | undefined): boolean {
  const rest = String(raw ?? "")
    .toLowerCase()
    .replace(/\b(new|old|1st|first|follow[- ]?up)\b/g, " ")
    .replace(/\bconsult(ation)?s?\b/g, " ")
    .replace(/\breview\b/g, " ")
    .replace(/[\s+.,;:&/-]+/g, " ")
    .trim();
  return rest.length > 0;
}
