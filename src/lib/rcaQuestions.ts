import { z } from "zod";
import { feedbackQuestionSchema, type AnswerMap, type FeedbackQuestion } from "@/lib/feedbackQuestions";

/**
 * What the clinic asks itself once it has decided why a visit went wrong.
 *
 * A case used to carry one cause out of nine and nothing else. Now a case can
 * have several causes, and each cause brings its own follow-up questions -
 * "waiting time" and "communication" are not answered by the same ones.
 *
 * The questions reuse the feedback form's answer types and its controls
 * wholesale. One vocabulary, one set of controls: a type added for either
 * works in both, which is the whole reason the feedback work was shaped the
 * way it was.
 */

export const rcaCauseSchema = z.object({
  id: z.string(),
  code: z.string(),
  label: z.string().trim().min(1),
  sort_order: z.number().default(0),
  is_active: z.boolean().default(true),
});
export type RcaCause = z.infer<typeof rcaCauseSchema>;

/** Same shape as a feedback question, plus the cause it hangs off. */
export const rcaQuestionSchema = feedbackQuestionSchema
  .omit({ score_at_or_below: true, builtin: true })
  .extend({ cause_id: z.string(), ai_generated: z.boolean().default(false) });
export type RcaQuestion = z.infer<typeof rcaQuestionSchema>;

export function rcaCauses(rows: unknown): RcaCause[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .flatMap((row) => {
      const parsed = rcaCauseSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    })
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

export function rcaQuestions(rows: unknown): RcaQuestion[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .flatMap((row) => {
      const parsed = rcaQuestionSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    })
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

/**
 * An RCA question as the shared controls expect it.
 *
 * AnswerControl draws a FeedbackQuestion. The two shapes differ only in the
 * fields the feedback form needs and this one does not, so this fills those in
 * rather than giving the controls a second type to understand.
 */
export const asFeedbackQuestion = (question: RcaQuestion): FeedbackQuestion => ({
  ...question,
  score_at_or_below: null,
  builtin: null,
});

/** The codes a case carries, tolerant of a column written by either build. */
export function caseCauses(value: unknown): string[] {
  if (!Array.isArray(value)) return typeof value === "string" && value ? [value] : [];
  return value.filter((c): c is string => typeof c === "string" && !!c);
}

/**
 * The questions to put in front of somebody, for the causes they have chosen.
 *
 * In cause order, then question order, so the screen reads the way the picker
 * does. A question whose cause is no longer chosen simply is not asked - its
 * answer stays in the record, because a case worked last month should still
 * read the way it was worked.
 */
export function questionsForCauses(
  causes: RcaCause[],
  questions: RcaQuestion[],
  chosenCodes: string[],
): RcaQuestion[] {
  const byCode = new Map(causes.map((c) => [c.code, c]));
  const chosenIds = chosenCodes.flatMap((code) => {
    const cause = byCode.get(code);
    return cause ? [cause.id] : [];
  });
  return chosenIds.flatMap((causeId) =>
    questions.filter((q) => q.cause_id === causeId && q.is_active),
  );
}

/** Answers to questions that are no longer asked, so nothing is quietly lost. */
export function orphanedAnswers(asked: RcaQuestion[], answers: AnswerMap): string[] {
  const askedIds = new Set(asked.map((q) => q.id));
  return Object.keys(answers).filter((id) => !askedIds.has(id) && answers[id] !== null);
}

export const causeLabel = (causes: RcaCause[], code: string): string =>
  causes.find((c) => c.code === code)?.label ?? code;

/**
 * A code for a cause the clinic just named.
 *
 * The code is what a case stores, so it has to be stable and it has to match
 * the column's own pattern - lowercase, digits and underscores. The label can
 * be changed afterwards without touching a single case.
 */
export function causeCodeFrom(label: string, taken: string[] = []): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 36) || "cause";
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}_${n}`.slice(0, 40);
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`.slice(0, 40);
}
