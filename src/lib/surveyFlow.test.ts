import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  answerControl,
  answerSummary,
  answeredCount,
  autoAdvances,
  buildAnswerPayload,
  firstUnansweredIndex,
  isAnswered,
  questionOptions,
  scaleBounds,
  type SurveyQuestionLike,
} from "./surveyFlow";

const q = (over: Partial<SurveyQuestionLike> = {}): SurveyQuestionLike => ({
  id: "q1",
  question_text: "A question",
  question_type: "text",
  options: [],
  ...over,
});

describe("answerControl", () => {
  it("maps the four types the builder can produce", () => {
    expect(answerControl(q({ question_type: "text" }))).toBe("text");
    expect(answerControl(q({ question_type: "scale" }))).toBe("scale");
    expect(answerControl(q({ question_type: "single_choice", options: ["a", "b"] }))).toBe("single");
    expect(answerControl(q({ question_type: "multi_choice", options: ["a", "b"] }))).toBe("multi");
  });

  it("falls back to a textarea when a choice question has no options", () => {
    expect(answerControl(q({ question_type: "single_choice", options: [] }))).toBe("fallback_text");
    expect(answerControl(q({ question_type: "multi_choice", options: null }))).toBe("fallback_text");
  });

  it("gives an unrecognised type a control instead of nothing", () => {
    // question_type is a plain TEXT column with no CHECK constraint. Before
    // this, an unknown value rendered a label and no input - survivable on a
    // stacked form, fatal on one question per screen.
    for (const type of ["", "  ", "ranking", "date", null, undefined]) {
      expect(answerControl(q({ question_type: type })), `type ${JSON.stringify(type)}`).toBe(
        "fallback_text",
      );
    }
  });
});

describe("questionOptions", () => {
  it("reads both shapes the column has held", () => {
    expect(questionOptions(q({ options: ["a", "b"] }))).toEqual(["a", "b"]);
    expect(questionOptions(q({ options: { choices: ["a", "b"] } }))).toEqual(["a", "b"]);
  });

  it("returns nothing for the shapes that carry no choices", () => {
    for (const options of [[], null, undefined, {}, { min: 1, max: 10 }, "a,b", 7]) {
      expect(questionOptions(q({ options })), JSON.stringify(options)).toEqual([]);
    }
  });

  it("drops blanks and duplicates", () => {
    // The builder splits one comma-separated input, so "Yes, Yes" and a
    // trailing comma are both one keystroke away. The list is keyed by the
    // option text, so duplicates collide and tick together.
    expect(questionOptions(q({ options: ["Yes", " Yes ", "", "  ", "No"] }))).toEqual(["Yes", "No"]);
  });

  it("coerces non-strings rather than rendering [object Object]", () => {
    expect(questionOptions(q({ options: [1, 2, null, undefined] }))).toEqual(["1", "2"]);
  });
});

describe("scaleBounds", () => {
  it("is 1 to 10 for every scale the clinic actually has", () => {
    // Verified against the live database: all 58 questions store `options`
    // as a bare array and none carries min or max, because the builder only
    // collects an ideal score for this type.
    expect(scaleBounds(q({ question_type: "scale", options: [] }))).toEqual({ min: 1, max: 10 });
    expect(scaleBounds(q({ question_type: "scale", options: null }))).toEqual({ min: 1, max: 10 });
  });

  it("honours an explicit range if a seeded row has one", () => {
    expect(scaleBounds(q({ options: { min: 0, max: 5 } }))).toEqual({ min: 0, max: 5 });
    expect(scaleBounds(q({ options: { min: "2", max: "8" } }))).toEqual({ min: 2, max: 8 });
  });

  it("refuses to return a range a slider cannot render", () => {
    expect(scaleBounds(q({ options: { min: 9, max: 2 } }))).toEqual({ min: 2, max: 9 });
    expect(scaleBounds(q({ options: { min: 3, max: 3 } }))).toEqual({ min: 3, max: 4 });
    expect(scaleBounds(q({ options: { min: "x", max: NaN } }))).toEqual({ min: 1, max: 10 });
  });
});

describe("isAnswered", () => {
  const scale = q({ question_type: "scale" });
  const single = q({ question_type: "single_choice", options: ["a", "b"] });
  const multi = q({ question_type: "multi_choice", options: ["a", "b"] });
  const text = q({ question_type: "text" });

  it("treats nothing at all as unanswered", () => {
    for (const question of [scale, single, multi, text]) {
      expect(isAnswered(question, undefined)).toBe(false);
      expect(isAnswered(question, null)).toBe(false);
    }
  });

  it("counts zero on a scale as a real answer", () => {
    // The old check needed a `!== 0` special case to avoid calling it blank.
    expect(isAnswered(scale, 0)).toBe(true);
    expect(isAnswered(scale, 6)).toBe(true);
    expect(isAnswered(scale, Number.NaN)).toBe(false);
    expect(isAnswered(scale, "6")).toBe(false);
  });

  it("does not accept an emptied multi-select", () => {
    // Untick every box and the value is [], which the old check read as
    // answered - so a blank array was submitted and rendered as an empty
    // line on the doctor's screen.
    expect(isAnswered(multi, [])).toBe(false);
    expect(isAnswered(multi, ["a"])).toBe(true);
  });

  it("does not accept whitespace as a written answer", () => {
    expect(isAnswered(text, "   ")).toBe(false);
    expect(isAnswered(text, "")).toBe(false);
    expect(isAnswered(text, "yes")).toBe(true);
  });

  it("accepts a typed answer for a choice question that has no options", () => {
    const fallback = q({ question_type: "single_choice", options: [] });
    expect(isAnswered(fallback, "")).toBe(false);
    expect(isAnswered(fallback, "something")).toBe(true);
  });

  it("lets an unrenderable question be passed", () => {
    // The patient must never be trapped on a step the app cannot draw.
    const unknown = q({ question_type: "ranking" });
    expect(isAnswered(unknown, "anything")).toBe(true);
  });
});

describe("autoAdvances", () => {
  it("is true only for a single choice from a list", () => {
    expect(autoAdvances(q({ question_type: "single_choice", options: ["a"] }))).toBe(true);
  });

  it("is false for everything that cannot tell when the patient is done", () => {
    expect(autoAdvances(q({ question_type: "scale" }))).toBe(false);
    expect(autoAdvances(q({ question_type: "multi_choice", options: ["a"] }))).toBe(false);
    expect(autoAdvances(q({ question_type: "text" }))).toBe(false);
    // A single choice with no options is a textarea, not a tap.
    expect(autoAdvances(q({ question_type: "single_choice", options: [] }))).toBe(false);
  });
});

describe("counting and finding the next question", () => {
  const questions = [
    q({ id: "a", question_type: "single_choice", options: ["x", "y"] }),
    q({ id: "b", question_type: "scale" }),
    q({ id: "c", question_type: "text" }),
  ];

  it("counts only real answers", () => {
    expect(answeredCount(questions, {})).toBe(0);
    expect(answeredCount(questions, { a: "x", b: 0, c: "  " })).toBe(2);
    expect(answeredCount(questions, { a: "x", b: 0, c: "hi" })).toBe(3);
  });

  it("points at the first gap, and past the end when there is none", () => {
    expect(firstUnansweredIndex(questions, {})).toBe(0);
    expect(firstUnansweredIndex(questions, { a: "x" })).toBe(1);
    expect(firstUnansweredIndex(questions, { a: "x", b: 3, c: "hi" })).toBe(3);
  });
});

/**
 * The part that is about patient safety rather than tidiness.
 */
describe("buildAnswerPayload", () => {
  const questions = [
    q({ id: "a", question_type: "single_choice", options: ["x", "y"] }),
    q({ id: "b", question_type: "multi_choice", options: ["p", "r"] }),
    q({ id: "c", question_type: "text" }),
  ];

  it("writes one key per question even when nothing was answered", () => {
    // src/pages/AllSurveys.tsx:65-72 looks an answer up by question id and,
    // if that key is MISSING, falls back to answerKeys[idx] - the answer
    // sitting at the same position in the object. A payload that omits a
    // question therefore shows the doctor a DIFFERENT question's answer,
    // with nothing on screen to reveal it. Never drop a key.
    expect(buildAnswerPayload(questions, {})).toEqual({ a: null, b: null, c: null });
    expect(Object.keys(buildAnswerPayload(questions, { b: ["p"] }))).toEqual(["a", "b", "c"]);
  });

  it("keeps the questions' own order", () => {
    expect(Object.keys(buildAnswerPayload(questions, { c: "z", a: "x" }))).toEqual(["a", "b", "c"]);
  });

  it("drops an answer whose question is no longer in the template", () => {
    // A stale key would lengthen the object and shift every position in that
    // same fallback.
    expect(buildAnswerPayload(questions, { a: "x", gone: "orphan" })).toEqual({
      a: "x",
      b: null,
      c: null,
    });
  });

  it("normalises the values that render as a confusing blank", () => {
    expect(buildAnswerPayload(questions, { a: "  ", b: [], c: "" })).toEqual({
      a: null,
      b: null,
      c: null,
    });
  });

  it("keeps zero, which is a real answer", () => {
    const scale = [q({ id: "s", question_type: "scale" })];
    expect(buildAnswerPayload(scale, { s: 0 })).toEqual({ s: 0 });
  });

  it("returns nothing for a template with no questions", () => {
    expect(buildAnswerPayload([], { a: "x" })).toEqual({});
  });
});

describe("answerSummary", () => {
  it("reads an answer back the way the review screen shows it", () => {
    expect(answerSummary(["a", "b"])).toBe("a, b");
    expect(answerSummary(0)).toBe("0");
    expect(answerSummary("hello")).toBe("hello");
    expect(answerSummary(null)).toBe("");
    expect(answerSummary(undefined)).toBe("");
  });
});

/**
 * The contract above is only worth anything if the component uses it.
 */
describe("the portal survey uses this module", () => {
  const page = () => readFileSync("src/components/portal/PortalSurveyFill.tsx", "utf8");

  it("submits the normalised payload, not the raw answers object", () => {
    const code = page();
    expect(code).toContain("buildAnswerPayload");
    // Both the stored row and the text the AI saw must be the same object.
    const submit = code.slice(code.indexOf("const handleSubmit"));
    expect(submit, "the raw answers map is still being submitted").not.toMatch(
      /answers,\s*\n\s*aiRecommendation/,
    );
  });

  it("decides what is answered here rather than re-inventing the check", () => {
    const code = page();
    expect(code).toContain("isAnswered");
    expect(code, "the old truthiness check is still in place").not.toMatch(
      /!answers\[q\.id\] && answers\[q\.id\] !== 0/,
    );
  });
});
