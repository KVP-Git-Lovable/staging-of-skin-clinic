import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Root-cause cases.
 *
 * EVERY EMBED HERE NAMES ITS CONSTRAINT, and must keep doing so.
 * feedback_rca reaches `staff` three times - assigned_to, resolved_by,
 * created_by - so a bare `staff(...)` is ambiguous and PostgREST refuses the
 * request outright rather than choosing. That is the exact failure the
 * therapist_id column caused in the live clinic; src/lib/ambiguousEmbeds.test.ts
 * carries the pair and fails the build on an implicit embed.
 */

const CASE_SELECT =
  "*, feedback:patient_feedback!feedback_rca_feedback_id_fkey(id, patient_id, patient_name, nps_score, service_rating, comments, created_at, updated_at, last_edited_by)," +
  "assignee:staff!feedback_rca_assigned_to_fkey(id, first_name, last_name)";

export interface RcaCase {
  id: string;
  feedback_id: string;
  patient_id: string;
  status: string;
  root_cause: string | null;
  /** Every cause on the case. root_cause is the first of these, kept in
   *  step by a trigger so the published build still reads one value. */
  root_causes: string[] | null;
  /** Answers to the follow-up questions of the causes chosen. */
  answers: unknown;
  resolution_note: string | null;
  opened_reason: string;
  nps_score_at_open: number;
  service_rating_at_open: number;
  assigned_to: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  feedback?: {
    id: string;
    patient_id: string;
    patient_name: string | null;
    nps_score: number;
    service_rating: number;
    comments: string | null;
    created_at: string;
    updated_at: string | null;
    last_edited_by: string | null;
  } | null;
  assignee?: { id: string; first_name: string | null; last_name: string | null } | null;
}

export function useRcaCases(status: string) {
  return useQuery({
    queryKey: ["feedback-rca", "list", status],
    queryFn: async () => {
      let q = supabase
        .from("feedback_rca")
        .select(CASE_SELECT)
        // Open work first, then most recent. A worklist sorted by date alone
        // buries the thing you came here to do under what you already closed.
        .order("status", { ascending: true })
        .order("created_at", { ascending: false });
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as RcaCase[];
    },
  });
}

export function useRcaCase(id: string | undefined) {
  return useQuery({
    queryKey: ["feedback-rca", "case", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback_rca")
        .select(CASE_SELECT)
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as RcaCase;
    },
  });
}

export interface RcaComment {
  id: string;
  rca_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export function useRcaComments(rcaId: string | undefined) {
  return useQuery({
    queryKey: ["feedback-rca", "comments", rcaId],
    enabled: !!rcaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback_rca_comments")
        .select("id, rca_id, author_name, body, created_at")
        .eq("rca_id", rcaId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as RcaComment[];
    },
  });
}

/** How many cases still need somebody. Drives the sidebar badge. */
export function useOpenRcaCount() {
  return useQuery({
    queryKey: ["feedback-rca", "open-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("feedback_rca")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"]);
      // A receptionist's read is refused by RLS. That is not an error worth
      // showing anyone - the badge just does not appear.
      if (error) return 0;
      return count ?? 0;
    },
  });
}
