/**
 * The vocabulary of a root-cause case.
 *
 * A low feedback score opens a case automatically (the trigger in
 * supabase/migrations/20261106090000_a_low_score_that_someone_owns.sql); this
 * is what the clinic then says about it.
 *
 * Both lists are mirrored by CHECK constraints on public.feedback_rca.
 * feedbackRca.test.ts reads that migration and fails if either drifts, because
 * a value this file offers that the database rejects is a save button that
 * does nothing.
 */

export const RCA_STATUSES = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "no_action", label: "No action needed" },
] as const;

export type RcaStatus = (typeof RCA_STATUSES)[number]["value"];

/** A case is finished when it reaches one of these. */
export const RCA_CLOSED_STATUSES: readonly RcaStatus[] = ["resolved", "no_action"];

/**
 * Why the patient was unhappy.
 *
 * A picklist rather than free text so the causes can be counted - after a
 * quarter the clinic can see that waiting time caused nine of fourteen
 * complaints, which no amount of re-reading notes would give them. The
 * discussion thread carries everything a category cannot.
 */
export const RCA_ROOT_CAUSES = [
  { value: "waiting_time", label: "Waiting time" },
  { value: "cost", label: "Cost or billing" },
  { value: "treatment_result", label: "Treatment result" },
  { value: "staff_behaviour", label: "Staff behaviour" },
  { value: "communication", label: "Communication or explanation" },
  { value: "scheduling", label: "Appointment scheduling" },
  { value: "facility", label: "Facility or comfort" },
  { value: "product_availability", label: "Product availability" },
  { value: "other", label: "Other" },
] as const;

export type RcaRootCause = (typeof RCA_ROOT_CAUSES)[number]["value"];

/** Why the case opened, in words. */
export const RCA_OPENED_REASONS: Record<string, string> = {
  nps: "Low recommendation score",
  service_rating: "Low service rating",
  both: "Low on both scores",
};

const labelFrom = (list: readonly { value: string; label: string }[], value: string | null | undefined) =>
  list.find((o) => o.value === value)?.label ?? "";

export const rcaStatusLabel = (value: string | null | undefined) => labelFrom(RCA_STATUSES, value);
export const rcaRootCauseLabel = (value: string | null | undefined) => labelFrom(RCA_ROOT_CAUSES, value);

/** Semantic tokens only, so these read correctly in dark mode. */
export const rcaStatusClass: Record<string, string> = {
  open: "bg-destructive/10 text-destructive",
  in_progress: "bg-warning/10 text-warning",
  resolved: "bg-success/10 text-success",
  no_action: "bg-muted text-muted-foreground",
};

/**
 * The zero UUID the appointment Feedback tab writes when a visit has no
 * patient attached (AppointmentDetailSheet.tsx). patient_feedback.patient_id
 * has no foreign key, so nothing stops it being stored, and it is not an id to
 * look a patient up by. No live row carries it today; the writer that produces
 * it is still there, so every per-patient query filters it out.
 */
export const NO_PATIENT_ID = "00000000-0000-0000-0000-000000000000";
