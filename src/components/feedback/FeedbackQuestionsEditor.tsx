import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useFeedbackQuestions } from "@/hooks/useFeedbackQuestions";
import {
  answerTypeInfo, FEEDBACK_ANSWER_TYPES, questionChoices,
  type FeedbackQuestion,
} from "@/lib/feedbackQuestions";
import { AnswerControl } from "./AnswerControl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * What the clinic asks a patient, and how.
 *
 * Each question is saved on its own rather than the whole list at once. The
 * survey builder next door deletes every question and reinserts them on save,
 * which regenerates their ids - and answers are keyed by question id, so its
 * review screen needs a positional fallback to read its own history. Feedback
 * answers have to survive being read years later, so ids here are stable and
 * an edit is an UPDATE.
 *
 * The three built-in questions can be reworded, restyled, reordered and
 * switched off, but not deleted: their answers are columns that 1,200 records,
 * every report and the root-cause cases all read.
 */

/**
 * A new question starts with wording, not blank.
 *
 * question_text is CHECKed to be between 1 and 300 characters, so an empty
 * string was refused outright and "Add a question" failed with a constraint
 * error. The placeholder is also the better behaviour: the row appears, the
 * clinic types over it, and a question that is never renamed still reads as
 * something to finish rather than as an empty box on a patient's screen.
 */
export const NEW_QUESTION_TEXT = "New question";

const blankQuestion = (sort_order: number) => ({
  question_text: NEW_QUESTION_TEXT,
  help_text: "",
  question_type: "stars",
  options: { max: 5 },
  sort_order,
  // Switched OFF until the clinic says otherwise. Both feedback forms read
  // this table live, so a question that defaulted to on would be in front of
  // the next patient under the name "New question", half written.
  is_active: false,
  is_required: false,
  score_at_or_below: null as number | null,
});

export function FeedbackQuestionsEditor({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { questions, isLoading, error } = useFeedbackQuestions();
  const [busy, setBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["feedback-questions"] });

  const run = async (what: string, job: () => Promise<{ error: unknown; data?: unknown[] | null }>) => {
    setBusy(true);
    try {
      const { error: failed, data } = await job();
      if (failed) throw failed;
      // A row-level refusal is not an error, it matches nothing - so a
      // non-admin would otherwise be told it worked.
      if (data && Array.isArray(data) && data.length === 0) {
        throw new Error("Nothing was saved. Changing questions needs an Admin role.");
      }
      await refresh();
      toast.success(what);
    } catch (e) {
      toast.error((e as Error).message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const patch = (q: FeedbackQuestion, changes: Record<string, unknown>) =>
    run("Question saved", async () => {
      const { error: failed, data } = await supabase
        .from("feedback_questions")
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq("id", q.id)
        .select("id");
      return { error: failed, data };
    });

  const add = () =>
    run("Question added", async () => {
      const { error: failed, data } = await supabase
        .from("feedback_questions")
        .insert(blankQuestion(questions.length))
        .select("id");
      return { error: failed, data };
    });

  const remove = (q: FeedbackQuestion) =>
    run("Question removed", async () => {
      const { error: failed, data } = await supabase
        .from("feedback_questions").delete().eq("id", q.id).select("id");
      return { error: failed, data };
    });

  /** Swap two questions' order. Explicit buttons, not drag: this list is short
   *  and a keyboard user can reorder it. */
  const move = (index: number, by: -1 | 1) => {
    const a = questions[index];
    const b = questions[index + by];
    if (!a || !b) return;
    run("Order saved", async () => {
      const first = await supabase.from("feedback_questions").update({ sort_order: b.sort_order }).eq("id", a.id).select("id");
      if (first.error) return first;
      return await supabase.from("feedback_questions").update({ sort_order: a.sort_order }).eq("id", b.id).select("id");
    });
  };

  if (isLoading) return <p className="py-10 text-center text-muted-foreground">Loading questions…</p>;
  if (error) return <p className="py-10 text-center text-destructive">{(error as Error).message}</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        These are the questions a patient is asked, on the clinic's Feedback tab and in the patient portal.
        Changes show on both.
      </p>

      {questions.map((q, i) => (
        <QuestionCard
          key={q.id}
          question={q}
          canEdit={canEdit && !busy}
          first={i === 0}
          last={i === questions.length - 1}
          onPatch={(changes) => patch(q, changes)}
          onRemove={() => remove(q)}
          onMove={(by) => move(i, by)}
        />
      ))}

      {canEdit && (
        <Button variant="outline" className="w-full gap-2" onClick={add} disabled={busy}>
          <Plus className="h-4 w-4" />Add a question
        </Button>
      )}
    </div>
  );
}

function QuestionCard({
  question, canEdit, first, last, onPatch, onRemove, onMove,
}: {
  question: FeedbackQuestion;
  canEdit: boolean;
  first: boolean;
  last: boolean;
  onPatch: (changes: Record<string, unknown>) => void;
  onRemove: () => void;
  onMove: (by: -1 | 1) => void;
}) {
  const [text, setText] = useState(question.question_text);
  const [choices, setChoices] = useState(questionChoices(question).join(", "));
  const info = answerTypeInfo(question.question_type);
  const builtin = !!question.builtin;

  return (
    <Card className={question.is_active ? undefined : "opacity-60"}>
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor={`q-${question.id}`} className="text-xs">Question</Label>
            <Input
              id={`q-${question.id}`}
              value={text}
              disabled={!canEdit}
              maxLength={300}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => {
                // Blank is refused by the database, so put the stored wording
                // back rather than leaving an empty box that looks saved.
                if (!text.trim()) { setText(question.question_text); return; }
                if (text.trim() !== question.question_text) onPatch({ question_text: text.trim() });
              }}
            />
          </div>
          <div className="flex items-center gap-1 pt-6">
            <Button size="icon" variant="ghost" disabled={!canEdit || first} aria-label="Move up" onClick={() => onMove(-1)}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" disabled={!canEdit || last} aria-label="Move down" onClick={() => onMove(1)}>
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              size="icon" variant="ghost" disabled={!canEdit || builtin}
              aria-label={builtin ? "Built-in questions cannot be removed" : "Remove question"}
              title={builtin ? "Built-in: switch it off instead of removing it" : "Remove"}
              onClick={onRemove}
            >
              {builtin ? <Lock className="h-4 w-4 text-muted-foreground" /> : <Trash2 className="h-4 w-4 text-destructive" />}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Answered with</Label>
            <Select
              value={question.question_type}
              disabled={!canEdit}
              onValueChange={(question_type) => {
                const next = answerTypeInfo(question_type);
                onPatch({
                  question_type,
                  // A type that cannot carry a threshold loses it rather than
                  // keeping a number nothing will ever read.
                  ...(next?.scorable ? {} : { score_at_or_below: null }),
                });
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FEEDBACK_ANSWER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {info && <p className="text-xs text-muted-foreground">{info.hint}</p>}
          </div>

          {info?.needsChoices && (
            <div className="space-y-1">
              <Label htmlFor={`c-${question.id}`} className="text-xs">Choices, separated by commas</Label>
              <Input
                id={`c-${question.id}`}
                value={choices}
                disabled={!canEdit}
                placeholder="Reception, Doctor, Treatment room"
                onChange={(e) => setChoices(e.target.value)}
                onBlur={() => onPatch({ options: { choices: choices.split(",").map((c) => c.trim()).filter(Boolean) } })}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-5">
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Switch checked={question.is_active} disabled={!canEdit} onCheckedChange={(is_active) => onPatch({ is_active })} />
            {question.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            Asked
          </Label>
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Switch checked={question.is_required} disabled={!canEdit} onCheckedChange={(is_required) => onPatch({ is_required })} />
            Must be answered
          </Label>
          {builtin && <Badge variant="outline">Built in</Badge>}
          {question.score_at_or_below !== null && (
            <Badge variant="outline">Opens a case at {question.score_at_or_below} or less</Badge>
          )}
        </div>

        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">How the patient sees it</p>
          <p className="text-sm font-medium">{text || "Your question"}</p>
          <AnswerControl question={question} value={null} onChange={() => {}} disabled />
        </div>
      </CardContent>
    </Card>
  );
}
