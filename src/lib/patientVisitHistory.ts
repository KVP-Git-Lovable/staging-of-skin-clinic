import { z } from "zod";

/**
 * A patient's earlier visits, as seen from inside one of them.
 *
 * The Previous Appointments tab used to read `appointments` directly. For a
 * therapist or nurse that returns almost nothing: 20261113210000 scoped the
 * table to the visits they were put on, so a patient's other visits - worked
 * by somebody else - are invisible, and the tab read "No other appointments
 * for this patient." every time.
 *
 * It now calls patient_visit_history(), which answers the narrower question
 * "you can open this visit, so what else has this patient had?". The rows
 * carry `can_open`, which says whether the full detail sheet would actually
 * load: the sheet uses maybeSingle(), so a row the policy still hides would
 * open a blank page rather than fail.
 */

export const visitRowSchema = z.object({
  id: z.string(),
  start_time: z.string(),
  end_time: z.string().nullable().default(null),
  status: z.string().nullable().default(null),
  visit_status: z.string().nullable().default(null),
  service: z.string().nullable().default(null),
  appointment_type: z.string().nullable().default(null),
  consultation_type: z.string().nullable().default(null),
  consultation_reasons: z.array(z.string()).nullable().default(null),
  reason_for_consultation: z.string().nullable().default(null),
  source: z.string().nullable().default(null),
  doctor_name: z.string().nullable().default(null),
  therapist_name: z.string().nullable().default(null),
  staff_first_name: z.string().nullable().default(null),
  staff_last_name: z.string().nullable().default(null),
  can_open: z.boolean().default(false),
});
export type VisitRow = z.infer<typeof visitRowSchema>;

export const visitNoteSchema = z.object({
  id: z.string(),
  title: z.string().nullable().default(null),
  content: z.string().nullable().default(null),
  created_at: z.string(),
  author_first_name: z.string().nullable().default(null),
  author_last_name: z.string().nullable().default(null),
});
export type VisitNote = z.infer<typeof visitNoteSchema>;

/**
 * Tolerant parser in the house style: a malformed row is dropped rather than
 * thrown, because this renders on a screen a clinician is standing in front
 * of. One bad row must not blank a patient's whole history.
 */
export function visitRows(rows: unknown): VisitRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const parsed = visitRowSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

export function visitNotes(rows: unknown): VisitNote[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const parsed = visitNoteSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Whether clicking this row should navigate to the full sheet. */
export const canOpenVisit = (row: Pick<VisitRow, "can_open">): boolean => row.can_open === true;

/** Who did the visit, preferring the staff row and falling back to the text. */
export function visitStaffName(row: VisitRow): string {
  const joined = [row.staff_first_name, row.staff_last_name].filter(Boolean).join(" ").trim();
  return joined || String(row.doctor_name ?? "").trim() || String(row.therapist_name ?? "").trim();
}

/**
 * Whether this card may show that the visit was billed.
 *
 * Whether a visit was billed is billing information, and the clinic asked that
 * a role with billing switched off sees none of it. The status label is shown
 * plain instead. Nothing else can leak here: patient_visit_history returns no
 * money columns, because `appointments` has none.
 */
export const showsBilledState = (args: { canSeeBilling: boolean; billed: boolean }): boolean =>
  args.canSeeBilling && args.billed;
