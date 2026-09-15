import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { portalRequest } from "@/lib/portalApi";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { ArrowLeft, ClipboardCheck, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface Props {
  patientId: string;
  templateId: string;
  assignmentId?: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

export default function PortalSurveyFill({ patientId, templateId, assignmentId, onClose, onSubmitted }: Props) {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [elaborating, setElaborating] = useState<string | null>(null);

  const { data: template } = useQuery({
    queryKey: ["portal-survey-template", templateId],
    queryFn: async () => {
      const { data, error } = await supabase.from("survey_templates").select("*").eq("id", templateId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["portal-survey-questions", templateId],
    queryFn: async () => {
      const { data, error } = await supabase.from("survey_questions").select("*").eq("template_id", templateId).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const updateAnswer = (qid: string, value: any) => setAnswers((p) => ({ ...p, [qid]: value }));

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
        body: JSON.stringify({
          question: questionText,
          currentAnswer: currentAnswer,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error ${response.status}:`, errorText);
        throw new Error(`Failed to elaborate (${response.status})`);
      }
      const { elaborated } = await response.json();
      updateAnswer(questionId, elaborated);
      toast.success("Answer elaborated with AI");
    } catch (e: any) {
      console.error("Elaborate error:", e);
      toast.error(e.message || "Failed to elaborate answer - Edge Function may not be deployed yet");
    } finally {
      setElaborating(null);
    }
  };

  const handleSubmit = async () => {
    const unanswered = questions.filter((q: any) => !answers[q.id] && answers[q.id] !== 0);
    if (unanswered.length > 0) {
      toast.error(`Please answer all questions (${unanswered.length} remaining)`);
      return;
    }
    setSubmitting(true);
    try {
      const [{ data: tplProducts }, { data: tplServices }] = await Promise.all([
        supabase.from("survey_template_products").select("*, pharma_products(name, category)").eq("template_id", templateId),
        supabase.from("survey_template_services").select("*, services(name, category)").eq("template_id", templateId),
      ]);

      let aiResult: any = { recommendation: "", products: [], services: [] };
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/survey-recommend`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            template, questions, answers,
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

      // survey_responses is not writable by the anonymous role, so the portal
      // submits through the trusted portal-data function.
      const inserted = await portalRequest<any>("submit_survey", {
        templateId,
        answers,
        aiRecommendation: aiResult.recommendation ? { text: aiResult.recommendation } : {},
        aiProducts: enrichedProducts,
        aiServices: enrichedServices,
        assignmentId,
      });

      // Fire-and-forget WhatsApp notification
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
    } catch (e: any) {
      toast.error(e.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onClose} className="gap-2" disabled={submitting}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <Card className="p-4 space-y-1">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{template?.name || "Survey"}</h2>
        </div>
        {template?.description && <p className="text-sm text-muted-foreground">{template.description}</p>}
      </Card>

      <div className="space-y-3">
        {questions.map((q: any, i: number) => {
          const getOptions = (): string[] => {
            if (Array.isArray(q.options)) return q.options;
            if (q.options && Array.isArray(q.options.choices)) return q.options.choices;
            return [];
          };
          const opts = getOptions();
          const scaleMin = q.options?.min ?? 1;
          const scaleMax = q.options?.max ?? 10;

          return (
            <Card key={q.id} className="p-3 space-y-2">
              <Label className="text-sm font-medium">{i + 1}. {q.question_text}</Label>

              {q.question_type === "text" && (
                <div className="space-y-2">
                  <Textarea value={answers[q.id] || ""} onChange={(e) => updateAnswer(q.id, e.target.value)} placeholder="Type answer..." rows={3} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs"
                    onClick={() => elaborateAnswer(q.id, q.question_text, answers[q.id] || "")}
                    disabled={elaborating === q.id || !answers[q.id]}
                  >
                    {elaborating === q.id ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Elaborating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        AI Elaborate
                      </>
                    )}
                  </Button>
                </div>
              )}

              {q.question_type === "single_choice" && (
                opts.length > 0 ? (
                  <RadioGroup value={answers[q.id] || ""} onValueChange={(v) => updateAnswer(q.id, v)} className="pl-1">
                    {opts.map((opt: string) => (
                      <div key={opt} className="flex items-center gap-2">
                        <RadioGroupItem value={opt} id={`${q.id}-${opt}`} />
                        <Label htmlFor={`${q.id}-${opt}`} className="font-normal cursor-pointer text-sm">{opt}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                ) : (
                  <div className="space-y-2">
                    <Textarea value={answers[q.id] || ""} onChange={(e) => updateAnswer(q.id, e.target.value)} placeholder="Type answer..." rows={2} />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-8 text-xs"
                      onClick={() => elaborateAnswer(q.id, q.question_text, answers[q.id] || "")}
                      disabled={elaborating === q.id || !answers[q.id]}
                    >
                      {elaborating === q.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Elaborating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          AI Elaborate
                        </>
                      )}
                    </Button>
                  </div>
                )
              )}

              {q.question_type === "multi_choice" && (
                opts.length > 0 ? (
                  <div className="space-y-1.5 pl-1">
                    {opts.map((opt: string) => (
                      <div key={opt} className="flex items-center gap-2">
                        <Checkbox
                          checked={(answers[q.id] || []).includes(opt)}
                          onCheckedChange={(checked) => {
                            const current = answers[q.id] || [];
                            updateAnswer(q.id, checked ? [...current, opt] : current.filter((o: string) => o !== opt));
                          }}
                        />
                        <Label className="font-normal cursor-pointer text-sm">{opt}</Label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Textarea value={answers[q.id] || ""} onChange={(e) => updateAnswer(q.id, e.target.value)} placeholder="Type answers (comma separated)..." rows={2} />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-8 text-xs"
                      onClick={() => elaborateAnswer(q.id, q.question_text, answers[q.id] || "")}
                      disabled={elaborating === q.id || !answers[q.id]}
                    >
                      {elaborating === q.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Elaborating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          AI Elaborate
                        </>
                      )}
                    </Button>
                  </div>
                )
              )}

              {q.question_type === "scale" && (
                <div className="space-y-2 px-1">
                  <Slider
                    value={[answers[q.id] ?? Math.round((scaleMin + scaleMax) / 2)]}
                    onValueChange={([v]) => updateAnswer(q.id, v)}
                    min={scaleMin} max={scaleMax} step={1}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{scaleMin} - Low</span>
                    <Badge variant="outline">{answers[q.id] ?? Math.round((scaleMin + scaleMax) / 2)}</Badge>
                    <span>{scaleMax} - High</span>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="sticky bottom-0 bg-background/90 backdrop-blur py-3 border-t flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Submit Survey
        </Button>
      </div>
    </div>
  );
}