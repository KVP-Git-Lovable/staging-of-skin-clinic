import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { feedbackQuestions, type FeedbackQuestion } from "@/lib/feedbackQuestions";

/**
 * The feedback form's questions.
 *
 * Read by any active staff member, because both feedback forms are built from
 * them. Changed by an admin only, enforced by the database.
 *
 * The error is returned rather than swallowed: a form that quietly renders no
 * questions looks like a form with nothing to ask, which is worse than one
 * saying it could not load.
 */
export function useFeedbackQuestions() {
  const query = useQuery({
    queryKey: ["feedback-questions"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback_questions")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
  const questions: FeedbackQuestion[] = feedbackQuestions(query.data);
  return { ...query, questions };
}
