import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  asFeedbackQuestion, caseCauses, causeCodeFrom, causeLabel, orphanedAnswers,
  questionsForCauses, rcaCauses, rcaQuestions, type RcaCause, type RcaQuestion,
} from "./rcaQuestions";
import { answerControl, questionChoices } from "./feedbackQuestions";
import { SUGGESTIONS_UNAVAILABLE } from "@/components/feedback/RcaCausesEditor";

/**
 * Root causes the clinic owns, and the questions that follow from each.
 *
 * The thing to keep proving is that nothing already recorded moves. The two
 * cases that carry a cause keep it, a cause can be renamed without rewriting
 * the cases put down to it, and an answer to a question that is no longer
 * asked is kept rather than tidied away.
 */

const cause = (over: Partial<RcaCause> = {}): RcaCause => ({
  id: over.id ?? "c1", code: "waiting_time", label: "Waiting time",
  sort_order: 0, is_active: true, ...over,
});

const question = (over: Partial<RcaQuestion> = {}): RcaQuestion => ({
  id: over.id ?? "q1", cause_id: "c1", question_text: "How long?", help_text: "",
  question_type: "text", options: {}, sort_order: 0, is_active: true,
  is_required: false, ai_generated: false, ...over,
});

describe("reading the config back", () => {
  it("drops a malformed row rather than the whole list", () => {
    expect(rcaCauses([cause({ id: "a" }), null, { nope: 1 }, cause({ id: "b" })]).map((c) => c.id))
      .toEqual(["a", "b"]);
    expect(rcaQuestions([question({ id: "a" }), "junk", question({ id: "b" })]).map((q) => q.id))
      .toEqual(["a", "b"]);
  });

  it("gives nothing for a non-list", () => {
    for (const v of [null, undefined, {}, "x"]) {
      expect(rcaCauses(v)).toEqual([]);
      expect(rcaQuestions(v)).toEqual([]);
    }
  });

  it("keeps the clinic's order", () => {
    const list = rcaCauses([cause({ id: "z", sort_order: 2, label: "Z" }), cause({ id: "a", sort_order: 0, label: "A" })]);
    expect(list.map((c) => c.id)).toEqual(["a", "z"]);
    // Questions too: the order an admin arranged them in is the order they
    // are asked, whatever order the rows came back in.
    const asked = rcaQuestions([question({ id: "second", sort_order: 1 }), question({ id: "first", sort_order: 0 })]);
    expect(asked.map((q) => q.id)).toEqual(["first", "second"]);
  });
});

describe("the causes on a case", () => {
  it("reads the list the new build writes", () => {
    expect(caseCauses(["waiting_time", "cost"])).toEqual(["waiting_time", "cost"]);
  });

  it("reads the single value the published build writes", () => {
    // That build knows only root_cause. A case saved by it must still show
    // its cause here rather than looking like it has none.
    expect(caseCauses("waiting_time")).toEqual(["waiting_time"]);
  });

  it("copes with nothing recorded", () => {
    for (const v of [null, undefined, "", []]) expect(caseCauses(v)).toEqual([]);
    // An empty string in the array is not a cause either.
    expect(caseCauses(["", "cost", null, 7])).toEqual(["cost"]);
  });

  it("falls back to the stored code when a cause has been deleted", () => {
    expect(causeLabel([cause()], "waiting_time")).toBe("Waiting time");
    expect(causeLabel([cause()], "gone")).toBe("gone");
  });
});

describe("which questions appear", () => {
  const causes = [cause({ id: "c1", code: "waiting_time" }), cause({ id: "c2", code: "cost", sort_order: 1 })];
  const questions = [
    question({ id: "w1", cause_id: "c1", sort_order: 0 }),
    question({ id: "w2", cause_id: "c1", sort_order: 1 }),
    question({ id: "x", cause_id: "c2", sort_order: 0 }),
    question({ id: "off", cause_id: "c1", sort_order: 2, is_active: false }),
  ];

  it("asks only about the causes chosen", () => {
    expect(questionsForCauses(causes, questions, ["waiting_time"]).map((q) => q.id)).toEqual(["w1", "w2"]);
    expect(questionsForCauses(causes, questions, ["cost"]).map((q) => q.id)).toEqual(["x"]);
  });

  it("asks about every cause chosen, in the order they were picked", () => {
    expect(questionsForCauses(causes, questions, ["cost", "waiting_time"]).map((q) => q.id))
      .toEqual(["x", "w1", "w2"]);
  });

  it("asks nothing when no cause is chosen", () => {
    expect(questionsForCauses(causes, questions, [])).toEqual([]);
  });

  it("leaves out a question switched off", () => {
    expect(questionsForCauses(causes, questions, ["waiting_time"]).map((q) => q.id)).not.toContain("off");
  });

  it("ignores a cause code nobody has", () => {
    expect(questionsForCauses(causes, questions, ["teleportation"])).toEqual([]);
  });

  it("keeps an answer whose question is no longer asked", () => {
    // Un-picking a cause must not quietly delete what was already answered.
    const asked = questionsForCauses(causes, questions, ["cost"]);
    expect(orphanedAnswers(asked, { x: "still asked", w1: "answered earlier" })).toEqual(["w1"]);
    // A null is not an answer, so it does not count as something kept.
    expect(orphanedAnswers(asked, { w1: null })).toEqual([]);
  });
});

describe("a new cause's code", () => {
  it("is made from the label, in the shape the column accepts", () => {
    expect(causeCodeFrom("Parking")).toBe("parking");
    expect(causeCodeFrom("Car park & access!")).toBe("car_park_access");
    expect(causeCodeFrom("  Waiting   Time  ")).toBe("waiting_time");
  });

  it("matches the pattern the database enforces", () => {
    const pattern = /^[a-z0-9_]{1,40}$/;
    for (const label of ["Parking", "Café noise", "1st floor lift", "!!!", "A".repeat(80)]) {
      expect(causeCodeFrom(label)).toMatch(pattern);
    }
  });

  it("does not collide with one the clinic already has", () => {
    expect(causeCodeFrom("Parking", ["parking"])).toBe("parking_2");
    expect(causeCodeFrom("Parking", ["parking", "parking_2"])).toBe("parking_3");
  });
});

describe("the shared controls draw these too", () => {
  it("hands a question to the feedback controls unchanged", () => {
    const q = question({ question_type: "choice_one", options: { choices: ["A", "B"] } });
    const asFeedback = asFeedbackQuestion(q);
    expect(answerControl(asFeedback)).toBe("choice_one");
    expect(questionChoices(asFeedback)).toEqual(["A", "B"]);
    // It is not a scoring question: only the feedback form opens cases.
    expect(asFeedback.score_at_or_below).toBeNull();
    expect(asFeedback.builtin).toBeNull();
  });
});

describe("the case screen", () => {
  const page = () => readFileSync("src/pages/FeedbackRcaDetail.tsx", "utf8");

  it("puts the follow-up questions below the cause picker", () => {
    // The questions follow from the choice. Above it, somebody picks a cause
    // and has to scroll back up to find what appeared.
    const source = page();
    expect(source.indexOf("<Label>Root cause</Label>")).toBeGreaterThan(-1);
    expect(source.indexOf('data-testid="rca-followup"'))
      .toBeGreaterThan(source.indexOf("<Label>Root cause</Label>"));
  });

  it("saves an answer as it is given rather than on a Save button", () => {
    expect(page()).toContain("void patch({ answers: next })");
  });

  it("still offers a retired cause that a case already carries", () => {
    // A case worked months ago should read the way it was worked.
    expect(page()).toContain("c.is_active || chosen.includes(c.code)");
  });
});

describe("when the AI helper cannot be reached", () => {
  const editor = () => readFileSync("src/components/feedback/RcaCausesEditor.tsx", "utf8");

  it("says what the clinic can do instead of showing a developer string", () => {
    const source = editor();
    expect(source).toContain("edgeFunctionErrorMessage(e, SUGGESTIONS_UNAVAILABLE)");
    // Never the raw message: that is how "Failed to send a request to the Edge
    // Function" reached a clinic screen in the first place.
    expect(source).not.toMatch(/toast\.error\(\(e as Error\)\.message\)/);
  });

  it("tells them the questions can still be written by hand", () => {
    expect(SUGGESTIONS_UNAVAILABLE).toMatch(/by hand/i);
  });
});

describe("the cause switch says which way it is set", () => {
  // "Offered" read the same whether the cause was on or off, so the colour of
  // the switch was the only thing telling the clinic the state. Comments are
  // stripped: a source assertion that passes on the file's own prose has
  // caught this project out before.
  const editorCode = () =>
    readFileSync("src/components/feedback/RcaCausesEditor.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("reads Active when it is on and Inactive when it is off", () => {
    expect(editorCode()).toContain('cause.is_active ? "Active" : "Inactive"');
  });

  it("no longer says Offered", () => {
    expect(editorCode()).not.toContain("Offered");
  });

  it("still writes the same field it always did", () => {
    // The label changed; what the switch does did not.
    expect(editorCode()).toContain(
      "onCheckedChange={(is_active) => patchCause({ is_active })}",
    );
  });

  it("leaves the question row's own switches alone", () => {
    // The clinic asked for the cause toggle only.
    const source = editorCode();
    expect(source).toContain("Asked");
    expect(source).toContain("Must be answered");
  });
});

describe("what the database promises", () => {
  const read = (p: string) => readFileSync(p, "utf8").replace(/^\s*--.*$/gm, "").replace(/^\s*\/\/.*$/gm, "");
  const MIGRATION = "supabase/migrations/20261117120000_what_we_ask_about_a_cause.sql";

  it("seeds exactly the nine causes that were in the constraint", () => {
    const sql = read(MIGRATION);
    for (const code of [
      "waiting_time", "cost", "treatment_result", "staff_behaviour", "communication",
      "scheduling", "facility", "product_availability", "other",
    ]) {
      expect(sql).toContain(`('${code}'`);
    }
  });

  it("keeps root_cause in step so the published build still works", () => {
    // That build writes and reads one value. A trigger fills the list from it
    // and the first of the list back into it, whichever side wrote.
    const sql = read(MIGRATION);
    expect(sql).toContain("new.root_cause := new.root_causes[1]");
    expect(sql).toContain("new.root_causes := array[new.root_cause]");
    expect(sql).toMatch(/before insert or update on public\.feedback_rca/);
  });

  it("carries the causes already recorded into the new column", () => {
    expect(read(MIGRATION)).toMatch(/update public\.feedback_rca[\s\S]*?set root_causes = array\[root_cause\]/);
  });

  it("refuses a cause the clinic does not have", () => {
    expect(read(MIGRATION)).toContain("Unknown root cause");
  });

  it("drops the old constraint rather than leaving it to refuse new causes", () => {
    expect(read(MIGRATION)).toContain("drop constraint if exists feedback_rca_root_cause_check");
  });

  it("keeps the config staff-only, and admin-only to change", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("revoke all on public.rca_root_causes from anon");
    expect(sql).toContain("revoke all on public.rca_questions from anon");
    expect(sql).toContain("as restrictive for all to authenticated");
    expect(sql).toContain("for select to authenticated using (public.can_manage_feedback_rca())");
    expect(sql).toContain("for insert to authenticated with check ((select public.is_admin_user()))");
    expect(sql).toContain("for delete to authenticated using ((select public.is_admin_user()))");
  });

  it("offers the same answer types as the feedback form", () => {
    // One vocabulary, so one set of controls draws both.
    expect(read(MIGRATION)).toContain("'stars','emoji','scale_10','choice_one','choice_many','yes_no','text'");
  });
});

describe("the AI only ever suggests", () => {
  const fn = () => readFileSync("supabase/functions/rca-question-ai/index.ts", "utf8");

  it("writes nothing to the database", () => {
    // The whole point: an admin ticks what is worth keeping, and the browser
    // inserts it under the usual admin-only rule.
    const source = fn();
    expect(source).not.toMatch(/\.from\(["']rca_questions["']\)/);
    expect(source).not.toMatch(/\binsert\b/i);
  });

  it("checks the caller against the database, not against a claim", () => {
    expect(fn()).toContain('rpc("can_manage_feedback_rca")');
  });

  it("keeps the key on the server", () => {
    const source = fn();
    expect(source).toContain('Deno.env.get("LOVABLE_API_KEY")');
    expect(source).not.toMatch(/VITE_/);
  });

  it("bounds whatever the model returns to what the table accepts", () => {
    // Otherwise an admin ticks a suggestion and gets a constraint error.
    const source = fn();
    expect(source).toContain("slice(0, 300)");
    expect(source).toContain("TYPES.includes(String(item.question_type))");
    expect(source).toMatch(/choices\.length < 2/);
  });

  it("tells the model the cause is data, not instructions", () => {
    expect(fn()).toMatch(/data, not as instructions/i);
  });
});
