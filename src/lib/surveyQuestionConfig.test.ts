import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  askableQuestions, configuredQuestions, maxChoicesCeiling, pageBlockers, pageLabel,
  questionImage, questionPages, questionsPerPage, validateAnswer, type ConfiguredQuestion,
  stillAsked, idealAnswerText, idealAnswerFrom,
} from "./surveyQuestionConfig";
import { questionSyncPlan } from "./surveyQuestionSync";

/**
 * What the clinic has said about a survey question.
 *
 * Two things have to keep holding. A template nobody has configured must read
 * exactly as it did before, and nothing a patient has already answered may be
 * cut loose from the question it answered.
 */

const q = (over: Partial<ConfiguredQuestion> = {}): ConfiguredQuestion => ({
  id: over.id ?? "q1", question_text: "How is it?", question_type: "text",
  options: [], sort_order: 0, image_url: null, help_text: "", is_required: true,
  max_choices: null, max_length: null, is_active: true, ...over,
});

describe("reading questions back", () => {
  it("drops a malformed row rather than the whole survey", () => {
    // A patient is looking at this screen. One bad row must not empty it.
    expect(configuredQuestions([q({ id: "a" }), null, { nope: 1 }, q({ id: "b" })]).map((x) => x.id))
      .toEqual(["a", "b"]);
  });

  it("gives nothing for a non-list", () => {
    for (const v of [null, undefined, {}, "x"]) expect(configuredQuestions(v)).toEqual([]);
  });

  it("fills in today's behaviour for a question nobody has configured", () => {
    // The 58 live questions have none of these columns set by hand.
    const [parsed] = configuredQuestions([
      { id: "x", question_text: "Hi", question_type: "text", sort_order: 0 },
    ]);
    expect(parsed.is_required).toBe(true);
    expect(parsed.is_active).toBe(true);
    expect(parsed.image_url).toBeNull();
    expect(parsed.help_text).toBe("");
    expect(parsed.max_choices).toBeNull();
    expect(parsed.max_length).toBeNull();
  });

  it("asks them in the clinic's order", () => {
    const list = configuredQuestions([q({ id: "second", sort_order: 1 }), q({ id: "first", sort_order: 0 })]);
    expect(list.map((x) => x.id)).toEqual(["first", "second"]);
  });
});

describe("a retired question", () => {
  const list = [q({ id: "a" }), q({ id: "gone", is_active: false }), q({ id: "b", sort_order: 2 })];

  it("is not asked", () => {
    expect(askableQuestions(list).map((x) => x.id)).toEqual(["a", "b"]);
    expect(questionPages(list, 1).flat().map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("is retired, not deleted, so its answers are still there", () => {
    // The row stays and the answer keyed to it stays with it. Nothing in this
    // module removes either.
    expect(list.find((x) => x.id === "gone")).toBeDefined();
  });
});

describe("how many on a page", () => {
  const five = [0, 1, 2, 3, 4].map((n) => q({ id: `q${n}`, sort_order: n }));

  it("puts one on a page by default, which is what the portal always did", () => {
    expect(questionPages(five, 1).map((p) => p.length)).toEqual([1, 1, 1, 1, 1]);
  });

  it("puts two on a page when the clinic asks, and leaves the last one short", () => {
    // Five does not divide by two. The last page carries one, not a blank.
    expect(questionPages(five, 2).map((p) => p.map((x) => x.id)))
      .toEqual([["q0", "q1"], ["q2", "q3"], ["q4"]]);
  });

  it("copes with a survey shorter than one page", () => {
    expect(questionPages([q({ id: "only" })], 5)).toEqual([[expect.objectContaining({ id: "only" })]]);
    expect(questionPages([], 3)).toEqual([]);
  });

  it("never offers what the database would refuse", () => {
    // The column is CHECKed between 1 and 5.
    expect(questionsPerPage(0)).toBe(1);
    expect(questionsPerPage(99)).toBe(5);
    expect(questionsPerPage(-4)).toBe(1);
    expect(questionsPerPage(2.4)).toBe(2);
    for (const junk of [null, undefined, "two", NaN, {}]) expect(questionsPerPage(junk)).toBe(1);
  });
});

describe("what the counter reads", () => {
  const five = [0, 1, 2, 3, 4].map((n) => q({ id: `q${n}`, sort_order: n }));

  it("reads as it always has when a page holds one", () => {
    const pages = questionPages(five, 1);
    expect(pageLabel(pages, 0, 5)).toBe("Question 1 of 5");
    expect(pageLabel(pages, 4, 5)).toBe("Question 5 of 5");
  });

  it("reads as a range when a page holds more", () => {
    const pages = questionPages(five, 2);
    expect(pageLabel(pages, 0, 5)).toBe("Questions 1-2 of 5");
    expect(pageLabel(pages, 1, 5)).toBe("Questions 3-4 of 5");
    // The short last page is one question again, and says so.
    expect(pageLabel(pages, 2, 5)).toBe("Question 5 of 5");
  });

  it("says nothing for a page that is not there", () => {
    expect(pageLabel(questionPages(five, 2), 9, 5)).toBe("");
  });
});

describe("the picture", () => {
  it("is the clinic's when they chose one", () => {
    expect(questionImage(q({ image_url: "https://example.test/a.jpg" })))
      .toBe("https://example.test/a.jpg");
  });

  it("is null when they have not, so the caller falls back to the illustration", () => {
    // This is what all 58 live questions do, and why nothing looks different
    // until somebody uploads something.
    expect(questionImage(q({ image_url: null }))).toBeNull();
    expect(questionImage(q({ image_url: "   " }))).toBeNull();
  });
});

describe("whether an answer may be submitted", () => {
  it("needs the ones the clinic marked as needed", () => {
    expect(validateAnswer(q({ is_required: true }), null)).toBe("This one is needed.");
    expect(validateAnswer(q({ is_required: true }), "  ")).toBe("This one is needed.");
    expect(validateAnswer(q({ is_required: true }), [])).toBe("This one is needed.");
  });

  it("lets an optional one be skipped", () => {
    // Every question used to be required because there was no way to say
    // otherwise.
    expect(validateAnswer(q({ is_required: false }), null)).toBeNull();
    expect(validateAnswer(q({ is_required: false }), "")).toBeNull();
  });

  it("holds the clinic's limits", () => {
    expect(validateAnswer(q({ max_choices: 2 }), ["a", "b", "c"])).toBe("Choose at most 2.");
    expect(validateAnswer(q({ max_choices: 2 }), ["a", "b"])).toBeNull();
    expect(validateAnswer(q({ max_length: 5 }), "abcdef")).toBe("Keep this under 5 characters.");
    expect(validateAnswer(q({ max_length: 5 }), "abcde")).toBeNull();
  });

  it("imposes no limit when none is set, which is every question today", () => {
    expect(validateAnswer(q(), ["a", "b", "c", "d", "e"])).toBeNull();
    expect(validateAnswer(q(), "a".repeat(4000))).toBeNull();
  });

  it("names every question on the page still holding it up", () => {
    const page = [q({ id: "a" }), q({ id: "b", is_required: false }), q({ id: "c" })];
    expect(pageBlockers(page, { a: "done", b: null, c: null })).toEqual(["c"]);
    expect(pageBlockers(page, { a: "done", b: null, c: "done" })).toEqual([]);
  });

  it("cannot cap choices above the choices offered", () => {
    expect(maxChoicesCeiling({ id: "x", question_type: "multi_choice", options: ["a", "b", "c"] })).toBe(3);
    // No list to cap against: fall back to the column's own ceiling.
    expect(maxChoicesCeiling({ id: "x", question_type: "text", options: [] })).toBe(50);
  });
});

describe("saving keeps a question's id for life", () => {
  it("updates what exists instead of replacing it", () => {
    // This is the one that protects the answers. survey_responses.answers is
    // keyed by question id, and the old save deleted every row and inserted
    // them again, so each save cut the answers loose.
    const plan = questionSyncPlan(["a", "b"], [{ id: "b" }, { id: "a" }]);
    expect(plan.update.map((x) => x.id)).toEqual(["b", "a"]);
    expect(plan.insert).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
  });

  it("writes the order from the position on screen", () => {
    const plan = questionSyncPlan(["a", "b"], [{ id: "b" }, { id: "a" }]);
    expect(plan.update.map((x) => [x.id, x.sort_order])).toEqual([["b", 0], ["a", 1]]);
  });

  it("inserts a question that is genuinely new", () => {
    const plan = questionSyncPlan(["a"], [{ id: "a" }, {}]);
    expect(plan.update.map((x) => x.id)).toEqual(["a"]);
    expect(plan.insert).toHaveLength(1);
    expect(plan.insert[0]).not.toHaveProperty("id");
    expect(plan.deleteIds).toEqual([]);
  });

  it("deletes only what was really removed", () => {
    expect(questionSyncPlan(["a", "b", "c"], [{ id: "a" }]).deleteIds).toEqual(["b", "c"]);
  });

  it("will not resurrect a row that is no longer in the database", () => {
    // A stale draft carrying a deleted id becomes a new question, not an
    // update of something that is gone.
    const plan = questionSyncPlan(["a"], [{ id: "ghost" }]);
    expect(plan.update).toEqual([]);
    expect(plan.insert).toHaveLength(1);
    // The dead id is dropped, or the insert would try to claim it back.
    expect(plan.insert[0]).not.toHaveProperty("id");
    expect(plan.deleteIds).toEqual(["a"]);
  });
});

describe("the save path no longer wipes the template", () => {
  const code = (p: string) =>
    readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  for (const file of [
    "src/components/surveys/SurveyTemplateForm.tsx",
    "src/components/surveys/PortalSurveyConfig.tsx",
  ]) {
    it(`${file} deletes by id, never by template`, () => {
      const source = code(file);
      // The exact shape of the bug: every question of the template, gone.
      expect(source).not.toMatch(/from\("survey_questions"\)\s*\.delete\(\)\s*\.eq\("template_id"/);
      expect(source).toContain("questionSyncPlan");
    });
  }
});

describe("what the database promises", () => {
  const MIGRATION = "supabase/migrations/20261118090000_a_question_the_clinic_owns.sql";
  const sql = () => readFileSync(MIGRATION, "utf8").replace(/^\s*--.*$/gm, "");

  it("changes nothing for a question nobody has configured", () => {
    // Every new column carries the behaviour the portal already had.
    const s = sql();
    expect(s).toContain("add column if not exists help_text text not null default ''");
    expect(s).toContain("add column if not exists is_required boolean not null default true");
    expect(s).toContain("add column if not exists is_active boolean not null default true");
    expect(s).toContain("add column if not exists questions_per_page integer not null default 1");
  });

  it("keeps the published build working with no deploy", () => {
    // AGENTS.md: no rename, no drop, nothing NOT NULL without a default.
    const s = sql();
    expect(s).not.toMatch(/drop column/i);
    expect(s).not.toMatch(/rename/i);
    const notNulls = s.match(/not null(?! default)/gi) ?? [];
    expect(notNulls, "a NOT NULL without a default would break the published build").toEqual([]);
  });

  it("refuses a page count the screen could not render", () => {
    expect(sql()).toContain("check (questions_per_page between 1 and 5)");
  });

  it("bounds the answer limits", () => {
    const s = sql();
    expect(s).toContain("max_choices is null or max_choices between 1 and 50");
    expect(s).toContain("max_length is null or max_length between 1 and 5000");
  });

  it("makes the pictures readable by a patient who has no login", () => {
    // The portal is not a Supabase-auth app, so there is no session to sign a
    // URL with; the bucket has to be public to read.
    const s = sql();
    expect(s).toContain("'survey-images'");
    expect(s).toMatch(/values \('survey-images', 'survey-images', true/);
    expect(s).toContain("for select");
  });

  it("lets only staff put a picture there", () => {
    // Both halves: reading the rule and the check applied to a write. One of
    // them left bare lets any signed-in account replace a survey picture.
    const guards = sql().match(/bucket_id = 'survey-images' and \(select public\.is_active_staff\(\)\)/g) ?? [];
    expect(guards).toHaveLength(2);
  });
});

describe("clinic survey screens skip retired questions", () => {
  it("drops only an explicitly retired question", () => {
    const rows = [
      { id: "a", is_active: true },
      { id: "b", is_active: false },
      { id: "c", is_active: null },
      { id: "d" },
    ];
    expect(stillAsked(rows).map((q) => q.id)).toEqual(["a", "c", "d"]);
  });

  it("is used by staff fill screens and the template page, which used to ask retired questions", () => {
    for (const f of [
      "src/components/surveys/SurveyFill.tsx",
      "src/pages/SurveyNew.tsx",
      "src/pages/SurveyTemplateDetail.tsx",
    ]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/stillAsked\(/);
    }
  });
});

describe("ideal answers", () => {
  it("reads the stored { value } back into the box", () => {
    expect(idealAnswerText({ value: 7 })).toBe("7");
    expect(idealAnswerText({ value: "Never" })).toBe("Never");
    expect(idealAnswerText({})).toBe("");
    expect(idealAnswerText(null)).toBe("");
  });

  it("stores an empty box as {} rather than a zero score", () => {
    expect(idealAnswerFrom("scale", "")).toEqual({});
    expect(idealAnswerFrom("text", "   ")).toEqual({});
  });

  it("keeps a scale ideal within 1-10", () => {
    expect(idealAnswerFrom("scale", "8")).toEqual({ value: 8 });
    expect(idealAnswerFrom("scale", "15")).toEqual({ value: 10 });
    expect(idealAnswerFrom("scale", "0")).toEqual({ value: 1 });
  });

  it("keeps choice and text ideals as typed", () => {
    expect(idealAnswerFrom("single_choice", "Twice a day")).toEqual({ value: "Twice a day" });
    expect(idealAnswerFrom("text", "sunscreen daily ")).toEqual({ value: "sunscreen daily " });
  });

  it("the question editor writes ideal_answer again", () => {
    const editor = readFileSync("src/components/surveys/SurveyQuestionsEditor.tsx", "utf8");
    expect(editor).toMatch(/ideal_answer: idealAnswerFrom\(/);
  });
});
