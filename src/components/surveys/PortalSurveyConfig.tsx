import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SurveyQuestionsEditor, type EditableQuestion } from "@/components/surveys/SurveyQuestionsEditor";
import { questionsPerPage } from "@/lib/surveyQuestionConfig";
import { questionSyncPlan } from "@/lib/surveyQuestionSync";

/**
 * The surveys patients fill in, configured where the clinic looks for them.
 *
 * The switches above decide whether the portal shows surveys at all; this is
 * what those surveys ask. Same editor as the Survey Templates dialog, so the
 * two cannot drift into disagreeing about what a question is.
 *
 * Questions are saved in place, never deleted and re-inserted: answers are
 * keyed by question id, and the old save path was cutting them loose on every
 * save. See lib/surveyQuestionSync.ts.
 */
export function PortalSurveyConfig() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<string>("");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["portal-survey-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("survey_templates")
        .select("id, name, is_active, questions_per_page")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h2 className="font-semibold font-display">Surveys</h2>
        <p className="text-sm text-muted-foreground">
          What each survey asks, the picture above a question, and how many questions a patient
          answers on one page.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading surveys…
        </p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No surveys yet.</p>
      ) : (
        <Accordion type="single" collapsible value={open} onValueChange={setOpen}>
          {templates.map((t) => (
            <AccordionItem key={t.id} value={t.id} className="border rounded-lg px-3 mb-2">
              <AccordionTrigger className="hover:no-underline">
                <span className="flex items-center gap-2 text-left">
                  <span className={t.is_active ? "" : "text-muted-foreground line-through"}>{t.name}</span>
                  {!t.is_active && <Badge variant="outline" className="text-[10px]">Off</Badge>}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {open === t.id && (
                  <TemplateQuestions
                    templateId={t.id}
                    initialPerPage={questionsPerPage(t.questions_per_page)}
                    onSaved={() => qc.invalidateQueries({ queryKey: ["portal-survey-templates"] })}
                  />
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </Card>
  );
}

function TemplateQuestions({ templateId, initialPerPage, onSaved }: {
  templateId: string;
  initialPerPage: number;
  onSaved: () => void;
}) {
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [perPage, setPerPage] = useState(initialPerPage);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["portal-survey-questions", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("survey_questions")
        .select("*")
        .eq("template_id", templateId)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!data) return;
    setQuestions(data.map((q) => ({
      id: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      options: Array.isArray(q.options) ? (q.options as string[]) : [],
      ideal_answer: q.ideal_answer ?? {},
      sort_order: q.sort_order,
      image_url: q.image_url ?? null,
      help_text: q.help_text ?? "",
      is_required: q.is_required ?? true,
      max_choices: q.max_choices ?? null,
      max_length: q.max_length ?? null,
      is_active: q.is_active ?? true,
    })));
  }, [data]);

  const save = async () => {
    if (questions.some((q) => !q.question_text.trim())) {
      toast.error("Every question needs its wording.");
      return;
    }
    setSaving(true);
    try {
      const { error: tplError, data: tplRows } = await supabase
        .from("survey_templates")
        .update({ questions_per_page: questionsPerPage(perPage) })
        .eq("id", templateId)
        .select("id");
      if (tplError) throw tplError;
      // A refusal by the row-level rule matches no rows rather than erroring.
      if (!tplRows?.length) throw new Error("Nothing was saved. This needs permission to edit surveys.");

      const plan = questionSyncPlan((data ?? []).map((q) => q.id), questions);
      const fields = (q: EditableQuestion) => ({
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options,
        ideal_answer: (q.ideal_answer ?? {}) as never,
        image_url: q.image_url ?? null,
        help_text: q.help_text ?? "",
        is_required: q.is_required ?? true,
        max_choices: q.max_choices ?? null,
        max_length: q.max_length ?? null,
        is_active: q.is_active ?? true,
      });

      for (const q of plan.update) {
        const { error } = await supabase
          .from("survey_questions")
          .update({ ...fields(q), sort_order: q.sort_order })
          .eq("id", q.id);
        if (error) throw error;
      }
      if (plan.insert.length) {
        const { error } = await supabase.from("survey_questions").insert(
          plan.insert.map((q) => ({ ...fields(q as EditableQuestion), sort_order: q.sort_order, template_id: templateId })),
        );
        if (error) throw error;
      }
      if (plan.deleteIds.length) {
        const { error } = await supabase.from("survey_questions").delete().in("id", plan.deleteIds);
        if (error) throw error;
      }

      toast.success("Saved. Patients see it the next time they open the survey.");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || String(e));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2 py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading questions…
      </p>
    );
  }

  return (
    <div className="space-y-4 pb-2">
      <SurveyQuestionsEditor
        questions={questions}
        onChange={setQuestions}
        perPage={perPage}
        onPerPageChange={setPerPage}
        disabled={saving}
      />
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save this survey
        </Button>
      </div>
    </div>
  );
}
