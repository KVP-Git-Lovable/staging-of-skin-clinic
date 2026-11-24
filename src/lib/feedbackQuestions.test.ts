import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  answerControl, answerMap, answersFromRow, askable, BUILTIN_COMMENTS, BUILTIN_NPS, BUILTIN_RATING,
  buildAnswerPayload, feedbackQuestions, feedbackRowFrom, FEEDBACK_ANSWER_TYPES, isAnswered,
  questionChoices, questionScale, scoringQuestions, validateAnswer, validateAnswers,
  type FeedbackQuestion,
} from "./feedbackQuestions";

/**
 * The feedback form, now that it is configuration.
 *
 * The thing worth proving over and over here is that the three built-ins keep
 * writing their own columns. 1,200 records, every report, the dashboard and the
 * case-opening trigger read nps_score, service_rating and comments; if a
 * configured form ever stopped filling them the loss would be silent and the
 * reports would simply get quieter.
 */

const q = (over: Partial<FeedbackQuestion> = {}): FeedbackQuestion => ({
  id: over.id ?? "q1",
  question_text: "How was it?",
  help_text: "",
  question_type: "stars",
  options: {},
  sort_order: 0,
  is_active: true,
  is_required: false,
  score_at_or_below: null,
  builtin: null,
  ...over,
});

const builtins = (): FeedbackQuestion[] => [
  q({ id: "n", builtin: BUILTIN_NPS, question_type: "scale_10", options: { min: 0, max: 10 }, is_required: true, sort_order: 0 }),
  q({ id: "r", builtin: BUILTIN_RATING, question_type: "stars", options: { max: 5 }, is_required: true, sort_order: 1 }),
  q({ id: "c", builtin: BUILTIN_COMMENTS, question_type: "text", sort_order: 2 }),
];

describe("reading the questions back", () => {
  it("drops a malformed row rather than throwing the form away", () => {
    // This renders on a screen a patient is looking at. Losing one question is
    // recoverable; a blank page in front of a patient is not.
    const parsed = feedbackQuestions([q({ id: "a" }), { nonsense: true }, null, q({ id: "b" })]);
    expect(parsed.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("gives nothing at all for a non-list", () => {
    for (const value of [null, undefined, {}, "rows", 7]) expect(feedbackQuestions(value)).toEqual([]);
  });

  it("puts them in the clinic's order, ties broken predictably", () => {
    const parsed = feedbackQuestions([
      q({ id: "z", sort_order: 2 }), q({ id: "b", sort_order: 0 }), q({ id: "a", sort_order: 0 }),
    ]);
    expect(parsed.map((p) => p.id)).toEqual(["a", "b", "z"]);
  });

  it("asks only the active ones", () => {
    expect(askable([q({ id: "on" }), q({ id: "off", is_active: false })]).map((x) => x.id)).toEqual(["on"]);
  });
});

describe("which control draws it", () => {
  it("has one for every type it offers", () => {
    for (const type of FEEDBACK_ANSWER_TYPES) {
      const question = q({ question_type: type.value, options: { choices: ["a", "b"] } });
      expect(answerControl(question)).toBeTruthy();
    }
  });

  it("falls back to a text box rather than dead-ending on an unknown type", () => {
    // The same safety surveyFlow.ts builds in: a form that silently drops a
    // question is worse than one that asks it plainly.
    expect(answerControl(q({ question_type: "hologram" }))).toBe("text");
  });

  it("falls back when a list question has no list", () => {
    expect(answerControl(q({ question_type: "choice_one", options: {} }))).toBe("text");
    expect(answerControl(q({ question_type: "choice_one", options: { choices: ["a"] } }))).toBe("choice_one");
  });

  it("knows the range each scoring type runs on", () => {
    expect(questionScale(q({ question_type: "scale_10" }))).toEqual({ min: 0, max: 10 });
    expect(questionScale(q({ question_type: "stars" }))).toEqual({ min: 1, max: 5 });
    expect(questionScale(q({ question_type: "stars", options: { max: 10 } }))).toEqual({ min: 1, max: 10 });
    expect(questionScale(q({ question_type: "emoji" }))).toEqual({ min: 1, max: 5 });
  });

  it("keeps only usable choices", () => {
    expect(questionChoices(q({ options: { choices: ["Reception", "  ", 7, "Doctor"] } })))
      .toEqual(["Reception", "Doctor"]);
    expect(questionChoices(q({ options: {} }))).toEqual([]);
  });

  it("offers a threshold only on types that can carry one", () => {
    const all = FEEDBACK_ANSWER_TYPES.map((t) => q({ id: t.value, question_type: t.value, options: { choices: ["a"] } }));
    expect(scoringQuestions(all).map((x) => x.id)).toEqual(["stars", "emoji", "scale_10"]);
  });
});

describe("answers", () => {
  it("counts zero and no as answers, blank as not", () => {
    expect(isAnswered(q({ question_type: "scale_10" }), 0)).toBe(true);
    expect(isAnswered(q({ question_type: "yes_no" }), false)).toBe(true);
    expect(isAnswered(q({ question_type: "text" }), "  ")).toBe(false);
    expect(isAnswered(q({ question_type: "choice_many" }), [])).toBe(false);
    expect(isAnswered(q(), null)).toBe(false);
  });

  it("lets an optional question go unanswered and holds a required one", () => {
    expect(validateAnswer(q({ is_required: false }), null)).toBeNull();
    expect(validateAnswer(q({ is_required: true }), null)).toMatch(/needs an answer/i);
  });

  it("refuses an answer outside the question's own range", () => {
    expect(validateAnswer(q({ question_type: "stars" }), 6)).toMatch(/1 to 5/);
    expect(validateAnswer(q({ question_type: "stars" }), 5)).toBeNull();
    expect(validateAnswer(q({ question_type: "scale_10" }), 11)).toMatch(/0 to 10/);
    expect(validateAnswer(q({ question_type: "scale_10" }), 0)).toBeNull();
    expect(validateAnswer(q({ question_type: "stars" }), 2.5)).toMatch(/whole number/i);
  });

  it("refuses a choice nobody offered", () => {
    const question = q({ question_type: "choice_one", options: { choices: ["Reception"] } });
    expect(validateAnswer(question, "Car park")).toMatch(/offered/i);
    expect(validateAnswer(question, "Reception")).toBeNull();
    const many = q({ question_type: "choice_many", options: { choices: ["A", "B"] } });
    expect(validateAnswer(many, ["A", "C"])).toMatch(/offered/i);
    expect(validateAnswer(many, ["A", "B"])).toBeNull();
  });

  it("reports every complaint, in the order asked", () => {
    const questions = [
      q({ id: "a", sort_order: 0, is_required: true, question_text: "First" }),
      q({ id: "b", sort_order: 1, is_required: true, question_text: "Second" }),
    ];
    expect(validateAnswers(questions, {})).toEqual([
      "First needs an answer.", "Second needs an answer.",
    ]);
    expect(validateAnswers(questions, { a: 3, b: 3 })).toEqual([]);
  });

  it("writes a key for every question asked, nulls included", () => {
    // A missing key and a deliberate non-answer have to look different later,
    // or the clinic cannot tell "they skipped it" from "we never asked".
    const questions = [q({ id: "a" }), q({ id: "b" }), q({ id: "off", is_active: false })];
    const payload = buildAnswerPayload(questions, { a: 4 });
    expect(payload).toEqual({ a: 4, b: null });
    expect("off" in payload).toBe(false);
  });

  it("reads a jsonb column written by anything", () => {
    expect(answerMap({ a: 3, b: "text", c: true, d: null, e: ["x", 7], f: { nested: 1 } }))
      .toEqual({ a: 3, b: "text", c: true, d: null, e: ["x"] });
    for (const bad of [null, undefined, "x", 7, []]) expect(answerMap(bad)).toEqual({});
  });
});

describe("the three built-ins keep their own columns", () => {
  it("writes the scores and the comment where every report reads them", () => {
    const questions = builtins();
    const row = feedbackRowFrom(questions, { n: 4, r: 2, c: "  slow  " });
    expect(row.nps_score).toBe(4);
    expect(row.service_rating).toBe(2);
    expect(row.comments).toBe("slow");
    // and into answers as well, so one renderer reads everything the same way
    expect(row.answers).toEqual({ n: 4, r: 2, c: "slow" });
  });

  it("falls back to the values the columns have always meant by 'nothing to chase'", () => {
    // Both are NOT NULL and the published build has never sent anything else.
    const row = feedbackRowFrom(builtins(), {});
    expect(row.nps_score).toBe(10);
    expect(row.service_rating).toBe(5);
    expect(row.comments).toBeNull();
  });

  it("carries an extra question's answer alongside them", () => {
    const questions = [...builtins(), q({ id: "clean", sort_order: 3 })];
    const row = feedbackRowFrom(questions, { n: 9, r: 5, clean: 1 });
    expect(row.answers.clean).toBe(1);
    expect(row.nps_score).toBe(9);
  });

  it("reads an old record, recorded before any of this existed", () => {
    // 1,200 rows have three columns and no answers at all. The form has to
    // open them without losing what the patient said.
    const questions = builtins();
    const seeded = answersFromRow(questions, { nps_score: 7, service_rating: 3, comments: "ok", answers: {} });
    expect(seeded).toEqual({ n: 7, r: 3, c: "ok" });
  });

  it("prefers the recorded answers over the columns where both exist", () => {
    const questions = builtins();
    const seeded = answersFromRow(questions, { nps_score: 7, service_rating: 3, comments: "ok", answers: { n: 2 } });
    expect(seeded.n).toBe(2);
    expect(seeded.r).toBe(3);
  });

  it("keeps an extra question's answer when the patient only changes their rating", () => {
    const questions = [...builtins(), q({ id: "ontime", question_type: "yes_no", is_required: true, sort_order: 3 })];
    const seeded = answersFromRow(questions, { nps_score: 8, service_rating: 4, comments: null, answers: { n: 8, r: 4, ontime: true } });
    expect(validateAnswers(questions, seeded)).toEqual([]);
    const saved = feedbackRowFrom(questions, { ...seeded, r: 2 });
    expect(saved.service_rating).toBe(2);
    expect(saved.answers.ontime).toBe(true);
  });

  it("survives a row with nothing in it", () => {
    expect(answersFromRow(builtins(), null)).toEqual({});
    expect(answersFromRow([], { nps_score: 1 })).toEqual({});
  });
});

describe("what the database and the edge function promise", () => {
  const read = (p: string) => readFileSync(p, "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const MIGRATION = "supabase/migrations/20261117090000_feedback_questions_the_clinic_owns.sql";

  it("ships the three questions the clinic already had", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("'nps'");
    expect(sql).toContain("'service_rating'");
    expect(sql).toContain("'comments'");
    // and with the thresholds that were already in force
    expect(sql).toContain("6, 'nps'");
    expect(sql).toContain("3, 'service_rating'");
  });

  it("never loses a changed answer", () => {
    // The snapshot trigger compared only the three built-ins, so an edited
    // extra answer would have been overwritten with no revision behind it.
    const sql = read(MIGRATION);
    expect(sql).toContain("new.answers is distinct from old.answers");
    expect(sql).toMatch(/insert into public\.patient_feedback_revisions[\s\S]*?old\.answers/);
  });

  it("offers every answer type the app can draw", () => {
    const sql = read(MIGRATION);
    for (const type of FEEDBACK_ANSWER_TYPES) expect(sql).toContain(`'${type.value}'`);
  });

  it("keeps a built-in from being deleted", () => {
    expect(read(MIGRATION)).toMatch(/for delete to authenticated using \(\(select public\.is_admin_user\(\)\) and builtin is null\)/);
  });

  it("widens the case reason rather than replacing it", () => {
    // The 28 existing cases carry the old three; dropping one would orphan them.
    const sql = read(MIGRATION);
    expect(sql).toContain("check (opened_reason in ('nps', 'service_rating', 'both', 'question'))");
  });

  it("opens a case from a configured question's own threshold", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("from public.feedback_questions q");
    expect(sql).toContain("q.score_at_or_below is not null");
    expect(sql).toContain("new.answers ->> _q.id::text");
  });

  it("does not change the shape the published portal already reads", () => {
    // The published build calls "feedback" and expects a bare array, so the
    // questions had to arrive as their own action.
    const fn = read("supabase/functions/portal-data/index.ts");
    expect(fn).toContain('case "feedback_questions"');
    // and an update with no answers leaves them alone rather than wiping them
    expect(fn).toContain("answers === undefined ? {} : { answers }");
    // the edit form is seeded from the stored answers, so the list must carry them
    expect(fn).toMatch(/patient_feedback\?select=[^`]*\banswers\b[^`]*&patient_id=eq/);
    // and an edit merges into what is stored instead of replacing it
    expect(fn).toContain("answers = { ...base, ...answers }");
  });

  it("adds a question the database will accept, switched off", () => {
    // "Add a question" sent an empty question_text and was refused by the
    // CHECK, so the button simply failed. And a new question must not appear
    // on a live patient form under the name "New question" before it is
    // written, so it starts switched off.
    const editor = read("src/components/feedback/FeedbackQuestionsEditor.tsx");
    expect(editor).toContain('export const NEW_QUESTION_TEXT = "New question"');
    expect(editor).toContain("question_text: NEW_QUESTION_TEXT");
    expect(editor).not.toMatch(/question_text:\s*""/);
    expect(editor).toMatch(/is_active: false/);
    // and the database's own rule is what made it necessary
    expect(read(MIGRATION)).toContain("length(btrim(question_text)) between 1 and 300");
  });

  it("checks a patient's answers server-side, like the two scores", () => {
    const fn = read("supabase/functions/portal-data/index.ts");
    expect(fn).toContain("An answer is out of range");
    expect(fn).toContain("feedback_questions?select=id,question_type,options,is_active");
  });
});
