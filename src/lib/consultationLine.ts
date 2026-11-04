/**
 * A consultation is not a service, and should not be presented as one.
 *
 * The clinic's Service Master has no row called Consultation. The name got
 * onto 15,653 procedure_services rows and 24,514 procedures during the
 * Salesforce import, where it stands for "the patient was seen", not for
 * work done - so it filled the Services/Procedures panel with a service
 * nobody performed.
 *
 * It cannot simply be dropped. Of those service rows, 10,586 carry procedure
 * notes and 9,178 carry recommendations: the consultation line is where a
 * great deal of what the doctor wrote actually lives. So the label goes and
 * the writing stays, shown as the visit's own notes rather than a service.
 *
 * Matched exactly, not by prefix, and deliberately the same test as
 * isPlaceholderService in generate-prescription-pdf, so the screen and the
 * printed document agree about what counts. "Consultation fee" and
 * "Cosmetic Consultation" are real billed services and are left alone -
 * neither appears in procedure_services today, but naming the intent here
 * beats discovering it later.
 */
export function isConsultationService(name: string | null | undefined): boolean {
  return (name ?? "").trim().toLowerCase() === "consultation";
}
