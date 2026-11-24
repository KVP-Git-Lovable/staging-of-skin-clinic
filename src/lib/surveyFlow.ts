/**
 * Stepping through a survey one question at a time.
 *
 * The patient portal used to show a whole survey as a stack of cards, so a
 * question the app could not render was merely an odd-looking card you
 * scrolled past. One question per screen changes the stakes: a step with no
 * way forward ends the survey. Every decision here is written so that no
 * reachable state leaves the patient stuck.
 *
 * It lives in src/lib so it can be tested without rendering a 1,000-line
 * component - the convention the rest of the portal's logic follows.
 */

export interface SurveyQuestionLike {
  id: string;
  question_text?: string | null;
  question_type?: string | null;
  options?: unknown;
}

export type AnswerValue = string | number | string[] | null;
export type AnswerMap = Record<string, AnswerValue | undefined>;

/**
 * Which control a question actually gets.
 *
 * The four `question_type` values were tested with independent `&&` blocks,
 * which meant an unrecognised type rendered a label and nothing else. The
 * column is a plain TEXT with no CHECK constraint, so that is one typo in the
 * builder away at any time. Anything unknown now falls to a textarea: the
 * patient can always say something, and can always move on.
 */
export type AnswerControl = "text" | "single" | "multi" | "scale" | "fallback_text";

export function answerControl(question: SurveyQuestionLike): AnswerControl {
  const type = String(question?.question_type ?? "").trim();
  if (type === "scale") return "scale";
  if (type === "text") return "text";
  if (type === "single_choice") return questionOptions(question).length > 0 ? "single" : "fallback_text";
  if (type === "multi_choice") return questionOptions(question).length > 0 ? "multi" : "fallback_text";
  return "fallback_text";
}

/**
 * The option labels, from either shape the column has ever held.
 *
 * The builder writes a bare array; some seeded rows carry `{choices: [...]}`.
 * Duplicates are dropped because the list is keyed by the option text when it
 * renders, and the builder's comma-split turns "Yes, Yes" into two identical
 * options - which React keys collide on and which would tick together.
 */
export function questionOptions(question: SurveyQuestionLike): string[] {
  const raw = question?.options;
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object" && Array.isArray((raw as { choices?: unknown }).choices)) {
    list = (raw as { choices: unknown[] }).choices;
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (item === null || item === undefined) continue;
    const label = String(item).trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

/**
 * The ends of a scale.
 *
 * Every scale question in the clinic's database stores `options` as a bare
 * array - the builder only collects an ideal score for this type and never
 * writes min or max - so in practice this always answers 1 to 10. The object
 * shape is still read, because a seeded row could carry one.
 */
export function scaleBounds(question: SurveyQuestionLike): { min: number; max: number } {
  const raw = question?.options;
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const asNumber = (value: unknown, fallback: number): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  let min = asNumber(source.min, 1);
  let max = asNumber(source.max, 10);
  if (min > max) [min, max] = [max, min];
  if (min === max) max = min + 1;
  return { min, max };
}

/**
 * Has the patient actually answered?
 *
 * Deliberately strict about the two values that used to slip through as
 * "answered" while carrying nothing: an empty multi-select array, and a
 * textarea holding only spaces. Deliberately permissive about zero, which is
 * a real answer on a scale that starts at zero.
 */
export function isAnswered(question: SurveyQuestionLike, value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  switch (answerControl(question)) {
    case "scale":
      return typeof value === "number" && Number.isFinite(value);
    case "multi":
      return Array.isArray(value) && value.length > 0;
    case "single":
      if (typeof value === "number") return Number.isFinite(value);
      return typeof value === "string" && value.trim().length > 0;
    default:
      // text and the fallback textarea
      if (Array.isArray(value)) return value.length > 0;
      return typeof value === "string" ? value.trim().length > 0 : true;
  }
}

/**
 * May this question move the patient on by itself?
 *
 * Only a single choice from a list. A slider fires continuously while it is
 * being dragged, a multi-select cannot know when somebody has finished
 * ticking, and free text certainly cannot.
 */
export function autoAdvances(question: SurveyQuestionLike): boolean {
  return answerControl(question) === "single";
}

/** How many of these questions have been answered. */
export function answeredCount(questions: SurveyQuestionLike[], answers: AnswerMap): number {
  return questions.reduce((n, q) => n + (isAnswered(q, answers[q.id]) ? 1 : 0), 0);
}

/** The first question still waiting for an answer, or `questions.length`. */
export function firstUnansweredIndex(questions: SurveyQuestionLike[], answers: AnswerMap): number {
  const at = questions.findIndex((q) => !isAnswered(q, answers[q.id]));
  return at === -1 ? questions.length : at;
}

/**
 * The answers object that gets submitted - one key per question, always.
 *
 * This is a safety contract, not tidiness. The doctor's review screen
 * (src/pages/AllSurveys.tsx:65-72) looks an answer up by question id and,
 * when that key is MISSING, falls back to `answerKeys[idx]` - the answer at
 * the same position in the object. So a payload that omits one question does
 * not render a blank against it; it renders a DIFFERENT question's answer,
 * with nothing on screen to say so.
 *
 * Writing null for anything unanswered keeps `answers[q.id] !== undefined`
 * true for every question, so that positional branch can never be reached
 * from the portal. Do not "tidy away" the nulls.
 *
 * An empty array is normalised to null for the same reason: the review screen
 * joins arrays with ", ", so `[]` renders as an empty line that reads like a
 * bug rather than like no answer.
 */
export function buildAnswerPayload(
  questions: SurveyQuestionLike[],
  answers: AnswerMap,
): Record<string, AnswerValue> {
  const payload: Record<string, AnswerValue> = {};
  for (const q of questions) {
    const value = answers[q.id];
    if (value === undefined || value === null) {
      payload[q.id] = null;
    } else if (Array.isArray(value)) {
      payload[q.id] = value.length > 0 ? value : null;
    } else if (typeof value === "string") {
      payload[q.id] = value.trim().length > 0 ? value : null;
    } else {
      payload[q.id] = value;
    }
  }
  return payload;
}

/** How an answer reads on the review screen. */
export function answerSummary(value: AnswerValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}
