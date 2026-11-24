import { z } from "zod";

/**
 * The feedback form, as configuration rather than JSX.
 *
 * It used to be three questions written out by hand in two files - the
 * clinic's Feedback tab and the patient portal - which had to be kept in step
 * with each other by somebody remembering to. Now both render from this.
 *
 * Modelled on src/lib/surveyFlow.ts, which is the house's tested
 * type-to-control resolver. Its `fallback_text` idea is copied deliberately: an
 * answer type this build has never heard of must degrade to a text box, not
 * leave a patient staring at a question they cannot answer.
 *
 * ── The three built-ins ──
 *
 * "nps", "service_rating" and "comments" are rows like any other and can be
 * reworded, restyled, reordered and rethresholded. They cannot be deleted,
 * because their answers are columns carrying 1,200 records that the reports,
 * the dashboard and the root-cause cases all read.
 */

export type FeedbackAnswerType =
  | "stars" | "emoji" | "scale_10" | "choice_one" | "choice_many" | "yes_no" | "text";

export interface FeedbackAnswerTypeInfo {
  value: FeedbackAnswerType;
  label: string;
  hint: string;
  /** Can an answer to this be low enough to open a root-cause case? */
  scorable: boolean;
  /** Does it need a list of choices before it can be asked? */
  needsChoices: boolean;
}

export const FEEDBACK_ANSWER_TYPES: readonly FeedbackAnswerTypeInfo[] = [
  { value: "stars", label: "Stars", hint: "One to five stars.", scorable: true, needsChoices: false },
  { value: "emoji", label: "Faces", hint: "A row of faces, sad to happy.", scorable: true, needsChoices: false },
  { value: "scale_10", label: "0 to 10", hint: "The row of numbers, as on the recommend question.", scorable: true, needsChoices: false },
  { value: "yes_no", label: "Yes or no", hint: "Two buttons.", scorable: false, needsChoices: false },
  { value: "choice_one", label: "Choose one", hint: "A list where one answer can be picked.", scorable: false, needsChoices: true },
  { value: "choice_many", label: "Choose any", hint: "A list where several answers can be picked.", scorable: false, needsChoices: true },
  { value: "text", label: "Text box", hint: "They write their own answer.", scorable: false, needsChoices: false },
] as const;

const BY_TYPE = new Map(FEEDBACK_ANSWER_TYPES.map((t) => [t.value, t]));

export const answerTypeInfo = (type: string): FeedbackAnswerTypeInfo | undefined =>
  BY_TYPE.get(type as FeedbackAnswerType);
export const answerTypeLabel = (type: string): string => answerTypeInfo(type)?.label ?? "Text box";
export const isScorable = (type: string): boolean => !!answerTypeInfo(type)?.scorable;

/** The faces, worst first, so a lower answer always means less happy. */
export const EMOJI_FACES = ["😞", "🙁", "😐", "🙂", "😀"] as const;

export const feedbackQuestionSchema = z.object({
  id: z.string(),
  question_text: z.string().trim().min(1).max(300),
  help_text: z.string().max(300).default(""),
  question_type: z.string().default("text"),
  options: z.unknown().default({}),
  sort_order: z.number().default(0),
  is_active: z.boolean().default(true),
  is_required: z.boolean().default(false),
  score_at_or_below: z.number().nullable().default(null),
  builtin: z.string().nullable().default(null),
});
export type FeedbackQuestion = z.infer<typeof feedbackQuestionSchema>;

/**
 * Rows as something safe to render.
 *
 * Forgiving one row at a time: a malformed question is dropped, never thrown.
 * This renders on a screen a patient is looking at, and losing one question is
 * recoverable in a way that a blank page in front of a patient is not.
 */
export function feedbackQuestions(rows: unknown): FeedbackQuestion[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .flatMap((row) => {
      const parsed = feedbackQuestionSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    })
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

/** Only the ones to put in front of somebody. */
export const askable = (questions: FeedbackQuestion[]): FeedbackQuestion[] =>
  questions.filter((q) => q.is_active);

/** Only the ones a threshold can apply to. */
export const scoringQuestions = (questions: FeedbackQuestion[]): FeedbackQuestion[] =>
  askable(questions).filter((q) => isScorable(q.question_type));

type Options = Record<string, unknown>;
const opts = (question: FeedbackQuestion): Options =>
  question.options && typeof question.options === "object" && !Array.isArray(question.options)
    ? (question.options as Options)
    : {};

/**
 * The numbers a scoring question runs on.
 *
 * Read from options where it is set, so a clinic can ask for ten stars if it
 * wants, and defaulted per type otherwise. A threshold box is bounded by this,
 * which is what stops "open a case at 4 or below" on a question whose best
 * possible answer is 3.
 */
export function questionScale(question: FeedbackQuestion): { min: number; max: number } {
  const o = opts(question);
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  if (question.question_type === "scale_10") return { min: num(o.min, 0), max: num(o.max, 10) };
  if (question.question_type === "emoji") return { min: 1, max: EMOJI_FACES.length };
  return { min: 1, max: num(o.max, 5) };
}

/** The choices for a list question, tolerant of both shapes seen in the wild. */
export function questionChoices(question: FeedbackQuestion): string[] {
  const o = opts(question);
  const raw = Array.isArray(o.choices) ? o.choices : [];
  return raw.flatMap((c) => (typeof c === "string" && c.trim() ? [c.trim()] : []));
}

export const questionMaxLength = (question: FeedbackQuestion): number => {
  const max = opts(question).maxLength;
  return typeof max === "number" && max > 0 ? max : 2000;
};

export type AnswerValue = number | string | string[] | boolean | null;
export type AnswerMap = Record<string, AnswerValue>;

/** Which control draws it. An unknown type falls back rather than dead-ends. */
export type AnswerControl = "stars" | "emoji" | "scale" | "choice_one" | "choice_many" | "yes_no" | "text";
export function answerControl(question: FeedbackQuestion): AnswerControl {
  const type = question.question_type;
  if (type === "stars" || type === "emoji" || type === "yes_no" || type === "text") return type;
  if (type === "scale_10") return "scale";
  if (type === "choice_one") return questionChoices(question).length ? "choice_one" : "text";
  if (type === "choice_many") return questionChoices(question).length ? "choice_many" : "text";
  return "text";
}

/** Has this been answered at all? Zero and "no" are answers; blank is not. */
export function isAnswered(question: FeedbackQuestion, value: AnswerValue): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

/** The complaint about one answer, or null when it is fine. */
export function validateAnswer(question: FeedbackQuestion, value: AnswerValue): string | null {
  if (!isAnswered(question, value)) {
    return question.is_required ? `${question.question_text} needs an answer.` : null;
  }
  const control = answerControl(question);
  if (control === "stars" || control === "emoji" || control === "scale") {
    const { min, max } = questionScale(question);
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
      return `${question.question_text} takes a whole number from ${min} to ${max}.`;
    }
    return null;
  }
  if (control === "yes_no") {
    return typeof value === "boolean" ? null : `${question.question_text} takes yes or no.`;
  }
  if (control === "choice_one") {
    return typeof value === "string" && questionChoices(question).includes(value)
      ? null
      : `${question.question_text} takes one of the offered answers.`;
  }
  if (control === "choice_many") {
    const allowed = questionChoices(question);
    return Array.isArray(value) && value.every((v) => allowed.includes(v))
      ? null
      : `${question.question_text} takes only the offered answers.`;
  }
  if (typeof value !== "string") return `${question.question_text} takes text.`;
  return value.length > questionMaxLength(question)
    ? `${question.question_text} is too long.`
    : null;
}

/** Every complaint about a whole form, in the order the questions are asked. */
export const validateAnswers = (questions: FeedbackQuestion[], answers: AnswerMap): string[] =>
  askable(questions).flatMap((q) => {
    const complaint = validateAnswer(q, answers[q.id] ?? null);
    return complaint ? [complaint] : [];
  });

/**
 * What gets stored.
 *
 * A key for EVERY asked question, nulls included - the same contract
 * surveyFlow.ts documents. A missing key and a deliberate non-answer look
 * identical later otherwise, and the clinic cannot tell "they skipped it" from
 * "we never asked".
 */
export function buildAnswerPayload(questions: FeedbackQuestion[], answers: AnswerMap): AnswerMap {
  const payload: AnswerMap = {};
  for (const q of askable(questions)) {
    const value = answers[q.id];
    if (!isAnswered(q, (value ?? null) as AnswerValue)) payload[q.id] = null;
    else if (typeof value === "string") payload[q.id] = value.trim();
    else payload[q.id] = value as AnswerValue;
  }
  return payload;
}

/** Read answers back, tolerant of a jsonb column written by anything. */
export function answerMap(value: unknown): AnswerMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: AnswerMap = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === null) out[key] = null;
    else if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") out[key] = v;
    else if (Array.isArray(v)) out[key] = v.filter((x): x is string => typeof x === "string");
  }
  return out;
}

export const BUILTIN_NPS = "nps";
export const BUILTIN_RATING = "service_rating";
export const BUILTIN_COMMENTS = "comments";

export const builtinQuestion = (questions: FeedbackQuestion[], builtin: string): FeedbackQuestion | undefined =>
  questions.find((q) => q.builtin === builtin);

/**
 * One form's answers, as the row that gets written.
 *
 * The three built-ins land in their own columns as well as in `answers`,
 * because nps_score, service_rating and comments are what 1,200 records, every
 * report, the dashboard and the case-opening trigger have always read. Nothing
 * outside this file needs to know that those three are special.
 *
 * The two scores keep their old fallbacks (10 and 5) when unanswered, which is
 * what the columns have always meant by "nothing to chase here" - they are NOT
 * NULL and the published build has never sent anything else.
 */
export function feedbackRowFrom(
  questions: FeedbackQuestion[],
  answers: AnswerMap,
): { nps_score: number; service_rating: number; comments: string | null; answers: AnswerMap } {
  const value = (builtin: string): AnswerValue => {
    const q = builtinQuestion(questions, builtin);
    return q ? answers[q.id] ?? null : null;
  };
  const nps = value(BUILTIN_NPS);
  const rating = value(BUILTIN_RATING);
  const comments = value(BUILTIN_COMMENTS);
  return {
    nps_score: typeof nps === "number" ? nps : 10,
    service_rating: typeof rating === "number" ? rating : 5,
    comments: typeof comments === "string" && comments.trim() ? comments.trim() : null,
    answers: buildAnswerPayload(questions, answers),
  };
}

/**
 * The other direction: a stored row as answers the form can show.
 *
 * `answers` wins where it has a key, because it is what the questions were
 * actually answered with. The columns fill the built-ins in for the 1,200 rows
 * recorded before any of this existed, which have no `answers` at all.
 */
export function answersFromRow(
  questions: FeedbackQuestion[],
  row: { nps_score?: number | null; service_rating?: number | null; comments?: string | null; answers?: unknown } | null | undefined,
): AnswerMap {
  const stored = answerMap(row?.answers);
  const out: AnswerMap = { ...stored };
  const seed = (builtin: string, value: AnswerValue) => {
    const q = builtinQuestion(questions, builtin);
    if (q && !(q.id in stored) && value !== null && value !== undefined) out[q.id] = value;
  };
  seed(BUILTIN_NPS, row?.nps_score ?? null);
  seed(BUILTIN_RATING, row?.service_rating ?? null);
  seed(BUILTIN_COMMENTS, row?.comments ?? null);
  return out;
}
