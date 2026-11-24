import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rcaCauses, rcaQuestions, type RcaCause, type RcaQuestion } from "@/lib/rcaQuestions";

/**
 * The root causes and their follow-up questions.
 *
 * Read by anyone who may work a case, because the detail screen draws both the
 * picker and the questions from this. Changed by an admin, enforced by the
 * database.
 *
 * One hook for both tables: they are always wanted together - a question is
 * meaningless without knowing which cause it belongs to - and two hooks would
 * mean two loading states for one screen.
 */
export function useRcaConfig() {
  const query = useQuery({
    queryKey: ["rca-config"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [causes, questions] = await Promise.all([
        supabase.from("rca_root_causes").select("*").order("sort_order", { ascending: true }),
        supabase.from("rca_questions").select("*").order("sort_order", { ascending: true }),
      ]);
      if (causes.error) throw causes.error;
      if (questions.error) throw questions.error;
      return { causes: causes.data, questions: questions.data };
    },
  });
  const causes: RcaCause[] = rcaCauses(query.data?.causes);
  const questions: RcaQuestion[] = rcaQuestions(query.data?.questions);
  return { ...query, causes, questions };
}
