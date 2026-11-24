import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { thresholdsFrom, type FeedbackThresholds } from "@/lib/feedbackThresholds";

/**
 * The rule that decides which feedback gets a root-cause case.
 *
 * One row, read by any active staff member so the worklist can say what it is
 * working to. Only an admin can change it - that is enforced by the database,
 * not by hiding the screen.
 *
 * The error is RETURNED rather than swallowed, like useAttendanceSettings: a
 * settings screen that quietly invents an answer is worse than one that admits
 * it could not read the row. Callers that only want to show the rule can use
 * `thresholds`, which always has usable numbers.
 */
export function useFeedbackSettings() {
  const query = useQuery({
    queryKey: ["feedback-settings"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback_settings")
        .select("*")
        .eq("singleton", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const thresholds: FeedbackThresholds = thresholdsFrom(query.data);
  return { ...query, thresholds };
}
