import { z } from "zod";
import { questionOptions, type SurveyQuestionLike } from "@/lib/surveyFlow";

/**
 * What the clinic has said about a survey question.
 *
 * Until now a question was its text, its type and its choices. The picture
 * above it in the portal was not the clinic's at all: SurveyQuestionImage
 * keyword-matches the question's own wording against 37 pictures bundled into
 * the build, so rewording a question silently changed its picture.
 *
 * These are the settings that make it theirs - a picture they chose, a line of
 * help, whether an answer is required, how much of one, and whether the
 * question is still asked. All of them default to exactly what the portal did
 * before, so a template nobody edits behaves identically.
 *
 * surveyFlow.ts keeps its own job: type to control. This sits beside it.
 */

export const questionConfigSchema = z.object({
  id: z.string(),
  question_text: z.string().default(""),
  question_type: z.string().default("text"),
  options: z.unknown().default([]),
  sort_order: z.number().default(0),
  image_url: z.string().nullable().default(null),
  help_text: z.string().default(""),
  is_required: z.boolean().default(true),
  max_choices: z.number().nullable().default(null),
  max_length: z.number().nullable().default(null),
  is_active: z.boolean().default(true),
});
export type ConfiguredQuestion = z.infer<typeof questionConfigSchema>;

/** Tolerant parser in the house style: a bad row is dropped, not thrown. */
export function configuredQuestions(rows: unknown): ConfiguredQuestion[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .flatMap((row) => {
      const parsed = questionConfigSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    })
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

/**
 * The questions actually put to a patient.
 *
 * A retired question is not asked. It is NOT deleted, and the answers already
 * given to it stay in the response exactly as they were - a survey answered
 * last month should still read the way it was answered.
 */
export const askableQuestions = (questions: ConfiguredQuestion[]): ConfiguredQuestion[] =>
  questions.filter((q) => q.is_active);

/**
 * The same rule for the clinic's own survey screens, which read raw rows
 * rather than ConfiguredQuestion. A row with no is_active (older data) is
 * still asked; only an explicit retirement takes a question out. Answers views
 * must NOT use this - a past response still shows every question it answered.
 */
export const stillAsked = <T extends { is_active?: boolean | null }>(rows: T[]): T[] =>
  rows.filter((q) => q.is_active !== false);

/**
 * The ideal answer the recommendation AI compares a patient's answer against.
 * Stored as { value } on survey_questions.ideal_answer; an empty box is {}.
 */
export function idealAnswerText(ideal: unknown): string {
  if (!ideal || typeof ideal !== "object") return "";
  const value = (ideal as { value?: unknown }).value;
  return value === undefined || value === null ? "" : String(value);
}

export function idealAnswerFrom(questionType: string, text: string): { value?: string | number } {
  const trimmed = text.trim();
  if (!trimmed) return {};
  if (questionType === "scale") {
    const n = Number(trimmed);
    return Number.isFinite(n) ? { value: Math.min(10, Math.max(1, Math.round(n))) } : {};
  }
  return { value: text };
}

export const QUESTIONS_PER_PAGE_MIN = 1;
export const QUESTIONS_PER_PAGE_MAX = 5;

/** What the database will accept, so the screen cannot offer what it refuses. */
export function questionsPerPage(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 1;
  return Math.min(QUESTIONS_PER_PAGE_MAX, Math.max(QUESTIONS_PER_PAGE_MIN, n));
}

/**
 * The questions grouped into the pages the portal steps through.
 *
 * At one per page this is exactly what the portal did before - a page per
 * question - so nothing moves for a template nobody has configured. The last
 * page is short when the count does not divide evenly, rather than padded.
 */
export function questionPages(
  questions: ConfiguredQuestion[],
  perPage: unknown,
): ConfiguredQuestion[][] {
  const asked = askableQuestions(questions);
  const size = questionsPerPage(perPage);
  const pages: ConfiguredQuestion[][] = [];
  for (let i = 0; i < asked.length; i += size) pages.push(asked.slice(i, i + size));
  return pages;
}

/** "Question 5 of 10", or "Questions 5-6 of 10" when a page holds more. */
export function pageLabel(pages: ConfiguredQuestion[][], pageIndex: number, total: number): string {
  const page = pages[pageIndex];
  if (!page?.length) return "";
  const first = pages.slice(0, pageIndex).reduce((n, p) => n + p.length, 0) + 1;
  const last = first + page.length - 1;
  return first === last ? `Question ${first} of ${total}` : `Questions ${first}-${last} of ${total}`;
}

/**
 * The picture to show above a question.
 *
 * The clinic's own when they have chosen one. Otherwise null, and the caller
 * falls back to the bundled illustration, so every question that was never
 * configured looks exactly as it does today.
 */
export function questionImage(question: Pick<ConfiguredQuestion, "image_url">): string | null {
  const url = String(question.image_url ?? "").trim();
  return url || null;
}

export type AnswerValue = string | string[] | number | null;

/**
 * Whether this answer may be submitted, and why not.
 *
 * Returns null when it is fine. The portal used to require every answer
 * because it had no way to say otherwise; a question marked optional may now
 * be left alone.
 */
export function validateAnswer(
  question: ConfiguredQuestion,
  value: AnswerValue,
): string | null {
  const empty =
    value === null ||
    value === undefined ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && value.length === 0);

  if (empty) return question.is_required ? "This one is needed." : null;

  if (Array.isArray(value) && question.max_choices !== null && value.length > question.max_choices) {
    return `Choose at most ${question.max_choices}.`;
  }
  if (typeof value === "string" && question.max_length !== null && value.length > question.max_length) {
    return `Keep this under ${question.max_length} characters.`;
  }
  return null;
}

/** Whether a whole page may be left behind. */
export const pageBlockers = (
  page: ConfiguredQuestion[],
  answers: Record<string, AnswerValue>,
): string[] =>
  page.flatMap((q) => {
    const problem = validateAnswer(q, answers[q.id] ?? null);
    return problem ? [q.id] : [];
  });

/**
 * A choice question's limit cannot exceed the choices it offers, or the
 * clinic would set a rule nobody can satisfy.
 */
export function maxChoicesCeiling(question: SurveyQuestionLike): number {
  const count = questionOptions(question).length;
  return count > 0 ? count : 50;
}
