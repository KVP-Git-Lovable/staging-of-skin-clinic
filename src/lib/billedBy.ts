/**
 * Who at the front desk raised a bill.
 *
 * Three people share the billing machine and the login it is signed into, so
 * the app's own user says nothing about which of them made a given invoice.
 * They are named here rather than drawn from staff or employees: those lists
 * are doctors and clinical staff, and adding front desk names to them would
 * put them in every doctor dropdown in the app.
 *
 * It is the clinic's own record. Nothing the patient sees carries it - not the
 * printed invoice, not the PDF, not the WhatsApp message.
 */
export const BILLED_BY_OPTIONS = ["Anusha", "Munasha", "Dorothy"] as const;

export type BilledBy = (typeof BILLED_BY_OPTIONS)[number];

/**
 * An older bill, or one raised before this existed, has nobody against it, and
 * a name can be removed from the list above while bills carrying it remain.
 * Both read back as whatever was stored, so a stored name is shown as it is
 * rather than being checked against the list and silently blanked.
 */
export const billedByLabel = (value?: string | null): string =>
  (value ?? "").trim() || "—";
