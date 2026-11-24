import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useFeedbackQuestions } from "@/hooks/useFeedbackQuestions";
import { questionScale, scoringQuestions } from "@/lib/feedbackQuestions";
import { NumberField } from "@/components/shared/NumberField";
import { SettingRow } from "@/components/attendance/SettingRow";
import { Button } from "@/components/ui/button";

/**
 * A threshold per scoring question, beside the two the clinic started with.
 *
 * The clinic asked for every question they add to be able to open a case in
 * its own right - "how clean was the clinic", answered 1 out of 5, is a visit
 * somebody should look at even when both headline scores were fine.
 *
 * Edited here and nowhere else, even though the number lives on the question
 * row. The question builder sets what is asked; this screen sets how low is low
 * enough, for every question at once. Two screens owning one number is how they
 * end up disagreeing.
 *
 * The two built-ins are not listed: they have their own boxes above, because
 * their thresholds live on the settings row and are what the database has
 * always read.
 */
export function QuestionThresholds({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { questions } = useFeedbackQuestions();
  const extra = scoringQuestions(questions).filter((q) => !q.builtin);

  if (!extra.length) return null;

  const set = async (id: string, score_at_or_below: number | null) => {
    const { data, error } = await supabase
      .from("feedback_questions")
      .update({ score_at_or_below, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error("Nothing was saved. This needs an Admin role."); return; }
    await qc.invalidateQueries({ queryKey: ["feedback-questions"] });
    toast.success("Saved");
  };

  return (
    <div className="space-y-4 border-t pt-4" data-testid="question-thresholds">
      <div>
        <p className="text-sm font-medium">Your own scoring questions</p>
        <p className="text-xs text-muted-foreground">
          Leave one switched off and a low answer is simply recorded. Switch it on and it opens a case of its own.
        </p>
      </div>
      {extra.map((q) => {
        const { min, max } = questionScale(q);
        const on = q.score_at_or_below !== null;
        return (
          <SettingRow
            key={q.id}
            label={q.question_text}
            hint={on ? `Opens a case at ${q.score_at_or_below} or less, out of ${max}.` : `Out of ${max}. Not opening cases.`}
          >
            <div className="flex items-center gap-2">
              {on && (
                <NumberField
                  value={q.score_at_or_below ?? min}
                  min={min}
                  max={max}
                  emptyValue={min}
                  className="w-20"
                  aria-label={`Open a case for "${q.question_text}" at or below`}
                  onChange={(n) => canEdit && set(q.id, n)}
                />
              )}
              <Button
                size="sm"
                variant={on ? "ghost" : "outline"}
                disabled={!canEdit}
                onClick={() => set(q.id, on ? null : min)}
              >
                {on ? "Stop" : "Open cases"}
              </Button>
            </div>
          </SettingRow>
        );
      })}
    </div>
  );
}
