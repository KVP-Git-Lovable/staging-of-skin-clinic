// Which WhatsApp templates this clinic actually uses.
//
// The Twilio account behind this project carries templates that have nothing to
// do with the clinic, and "Import from API" pulls the whole account in. Rather
// than curating the list by hand after every import, both places that show
// templates - the Templates page and the Journey Builder's approved-template
// picker - filter on the name.
//
// Matching is on the name only, case-insensitive, substring: "Skin_Consult",
// "appointment_reminder" and "APPOINTMENT-2" all match. Deliberately not the
// body, which would match any message that happens to mention an appointment.
export const TEMPLATE_NAME_KEYWORDS = ["skin", "appointment"] as const;

/** True when a template's name marks it as one of this clinic's. */
export function isClinicTemplate(name: string | null | undefined): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return TEMPLATE_NAME_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/** Human-readable form of the rule, for captions and empty states. */
export const TEMPLATE_FILTER_LABEL = TEMPLATE_NAME_KEYWORDS.map((k) => `"${k}"`).join(" or ");

/** Keep only the templates this clinic uses. Accepts anything with a name. */
export function onlyClinicTemplates<T extends { name: string | null }>(rows: T[]): T[] {
  return rows.filter((row) => isClinicTemplate(row.name));
}
