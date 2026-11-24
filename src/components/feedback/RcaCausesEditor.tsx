import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRcaConfig } from "@/hooks/useRcaConfig";
import { asFeedbackQuestion, causeCodeFrom, type RcaCause, type RcaQuestion } from "@/lib/rcaQuestions";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { answerTypeInfo, FEEDBACK_ANSWER_TYPES, questionChoices } from "@/lib/feedbackQuestions";
import { AnswerControl } from "./AnswerControl";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Why a visit went wrong, and what to ask once that has been decided.
 *
 * The causes were nine values written into a database constraint; they are a
 * list the clinic edits now. Each one carries its own follow-up questions,
 * which appear on a case when that cause is chosen - "waiting time" and
 * "communication" are not answered by the same ones.
 *
 * ── The AI suggestions ──
 *
 * "Suggest questions" drafts a handful for the cause and shows them. Nothing
 * is stored until the clinic ticks the ones worth keeping, which is the same
 * accept-then-save gate the knowledge AI uses: no wording a model invented
 * should reach a clinic's screen just because a request succeeded.
 */

/**
 * Shown when the request never reached the function - it is not deployed, or
 * it is down. Everything else on this screen writes straight to the database,
 * so the clinic is not stuck: the questions can still be written by hand.
 */
export const SUGGESTIONS_UNAVAILABLE =
  "Suggestions aren't available yet — the AI helper hasn't been deployed. You can still add questions by hand.";

export function RcaCausesEditor({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { causes, questions, isLoading, error } = useRcaConfig();
  const [busy, setBusy] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["rca-config"] });

  const run = async (what: string, job: () => Promise<{ error: unknown; data?: unknown[] | null }>) => {
    setBusy(true);
    try {
      const { error: failed, data } = await job();
      if (failed) throw failed;
      if (data && Array.isArray(data) && data.length === 0) {
        throw new Error("Nothing was saved. This needs an Admin role.");
      }
      await refresh();
      toast.success(what);
    } catch (e) {
      toast.error((e as Error).message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const addCause = () => {
    const label = newLabel.trim();
    if (!label) return;
    const code = causeCodeFrom(label, causes.map((c) => c.code));
    run("Cause added", async () => {
      const { error: failed, data } = await supabase
        .from("rca_root_causes")
        .insert({ code, label, sort_order: causes.length })
        .select("id");
      setNewLabel("");
      return { error: failed, data };
    });
  };

  if (isLoading) return <p className="py-10 text-center text-muted-foreground">Loading causes…</p>;
  if (error) return <p className="py-10 text-center text-destructive">{(error as Error).message}</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        When a case is put down to one of these, the questions under it appear on the case for somebody
        to answer. A case can carry more than one cause.
      </p>

      <Accordion type="multiple" className="space-y-2">
        {causes.map((cause, i) => (
          <CauseRow
            key={cause.id}
            cause={cause}
            questions={questions.filter((q) => q.cause_id === cause.id)}
            canEdit={canEdit && !busy}
            first={i === 0}
            last={i === causes.length - 1}
            allCauses={causes}
            run={run}
          />
        ))}
      </Accordion>

      {canEdit && (
        <div className="flex gap-2">
          <Input
            value={newLabel}
            maxLength={120}
            placeholder="Another cause — e.g. Parking"
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCause()}
          />
          <Button variant="outline" className="gap-2 shrink-0" onClick={addCause} disabled={busy || !newLabel.trim()}>
            <Plus className="h-4 w-4" />Add cause
          </Button>
        </div>
      )}
    </div>
  );
}

function CauseRow({
  cause, questions, canEdit, first, last, allCauses, run,
}: {
  cause: RcaCause;
  questions: RcaQuestion[];
  canEdit: boolean;
  first: boolean;
  last: boolean;
  allCauses: RcaCause[];
  run: (what: string, job: () => Promise<{ error: unknown; data?: unknown[] | null }>) => Promise<void>;
}) {
  const [label, setLabel] = useState(cause.label);
  const [suggesting, setSuggesting] = useState(false);
  const [suggested, setSuggested] = useState<{ question_text: string; question_type: string; choices: string[] }[] | null>(null);

  const patchCause = (changes: Record<string, unknown>) =>
    run("Cause saved", async () => {
      const { error, data } = await supabase
        .from("rca_root_causes").update({ ...changes, updated_at: new Date().toISOString() })
        .eq("id", cause.id).select("id");
      return { error, data };
    });

  const moveCause = (by: -1 | 1) => {
    const index = allCauses.findIndex((c) => c.id === cause.id);
    const other = allCauses[index + by];
    if (!other) return;
    run("Order saved", async () => {
      const a = await supabase.from("rca_root_causes").update({ sort_order: other.sort_order }).eq("id", cause.id).select("id");
      if (a.error) return a;
      return await supabase.from("rca_root_causes").update({ sort_order: cause.sort_order }).eq("id", other.id).select("id");
    });
  };

  const addQuestion = (question_text: string, question_type = "text", choices: string[] = [], ai_generated = false) =>
    run("Question added", async () => {
      const { error, data } = await supabase.from("rca_questions").insert({
        cause_id: cause.id,
        question_text,
        question_type,
        options: choices.length ? { choices } : {},
        sort_order: questions.length,
        ai_generated,
      }).select("id");
      return { error, data };
    });

  const suggest = async () => {
    setSuggesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("rca-question-ai", {
        body: { causeLabel: cause.label, existing: questions.map((q) => q.question_text) },
      });
      if (error) throw error;
      const list = (data as { questions?: typeof suggested })?.questions ?? [];
      if (!list.length) throw new Error("No suggestions came back. Try again.");
      setSuggested(list);
    } catch (e) {
      // Routed through the shared helper so the function's own refusal - "Only
      // doctors and admins can configure root-cause questions" - reaches the
      // screen instead of supabase-js's wrapper sentence.
      toast.error(await edgeFunctionErrorMessage(e, SUGGESTIONS_UNAVAILABLE));
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <AccordionItem value={cause.id} className="rounded-lg border px-4">
      <div className="flex items-center gap-2">
        <AccordionTrigger className="flex-1 hover:no-underline">
          <span className="flex items-center gap-2 text-left">
            <span className={cause.is_active ? "" : "text-muted-foreground line-through"}>{cause.label}</span>
            <Badge variant="outline" className="text-[10px]">
              {questions.filter((q) => q.is_active).length} question{questions.filter((q) => q.is_active).length === 1 ? "" : "s"}
            </Badge>
          </span>
        </AccordionTrigger>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1">
            <Button size="icon" variant="ghost" aria-label="Move up" disabled={first} onClick={() => moveCause(-1)}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Move down" disabled={last} onClick={() => moveCause(1)}>
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <AccordionContent className="space-y-4 pb-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor={`cause-${cause.id}`} className="text-xs">What the clinic calls it</Label>
            <Input
              id={`cause-${cause.id}`}
              value={label}
              maxLength={120}
              disabled={!canEdit}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => {
                if (!label.trim()) { setLabel(cause.label); return; }
                if (label.trim() !== cause.label) patchCause({ label: label.trim() });
              }}
            />
            {/* The code is what a case stores, so renaming a cause never
                rewrites the cases already put down to it. */}
            <p className="text-[11px] text-muted-foreground">Recorded on cases as “{cause.code}”. Renaming is safe.</p>
          </div>
          <Label className="flex items-center gap-2 text-sm font-normal pb-2">
            <Switch checked={cause.is_active} disabled={!canEdit} onCheckedChange={(is_active) => patchCause({ is_active })} />
            {/* The word is the state, not the control: "Offered" read the same
                whichever way the switch sat, so the colour was the only tell.
                The width is held so the row does not jump between the six
                letters and the eight each time it is pressed. */}
            <span className="min-w-[4.5rem]">{cause.is_active ? "Active" : "Inactive"}</span>
          </Label>
        </div>

        <div className="space-y-3 border-t pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Ask about this cause</p>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={suggest} disabled={suggesting}>
                {suggesting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Suggest questions
              </Button>
            )}
          </div>

          {suggested && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-2" data-testid="rca-suggestions">
              <p className="text-xs text-muted-foreground">
                Nothing is saved yet. Keep the ones that are worth asking.
              </p>
              {suggested.map((s, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                  <span className="text-sm min-w-0">
                    {s.question_text}
                    <Badge variant="outline" className="ml-2 text-[10px]">{answerTypeInfo(s.question_type)?.label ?? "Text box"}</Badge>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => {
                    addQuestion(s.question_text, s.question_type, s.choices, true);
                    setSuggested((list) => (list ?? []).filter((_, j) => j !== i));
                  }}>Keep</Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setSuggested(null)}>Discard the rest</Button>
            </div>
          )}

          {questions.map((q) => (
            <RcaQuestionRow key={q.id} question={q} canEdit={canEdit} run={run} />
          ))}

          {canEdit && (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => addQuestion("New question")}>
              <Plus className="h-4 w-4" />Add a question
            </Button>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function RcaQuestionRow({
  question, canEdit, run,
}: {
  question: RcaQuestion;
  canEdit: boolean;
  run: (what: string, job: () => Promise<{ error: unknown; data?: unknown[] | null }>) => Promise<void>;
}) {
  const [text, setText] = useState(question.question_text);
  const [choices, setChoices] = useState(questionChoices(asFeedbackQuestion(question)).join(", "));
  const info = answerTypeInfo(question.question_type);

  const patch = (changes: Record<string, unknown>) =>
    run("Question saved", async () => {
      const { error, data } = await supabase
        .from("rca_questions").update({ ...changes, updated_at: new Date().toISOString() })
        .eq("id", question.id).select("id");
      return { error, data };
    });

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex gap-2">
        <Input
          value={text}
          maxLength={300}
          disabled={!canEdit}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (!text.trim()) { setText(question.question_text); return; }
            if (text.trim() !== question.question_text) patch({ question_text: text.trim() });
          }}
        />
        <Button
          size="icon" variant="ghost" aria-label="Remove question" disabled={!canEdit}
          onClick={() => run("Question removed", async () => {
            const { error, data } = await supabase.from("rca_questions").delete().eq("id", question.id).select("id");
            return { error, data };
          })}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          value={question.question_type}
          disabled={!canEdit}
          onValueChange={(question_type) => patch({ question_type })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {FEEDBACK_ANSWER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {info?.needsChoices && (
          <Input
            value={choices}
            disabled={!canEdit}
            placeholder="Choices, separated by commas"
            onChange={(e) => setChoices(e.target.value)}
            onBlur={() => patch({ options: { choices: choices.split(",").map((c) => c.trim()).filter(Boolean) } })}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-5">
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Switch checked={question.is_active} disabled={!canEdit} onCheckedChange={(is_active) => patch({ is_active })} />
          Asked
        </Label>
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Switch checked={question.is_required} disabled={!canEdit} onCheckedChange={(is_required) => patch({ is_required })} />
          Must be answered
        </Label>
        {question.ai_generated && <Badge variant="outline" className="text-[10px]">AI-suggested</Badge>}
      </div>

      <div className="rounded-md bg-muted/30 p-2">
        <AnswerControl question={asFeedbackQuestion(question)} value={null} onChange={() => {}} disabled />
      </div>
    </div>
  );
}
