import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { askableQuestions, configuredQuestions, pageBlockers, pageLabel, questionImage, questionPages, questionsPerPage, type ConfiguredQuestion } from "@/lib/surveyQuestionConfig";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { portalRequest } from "@/lib/portalApi";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { ArrowLeft, Check, ClipboardCheck, Loader2, Pencil, Sparkles } from "lucide-react";
import { toast } from "sonner";
import SurveyQuestionImage from "@/components/portal/SurveyQuestionImage";
import { illustrationFor } from "@/lib/surveyIllustration";
import {
  answerControl,
  answerSummary,
  answeredCount,
  autoAdvances,
  buildAnswerPayload,
  isAnswered,
  questionOptions,
  scaleBounds,
  type AnswerMap,
  type AnswerValue,
  type SurveyQuestionLike,
} from "@/lib/surveyFlow";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/**
 * Long enough for the patient to see their choice fill in, short enough that
 * it reads as confirmation rather than lag.
 */
const AUTO_ADVANCE_MS = 450;

interface Props {
  patientId: string;
  templateId: string;
  assignmentId?: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

/**
 * A survey, one question at a time.
 *
 * This used to render every question as a stack of cards on one scrolling
 * page. The clinic asked for one question per screen, moving on by itself
 * once answered, with a picture for each question.
 *
 * Only a single choice from a list can move on by itself - a slider fires
 * continuously while it is dragged, a multi-select cannot know when somebody
 * has finished ticking, and free text certainly cannot - so those three get a
 * Next button instead. That covers 27 of the clinic's 58 questions with a
 * single tap.
 *
 * The decisions all live in src/lib/surveyFlow.ts so they can be tested
 * without rendering this; the drawings are chosen by src/lib/surveyIllustration.ts.
 */
export default function PortalSurveyFill({ patientId, templateId, assignmentId, onClose, onSubmitted }: Props) {
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [elaborating, setElaborating] = useState<string | null>(null);
  const reduced = useReducedMotion();

  const { data: template } = useQuery({
    queryKey: ["portal-survey-template", templateId],
    queryFn: async () => {
      const { data, error } = await supabase.from("survey_templates").select("*").eq("id", templateId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: configured = [], isLoading } = useQuery({
    queryKey: ["portal-survey-questions", templateId],
    queryFn: async () => {
      const { data, error } = await supabase.from("survey_questions").select("*").eq("template_id", templateId).order("sort_order");
      if (error) throw error;
      return configuredQuestions(data ?? []);
    },
  });

  // How many to put on one page. One is what the portal has always done, and
  // is what a template nobody has configured still says.
  const { data: perPage = 1 } = useQuery({
    queryKey: ["portal-survey-layout", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("survey_templates").select("questions_per_page").eq("id", templateId).maybeSingle();
      if (error) throw error;
      return questionsPerPage(data?.questions_per_page);
    },
  });

  // A retired question is not asked. Answers already given to it stay.
  const questions = useMemo(() => askableQuestions(configured) as SurveyQuestionLike[], [configured]);
  const pages = useMemo(() => questionPages(configured, perPage), [configured, perPage]);

  // ─── Auto-advance ───────────────────────────────
  // One ref slot, so two timers can never be live at once and a double
  // advance is structurally impossible.
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAdvance = useCallback(() => {
    if (advanceTimer.current !== null) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    setPendingId(null);
  }, []);

  // Closing the survey mid-pause must not leave a timer holding a setState.
  useEffect(() => clearAdvance, [clearAdvance]);
  // However the step changed - Next, Back, Change - a pending advance is void.
  useEffect(() => { clearAdvance(); }, [index, clearAdvance]);

  // A second survey must not open half way through the first one's questions.
  useEffect(() => { setIndex(0); setAnswers({}); }, [templateId]);

  const total = questions.length;
  // `index` walks the PAGES now. At one question per page - which is what
  // every template says until somebody changes it - a page is a question and
  // this is exactly the old behaviour.
  const pageCount = pages.length;
  const isReview = pageCount > 0 && index >= pageCount;
  const currentPage: ConfiguredQuestion[] = pages[index] ?? [];
  const onePerPage = currentPage.length === 1;

  const go = useCallback((next: number) => {
    clearAdvance();
    setDirection(next >= index ? 1 : -1);
    setIndex(Math.max(0, Math.min(next, pageCount)));
  }, [clearAdvance, index, pageCount]);

  const armAdvance = useCallback((questionId: string) => {
    clearAdvance();
    setPendingId(questionId);
    advanceTimer.current = setTimeout(() => {
      advanceTimer.current = null;
      setPendingId(null);
      setDirection(1);
      setIndex((i) => {
        // The patient may have pressed Back or Next during the pause. Moving
        // on is only right if they are still standing on the question they
        // answered - and only ever when that page holds just that question.
        const page = pages[i];
        if (!page || page.length !== 1 || page[0].id !== questionId) return i;
        return Math.min(i + 1, pages.length);
      });
    }, AUTO_ADVANCE_MS);
  }, [clearAdvance, pages]);

  const updateAnswer = (qid: string, value: AnswerValue) => {
    setAnswers((p) => ({ ...p, [qid]: value }));
  };

  // ─── AI Elaborate ───────────────────────────────
  const elaborateAnswer = async (questionId: string, questionText: string, currentAnswer: string) => {
    if (!currentAnswer.trim()) {
      toast.error("Please write an answer first before elaborating");
      return;
    }
    setElaborating(questionId);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/elaborate-survey-answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: questionText, currentAnswer }),
      });
      if (!response.ok) throw new Error(`Failed to elaborate (${response.status})`);
      const { elaborated } = await response.json();
      updateAnswer(questionId, elaborated);
      toast.success("Answer elaborated with AI");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to elaborate answer");
    } finally {
      setElaborating(null);
    }
  };

  // ─── Submit ─────────────────────────────────────
  const handleSubmit = async () => {
    // Only the ones the clinic marked as needed. Every question used to be
    // required because there was no way to say otherwise.
    const unanswered = pageBlockers(configured.filter((q) => q.is_active), answers);
    if (unanswered.length > 0) {
      toast.error(`Please answer all required questions (${unanswered.length} remaining)`);
      go(questions.findIndex((q) => !isAnswered(q, answers[q.id])));
      return;
    }

    setSubmitting(true);
    try {
      const [{ data: tplProducts }, { data: tplServices }] = await Promise.all([
        supabase.from("survey_template_products").select("*, pharma_products(name, category)").eq("template_id", templateId),
        supabase.from("survey_template_services").select("*, services(name, category)").eq("template_id", templateId),
      ]);

      // One key per question, nulls kept - see buildAnswerPayload. The stored
      // row and the text the model sees must be the same object.
      const payload = buildAnswerPayload(questions, answers);

      let aiResult: { recommendation?: string; products?: unknown[]; services?: unknown[] } = {};
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/survey-recommend`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            template,
            questions,
            answers: payload,
            available_products: tplProducts || [],
            available_services: tplServices || [],
          }),
        });
        if (resp.ok) aiResult = await resp.json();
      } catch (e) {
        console.warn("AI recommend failed:", e);
      }

      const { enrichAiProducts, enrichAiServices } = await import("@/lib/surveyApproval");
      const enrichedProducts = enrichAiProducts(aiResult.products || [], tplProducts || []);
      const enrichedServices = enrichAiServices(aiResult.services || [], tplServices || []);

      const inserted = await portalRequest<{ id?: string }>("submit_survey", {
        templateId,
        answers: payload,
        aiRecommendation: aiResult.recommendation ? { text: aiResult.recommendation } : {},
        aiProducts: enrichedProducts,
        aiServices: enrichedServices,
        assignmentId,
      });

      fetch(`${SUPABASE_URL}/functions/v1/send-survey-whatsapp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          patient_id: patientId,
          template_name: template?.name || "Survey",
          response_id: inserted?.id,
        }),
      }).catch((e) => console.warn("WhatsApp notify failed:", e));

      toast.success("Survey submitted! Pending doctor review.");
      onSubmitted?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Chrome ─────────────────────────────────────
  const answered = answeredCount(questions, answers);
  const slide = reduced
    ? {}
    : {
        initial: { opacity: 0, x: direction * 16 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: direction * -16 },
      };

  const header = (
    <>
      <Button variant="ghost" size="sm" onClick={onClose} className="gap-2 -ml-2" disabled={submitting}>
        <ArrowLeft className="h-4 w-4" /> Back to surveys
      </Button>
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary shrink-0" />
          <h2 className="text-base font-semibold truncate">{template?.name || "Survey"}</h2>
        </div>
        {total > 0 && (
          <div className="space-y-1.5">
            <Progress
              value={isReview ? 100 : (index / Math.max(pageCount, 1)) * 100}
              className="h-1.5 [&>div]:motion-reduce:transition-none"
            />
            <p className="text-xs text-muted-foreground">
              {isReview ? `Review — ${answered} of ${total} answered` : pageLabel(pages, index, total)}
            </p>
          </div>
        )}
      </Card>
    </>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {header}
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="space-y-4">
        {header}
        <Card className="p-6 text-center text-sm text-muted-foreground">
          This survey has no questions yet.
        </Card>
        <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}

      <AnimatePresence mode="wait" initial={false}>
        {isReview ? (
          <motion.div key="review" {...slide} transition={{ duration: 0.2 }} className="space-y-3">
            <Card className="p-4 space-y-3">
              <h3 className="text-sm font-semibold">Check your answers</h3>
              <div className="space-y-2.5">
                {questions.map((q, i) => {
                  const done = isAnswered(q, answers[q.id]);
                  return (
                    <div key={q.id} className="flex items-start justify-between gap-3 border-b pb-2.5 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm">{i + 1}. {q.question_text}</p>
                        <p className={`text-sm mt-0.5 ${done ? "text-muted-foreground" : "text-destructive"}`}>
                          {done ? answerSummary(answers[q.id]) : "Not answered yet"}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" className="gap-1 shrink-0 h-8" onClick={() => go(i)}>
                        <Pencil className="h-3.5 w-3.5" /> Change
                      </Button>
                    </div>
                  );
                })}
              </div>
            </Card>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 min-h-11" onClick={() => go(pageCount - 1)} disabled={submitting}>
                Back
              </Button>
              <Button className="flex-1 min-h-11 gap-2" onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit Survey
              </Button>
            </div>
          </motion.div>
        ) : (
          currentPage.length > 0 && (
            <motion.div key={currentPage[0].id} {...slide} transition={{ duration: 0.2 }} className="space-y-3">
              {currentPage.map((q) => (
                <Card key={q.id} className="p-4 space-y-4">
                  <div className="space-y-1">
                    <Label className="text-base font-medium leading-snug block">
                      {q.question_text}
                      {!q.is_required && (
                        <span className="text-xs font-normal text-muted-foreground"> · optional</span>
                      )}
                    </Label>
                    {q.help_text && <p className="text-xs text-muted-foreground">{q.help_text}</p>}
                  </div>

                  {/* The clinic's own picture when they chose one. Otherwise
                      the illustration picked from the wording, exactly as
                      before, so a question nobody configured is unchanged. */}
                  {questionImage(q) ? (
                    <img
                      src={questionImage(q)!}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className="h-32 sm:h-36 w-full rounded-xl object-cover"
                    />
                  ) : (
                    <SurveyQuestionImage name={illustrationFor(q.question_text, q.question_type)} />
                  )}

                  <QuestionControl
                    question={q as SurveyQuestionLike}
                    value={answers[q.id]}
                    pending={pendingId === q.id}
                    elaborating={elaborating === q.id}
                    onAnswer={(v) => updateAnswer(q.id, v)}
                    onPick={() => onePerPage && autoAdvances(q as SurveyQuestionLike) && armAdvance(q.id)}
                    onElaborate={() =>
                      elaborateAnswer(q.id, String(q.question_text ?? ""), String(answers[q.id] ?? ""))
                    }
                  />
                </Card>
              ))}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 min-h-11"
                  onClick={() => (index === 0 ? onClose() : go(index - 1))}
                  disabled={submitting}
                >
                  Back
                </Button>
                <Button
                  className="flex-1 min-h-11"
                  onClick={() => go(index + 1)}
                  disabled={pageBlockers(currentPage, answers).length > 0 || submitting}
                >
                  {index === pageCount - 1 ? "Review" : "Next"}
                </Button>
              </div>
            </motion.div>
          )
        )}
      </AnimatePresence>
    </div>
  );
}

/** The answer control for one question. */
function QuestionControl({
  question,
  value,
  pending,
  elaborating,
  onAnswer,
  onPick,
  onElaborate,
}: {
  question: SurveyQuestionLike;
  value: AnswerValue | undefined;
  pending: boolean;
  elaborating: boolean;
  onAnswer: (value: AnswerValue) => void;
  onPick: () => void;
  onElaborate: () => void;
}) {
  const control = answerControl(question);
  const opts = questionOptions(question);

  if (control === "single") {
    return (
      <RadioGroup
        // onValueChange also fires on arrow keys, which is why it only
        // records the answer. Moving on is armed from the row's click, so a
        // keyboard user can walk the options without being flung forward.
        value={typeof value === "string" ? value : ""}
        onValueChange={(v) => onAnswer(v)}
        className="space-y-2"
      >
        {opts.map((opt) => {
          const selected = value === opt;
          return (
            <label
              key={opt}
              onClick={onPick}
              className={`flex items-center gap-3 rounded-xl border p-3 min-h-11 cursor-pointer transition-colors motion-reduce:transition-none ${
                selected ? "border-primary bg-primary/10" : "hover:bg-muted/50"
              }`}
            >
              <RadioGroupItem value={opt} id={`${question.id}-${opt}`} />
              <span className="text-sm font-normal flex-1">{opt}</span>
              {selected && pending && <Check className="h-4 w-4 text-primary shrink-0" />}
            </label>
          );
        })}
      </RadioGroup>
    );
  }

  if (control === "multi") {
    const chosen = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-2">
        {opts.map((opt) => {
          const selected = chosen.includes(opt);
          return (
            <label
              key={opt}
              className={`flex items-center gap-3 rounded-xl border p-3 min-h-11 cursor-pointer transition-colors motion-reduce:transition-none ${
                selected ? "border-primary bg-primary/10" : "hover:bg-muted/50"
              }`}
            >
              <Checkbox
                checked={selected}
                onCheckedChange={(checked) =>
                  onAnswer(checked ? [...chosen, opt] : chosen.filter((o) => o !== opt))
                }
              />
              <span className="text-sm font-normal flex-1">{opt}</span>
            </label>
          );
        })}
        <p className="text-xs text-muted-foreground">Choose as many as apply, then press Next.</p>
      </div>
    );
  }

  if (control === "scale") {
    const { min, max } = scaleBounds(question);
    const touched = typeof value === "number";
    return (
      <div className="space-y-3 px-1">
        <Slider
          value={[touched ? value : min]}
          onValueChange={([v]) => onAnswer(v)}
          min={min}
          max={max}
          step={1}
          className={touched ? "" : "opacity-60"}
        />
        <div className="flex justify-between items-center text-xs text-muted-foreground">
          <span>{min} - Low</span>
          {touched ? (
            <Badge variant="outline">{value}</Badge>
          ) : (
            // The slider used to show the midpoint while recording nothing,
            // so an untouched question read as answered and then refused to
            // submit. It now says what it means.
            <span className="italic">Drag to choose</span>
          )}
          <span>{max} - High</span>
        </div>
      </div>
    );
  }

  // text, and any question type this app does not recognise - which renders
  // here rather than as a label with no input, so no step is a dead end.
  return (
    <div className="space-y-2">
      <Textarea
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onAnswer(e.target.value)}
        placeholder="Type your answer..."
        rows={4}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 h-8 text-xs"
        onClick={onElaborate}
        disabled={elaborating || !value}
      >
        {elaborating ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Elaborating...</>
        ) : (
          <><Sparkles className="h-3.5 w-3.5" /> AI Elaborate</>
        )}
      </Button>
    </div>
  );
}
