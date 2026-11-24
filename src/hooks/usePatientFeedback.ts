import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { NO_PATIENT_ID } from "@/lib/feedbackRca";

/**
 * One patient's feedback, and the root-cause cases on it.
 *
 * Lives in its own file rather than beside the components that use it so that
 * PatientFeedback.tsx exports components only - a file mixing the two breaks
 * react-refresh, which eslint flags.
 */
export interface PatientFeedbackRow {
  id: string;
  appointment_id: string;
  nps_score: number;
  service_rating: number;
  comments: string | null;
  created_at: string;
  updated_at: string | null;
  last_edited_by: string | null;
  appointment?: { start_time: string | null; service: string | null } | null;
}

export interface PatientRcaRow {
  id: string;
  feedback_id: string;
  status: string;
  root_cause: string | null;
  opened_reason: string;
}

/**
 * One query for both the card and the tab.
 *
 * They share a query key deliberately, the same trick the attachments count
 * uses on this page: mounting both costs one request, not two.
 */
export function usePatientFeedback(patientId: string | undefined) {
  return useQuery({
    // Scoped "by-patient" on purpose. AppointmentDetailSheet caches its own
    // feedback under ["patient-feedback", appointmentId] - the same prefix
    // with a different KIND of uuid underneath it, which is the collision the
    // sticky-notes hook already warns about.
    queryKey: ["patient-feedback", "by-patient", patientId],
    // The appointment Feedback tab writes a zero uuid when a visit has no
    // patient attached. No live row carries it, but the writer still exists,
    // and it is not an id to look a patient up by.
    enabled: !!patientId && patientId !== NO_PATIENT_ID,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_feedback")
        // appointment_id is reachable through more than one route - the
        // appointments table and the visits_needing_review view - so the embed
        // names the COLUMN. Naming the table instead fails outright.
        .select("id, appointment_id, nps_score, service_rating, comments, created_at, updated_at, last_edited_by, appointment:appointment_id(start_time, service)")
        .eq("patient_id", patientId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data || []) as unknown as PatientFeedbackRow[];

      // The cases, for whoever is allowed to see them. A receptionist's read
      // is refused by RLS and simply comes back empty, which must leave the
      // feedback list working - so this never throws the page away.
      let cases: PatientRcaRow[] = [];
      if (rows.length) {
        const { data: rcaData } = await supabase
          .from("feedback_rca")
          .select("id, feedback_id, status, root_cause, opened_reason")
          .in("feedback_id", rows.map((r) => r.id));
        cases = (rcaData || []) as PatientRcaRow[];
      }
      return { rows, cases };
    },
  });
}
