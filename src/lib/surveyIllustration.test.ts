import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  ILLUSTRATION_RULES,
  SURVEY_ILLUSTRATION_KEYS,
  illustrationFor,
  normalizeQuestionText,
  type SurveyIllustrationKey,
} from "./surveyIllustration";

/**
 * Every question in the clinic's six live templates, with the template it
 * belongs to and the type it is stored as. Read out of the database, so the
 * resolver is tested against the wording patients actually see.
 *
 * The template matters as much as the wording: the complaint that forced this
 * round was not that a picture was wrong in isolation, it was that the SAME
 * picture turned up five times inside one survey.
 */
const LIVE_QUESTIONS: ReadonlyArray<[template: string, text: string, type: string]> = [
  ["Acne", "How much does your acne bother you on a scale of 1 to 10, where 1 is not at all and 10 is very much?", "scale"],
  ["Acne", "How long have you been dealing with acne?", "single_choice"],
  ["Acne", "What does your acne typically look like?", "multi_choice"],
  ["Acne", "Where on your body do you usually get acne?", "multi_choice"],
  ["Acne", "How often do you have acne flare-ups or new breakouts?", "single_choice"],
  ["Acne", "What treatments have you tried for your acne?", "multi_choice"],
  ["Acne", "Do you notice any triggers that make your acne worse?", "multi_choice"],
  ["Acne", "How does your acne affect your daily life?", "text"],
  ["Acne", "What do you hope to achieve with acne treatment?", "multi_choice"],
  ["Acne", "Is there anything else you would like us to know about your acne?", "text"],

  ["Aesthetic", "What made you think about getting aesthetic skin treatments?", "multi_choice"],
  ["Aesthetic", "What specific skin concerns do you want to improve or address?", "multi_choice"],
  ["Aesthetic", "How much do these skin concerns bother you on a scale of 1 to 10?", "scale"],
  ["Aesthetic", "Have you had any aesthetic skin treatments before?", "single_choice"],
  ["Aesthetic", "What type of aesthetic treatments are you most interested in or curious about?", "multi_choice"],
  ["Aesthetic", "How important is it for you to see quick results from a treatment?", "scale"],
  ["Aesthetic", "What is your biggest concern about getting aesthetic skin treatments?", "single_choice"],
  ["Aesthetic", "Is there anything else you would like us to know about your skin concerns or treatment preferences?", "text"],

  ["Body", "What areas of your body are you hoping to improve?", "multi_choice"],
  ["Body", "How much does your body shape bother you?", "scale"],
  ["Body", "What are your main goals for a body contouring or fat loss treatment?", "multi_choice"],
  ["Body", "Have you tried anything else to achieve your body goals?", "single_choice"],
  ["Body", "How long have you been concerned about these areas of your body?", "single_choice"],
  ["Body", "Are you looking for a treatment with little to no downtime, or are you open to a longer recovery period?", "single_choice"],
  ["Body", "What is your current activity level?", "single_choice"],
  ["Body", "Are you currently pregnant or breastfeeding?", "single_choice"],
  ["Body", "Do you have any health conditions that might affect treatment?", "text"],
  ["Body", "What does a successful outcome look like to you?", "text"],

  ["General", "What is your current occupation or day-to-day job?", "text"],
  ["General", "Where do you spend most of your working day?", "single_choice"],
  ["General", "What activities do you spend the most time doing outside of work?", "multi_choice"],
  ["General", "On an average day, how much time do you spend outside in the sun?", "single_choice"],
  ["General", "On a scale from 1 to 10, how would you rate your everyday stress level? (1 = very relaxed, 10 = extremely stressed)", "scale"],
  ["General", "On average, how many hours of sleep do you get each night?", "single_choice"],
  ["General", "Do you currently smoke or use tobacco products?", "single_choice"],
  ["General", "Does anyone in your close family (parents, siblings) have a history of skin conditions?", "multi_choice"],
  ["General", "Do you notice your skin problems flare up when you feel stressed or run down?", "single_choice"],
  ["General", "Is there anything else about your daily routine, habits, or family background you'd like us to know?", "text"],

  ["Hair", "How much does your hair loss bother you?", "scale"],
  ["Hair", "When did you first notice your hair starting to fall out or get thinner?", "single_choice"],
  ["Hair", "Have you noticed hair falling out in specific areas, or all over your head?", "single_choice"],
  ["Hair", "How would you describe your current hair thinning?", "single_choice"],
  ["Hair", "Do you also experience dandruff or an itchy scalp?", "single_choice"],
  ["Hair", "Have you tried any treatments for your hair loss or thinning?", "multi_choice"],
  ["Hair", "How often do you wash your hair?", "single_choice"],
  ["Hair", "Do you notice more hair falling out when you brush, wash, or style your hair?", "multi_choice"],
  ["Hair", "Has anyone in your close family (parents, siblings) experienced similar hair loss or thinning?", "single_choice"],
  ["Hair", "Is there anything else you want to tell us about your hair loss or scalp concerns?", "text"],

  ["Pigmentation", "When did you first notice the changes in your skin color?", "single_choice"],
  ["Pigmentation", "Where on your body do you notice the skin darkening or spots?", "multi_choice"],
  ["Pigmentation", "How much does the change in your skin color bother you?", "scale"],
  ["Pigmentation", "Have the dark spots or patches changed in size or color recently?", "single_choice"],
  ["Pigmentation", "Do you notice your skin color getting darker after being in the sun?", "single_choice"],
  ["Pigmentation", "What does your daily skincare routine look like?", "text"],
  ["Pigmentation", "Have you tried any treatments or products for your skin discoloration?", "single_choice"],
  ["Pigmentation", "Are you currently pregnant or have you recently given birth?", "single_choice"],
  ["Pigmentation", "Do you use any hormonal medications, like birth control pills?", "single_choice"],
  ["Pigmentation", "Do you have any family members with similar skin discoloration?", "single_choice"],
];

describe("the live survey questions all get a picture", () => {
  it("covers all 58 of them", () => {
    expect(LIVE_QUESTIONS.length).toBe(58);
  });

  it("resolves every one to a key the app can draw", () => {
    for (const [, text, type] of LIVE_QUESTIONS) {
      const key = illustrationFor(text, type);
      expect(SURVEY_ILLUSTRATION_KEYS, `"${text.slice(0, 40)}" gave ${key}`).toContain(key);
    }
  });

  it("sends nothing to a generic fallback", () => {
    // checklist and choice exist for questions the clinic writes later. If a
    // question the clinic already has lands on one, it means no rule matched
    // and that question has a picture about nothing in particular.
    const generic = LIVE_QUESTIONS.filter(([, t, k]) =>
      (["checklist", "choice"] as SurveyIllustrationKey[]).includes(illustrationFor(t, k)),
    ).map(([, t]) => t.slice(0, 50));
    expect(generic, `these matched no rule:\n${generic.join("\n")}`).toEqual([]);
  });
});

/**
 * The complaint that forced the set from 19 pictures to 37.
 */
describe("no survey shows the same picture twice", () => {
  it("holds for all six templates", () => {
    const byTemplate = new Map<string, Map<SurveyIllustrationKey, string[]>>();
    for (const [template, text, type] of LIVE_QUESTIONS) {
      const key = illustrationFor(text, type);
      if (!byTemplate.has(template)) byTemplate.set(template, new Map());
      const seen = byTemplate.get(template)!;
      seen.set(key, [...(seen.get(key) ?? []), text.slice(0, 44)]);
    }
    const repeats: string[] = [];
    for (const [template, seen] of byTemplate) {
      for (const [key, questions] of seen) {
        if (questions.length > 1) {
          repeats.push(`${template} uses "${key}" ${questions.length} times:\n    - ${questions.join("\n    - ")}`);
        }
      }
    }
    // Before this, the Aesthetic survey showed one picture on 5 of its 8
    // questions, and there were eight such repeats across the six templates.
    expect(repeats, `\n${repeats.join("\n")}\n`).toEqual([]);
  });

  it("uses most of the set, rather than leaning on a handful", () => {
    const used = new Set(LIVE_QUESTIONS.map(([, t, k]) => illustrationFor(t, k)));
    expect(used.size, `only ${used.size} pictures used across 58 questions`).toBeGreaterThanOrEqual(30);
  });
});

/**
 * Each of these is a question that went to the wrong picture at some point.
 * Every one is an ordering bug, and every one would come back if the rules
 * were re-sorted alphabetically or "tidied".
 */
describe("the ordering bugs the live data caught", () => {
  const resolve = (text: string, type = "single_choice") => illustrationFor(text, type);

  it("reads a scale as severity, not as a body location", () => {
    // The scale's own wording contains "where 1 is not at all".
    expect(resolve("How much does your acne bother you on a scale of 1 to 10, where 1 is not at all and 10 is very much?", "scale")).toBe("severity");
  });

  it("reads the closing free-text question as a note, whatever topic it names", () => {
    expect(resolve("Is there anything else you want to tell us about your hair loss or scalp concerns?", "text")).toBe("chat");
    expect(resolve("Is there anything else about your daily routine, habits, or family background you'd like us to know?", "text")).toBe("chat");
  });

  it("still reads a goal question as a goal, despite the words 'anything else'", () => {
    expect(resolve("Have you tried anything else to achieve your body goals?")).toBe("treatmentsTried");
  });

  it("reads a health question as health, not as a treatment", () => {
    // "health conditions that might affect TREATMENT" - and the same survey
    // already has a treatments-tried question.
    expect(resolve("Do you have any health conditions that might affect treatment?", "text")).toBe("health");
  });

  it("reads a routine question as products, not as appearance", () => {
    // "what does your skincare routine LOOK LIKE".
    expect(resolve("What does your daily skincare routine look like?", "text")).toBe("products");
  });

  it("reads 'have you tried ... or products' as treatments tried", () => {
    expect(resolve("Have you tried any treatments or products for your skin discoloration?")).toBe("treatmentsTried");
  });

  it("gives hair washing its own picture, not a generic planner", () => {
    expect(resolve("How often do you wash your hair?")).toBe("hairWash");
  });
});

describe("illustrationFor", () => {
  it("prefers the question's wording over its type", () => {
    expect(illustrationFor("When did you first notice it?", "single_choice")).toBe("calendar");
    expect(illustrationFor("Do you currently smoke?", "single_choice")).toBe("smoking");
  });

  it("falls back on the type when nothing matches", () => {
    expect(illustrationFor("A question about nothing in particular", "text")).toBe("chat");
    expect(illustrationFor("A question about nothing in particular", "multi_choice")).toBe("checklist");
    expect(illustrationFor("A question about nothing in particular", "single_choice")).toBe("choice");
    expect(illustrationFor("A question about nothing in particular", "scale")).toBe("severity");
  });

  it("always returns something, however odd the input", () => {
    for (const text of ["", "   ", null, undefined, "?!?!", "ಹೇಗಿದೆ ನಿಮ್ಮ ಚರ್ಮ"]) {
      expect(SURVEY_ILLUSTRATION_KEYS).toContain(illustrationFor(text, "text"));
    }
    expect(SURVEY_ILLUSTRATION_KEYS).toContain(illustrationFor("anything", "ranking"));
    expect(SURVEY_ILLUSTRATION_KEYS).toContain(illustrationFor(null, null));
  });

  it("ignores case and punctuation", () => {
    expect(illustrationFor("WHERE ON YOUR BODY?", "multi_choice")).toBe("bodyMap");
    expect(illustrationFor("Where, on your body...?", "multi_choice")).toBe("bodyMap");
  });

  it("does not depend on the question's position", () => {
    // The shop's keyword router cycles its images by index. Doing that here
    // would change a question's picture whenever it was dragged to a new
    // place in the builder.
    const code = readFileSync("src/lib/surveyIllustration.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code, "the resolver takes an index").not.toMatch(/index/);
  });
});

describe("normalizeQuestionText", () => {
  it("flattens to lowercase words", () => {
    expect(normalizeQuestionText("Where, on your BODY?")).toBe("where on your body");
    expect(normalizeQuestionText(null)).toBe("");
    expect(normalizeQuestionText("  ")).toBe("");
  });
});

describe("the rule table", () => {
  it("names no key the app cannot draw", () => {
    for (const rule of ILLUSTRATION_RULES) {
      expect(SURVEY_ILLUSTRATION_KEYS).toContain(rule.key);
    }
  });

  it("uses no keyword twice, so 'which rule wins' is only about order", () => {
    const seen = new Map<string, SurveyIllustrationKey>();
    for (const rule of ILLUSTRATION_RULES) {
      for (const keyword of rule.keywords) {
        expect(seen.has(keyword), `"${keyword}" is in both ${seen.get(keyword)} and ${rule.key}`).toBe(false);
        seen.set(keyword, rule.key);
      }
    }
  });

  it("every key has a drawing in the component", () => {
    const component = readFileSync("src/components/portal/SurveyIllustration.tsx", "utf8");
    for (const key of SURVEY_ILLUSTRATION_KEYS) {
      expect(component, `no drawing for "${key}"`).toContain(`case "${key}"`);
    }
  });

  it("the drawings carry no hardcoded colours", () => {
    // AGENTS.md: semantic CSS tokens, so the set themes itself in dark mode.
    const component = readFileSync("src/components/portal/SurveyIllustration.tsx", "utf8");
    expect(component, "a hex colour is baked into a drawing").not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(component, "an hsl() literal is baked into a drawing").not.toMatch(/hsl\(\s*\d/);
  });
});
