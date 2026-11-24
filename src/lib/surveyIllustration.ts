/**
 * Which picture a survey question gets.
 *
 * The clinic wanted the questionnaire to feel less like a form, so each
 * question carries a picture chosen from what it asks about.
 *
 * The shape follows `getSampleImage` in src/pages/shop/ShopHome.tsx, with one
 * deliberate difference: there is NO fallback that depends on the question's
 * position. The shop cycles through its images by index; doing that here
 * would change a question's picture whenever the clinic dragged it to a new
 * place in the builder. A question's picture is a function of what it asks
 * and nothing else.
 *
 * ── Order is the specification ──
 *
 * The rules are tested top to bottom and the first match wins, so the order
 * carries more meaning than the keywords do. It was settled by running the
 * list against all 58 live questions, and that caught several that went to
 * the wrong picture:
 *
 *   - "How much does your acne bother you on a scale of 1 to 10, WHERE 1 is
 *     not at all..." matched the body-location rule, because the scale's own
 *     wording contains "where". Severity is tested first now.
 *   - The "Is there anything else..." question that ends every template
 *     matched family, hair and treatment in three different surveys, because
 *     each one names its own topic. The catch-all is tested first.
 *   - "Do you have any HEALTH conditions that might affect TREATMENT?" landed
 *     on treatments-tried, colliding with another question in the same
 *     survey. `health` is tested before it.
 *   - "What does your daily skincare ROUTINE LOOK LIKE?" landed on the
 *     appearance rule. `products` is tested before it.
 *   - "Have you TRIED any treatments or PRODUCTS..." landed on products, so
 *     a `have you tried` rule sits above it.
 *
 * ── Why there are 37 of them ──
 *
 * There were 19, and that was too few: 19 pictures over 58 questions meant
 * one picture appeared on 5 of the 8 questions in the Aesthetic skin survey,
 * and eight such repeats across the six templates. Splitting the broad keys
 * into specific ones - treatments tried, daily products and prescribed
 * medication are three different questions, not one - brings that to zero.
 * surveyIllustration.test.ts fails if any template ever repeats a picture.
 */

export type SurveyIllustrationKey =
  // the clinical spine, shared across templates
  | "severity"
  | "calendar"
  | "frequency"
  | "bodyMap"
  | "appearance"
  | "trigger"
  // what the patient has used or been given
  | "treatmentsTried"
  | "treatmentOptions"
  | "products"
  | "medication"
  | "pastTreatment"
  // the aesthetic consultation
  | "motivation"
  | "skinConcerns"
  | "goals"
  | "outcome"
  | "speed"
  | "worry"
  | "downtime"
  // hair
  | "hairWash"
  | "hairBrush"
  | "hairPattern"
  | "scalpCare"
  // life and history
  | "family"
  | "pregnancy"
  | "health"
  | "sleep"
  | "sun"
  | "stress"
  | "smoking"
  | "work"
  | "workplace"
  | "hobbies"
  | "activity"
  | "dailyLife"
  | "chat"
  // question-type fallbacks, for anything the clinic writes later
  | "checklist"
  | "choice";

export interface IllustrationRule {
  key: SurveyIllustrationKey;
  keywords: readonly string[];
}

/** First match wins. Changing the order changes which picture a question gets. */
export const ILLUSTRATION_RULES: readonly IllustrationRule[] = [
  // Always first: the free-text question that closes every template names its
  // own topic and would otherwise match that topic's rule.
  { key: "chat", keywords: ["is there anything else", "anything else you", "tell us about"] },
  { key: "dailyLife", keywords: ["affect your daily life"] },
  // Before treatments: "health conditions that might affect TREATMENT".
  { key: "health", keywords: ["health condition"] },

  // Hair, most specific first.
  { key: "hairWash", keywords: ["how often do you wash"] },
  { key: "hairBrush", keywords: ["brush, wash, or style"] },
  { key: "scalpCare", keywords: ["dandruff", "itchy scalp"] },
  { key: "hairPattern", keywords: ["specific areas, or all over"] },

  // Life and history.
  { key: "pregnancy", keywords: ["pregnan", "breastfeed", "given birth"] },
  { key: "medication", keywords: ["hormonal medication", "birth control"] },
  { key: "smoking", keywords: ["smoke", "smoking", "tobacco"] },
  { key: "sleep", keywords: ["sleep", "bedtime"] },
  { key: "stress", keywords: ["stress level", "everyday stress"] },
  { key: "family", keywords: ["close family", "family members", "parents, siblings"] },
  { key: "work", keywords: ["occupation", "day-to-day job"] },
  { key: "workplace", keywords: ["working day"] },
  { key: "hobbies", keywords: ["activities you spend", "doing outside of work"] },
  { key: "activity", keywords: ["activity level"] },
  { key: "trigger", keywords: ["trigger", "flare up when", "make it worse", "makes it worse"] },

  // The aesthetic consultation.
  { key: "motivation", keywords: ["what made you think"] },
  { key: "skinConcerns", keywords: ["concerns do you want to improve"] },
  { key: "pastTreatment", keywords: ["treatments before"] },
  { key: "treatmentOptions", keywords: ["most interested in", "curious about"] },
  { key: "speed", keywords: ["quick results"] },
  { key: "worry", keywords: ["biggest concern"] },
  { key: "downtime", keywords: ["downtime", "recovery period"] },
  { key: "outcome", keywords: ["successful outcome"] },
  { key: "goals", keywords: ["hope to achieve", "main goals", "want to achieve"] },

  // The clinical spine. Severity before body: the scale's wording contains
  // the word "where".
  { key: "severity", keywords: ["bother", "scale of 1 to 10", "scale from 1 to 10", "how severe"] },
  { key: "calendar", keywords: ["when did you first", "how long have you", "first notice"] },
  { key: "bodyMap", keywords: ["where on", "areas of your body", "what areas", "which areas"] },
  { key: "frequency", keywords: ["how often", "flare-ups", "how many hours"] },
  { key: "sun", keywords: ["in the sun", "time outside", "being in the sun", "sunscreen"] },
  // Before products: "Have you TRIED any treatments or PRODUCTS".
  { key: "treatmentsTried", keywords: ["have you tried", "treatments have you tried"] },
  // Before appearance: "what does your skincare ROUTINE LOOK LIKE".
  { key: "products", keywords: ["skincare routine", "products"] },
  { key: "appearance", keywords: ["look like", "describe", "changed in size", "appearance"] },
  { key: "treatmentsTried", keywords: ["treatment", "tried", "medicat", "prescrib"] },
];

/** Lower case, punctuation flattened, so keywords match on words not symbols. */
export function normalizeQuestionText(text: string | null | undefined): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Keywords are written with real punctuation; flatten them the same way. */
function normalizeKeyword(keyword: string): string {
  return keyword.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** When nothing in the question's wording matches, go by what it asks for. */
function fallbackForType(questionType: string | null | undefined): SurveyIllustrationKey {
  switch (String(questionType ?? "").trim()) {
    case "text":
      return "chat";
    case "multi_choice":
      return "checklist";
    case "scale":
      return "severity";
    case "single_choice":
      return "choice";
    default:
      // An unrecognised type renders as a textarea, so it reads as a written
      // answer.
      return "chat";
  }
}

export function illustrationFor(
  questionText: string | null | undefined,
  questionType: string | null | undefined,
): SurveyIllustrationKey {
  const text = normalizeQuestionText(questionText);
  if (text) {
    for (const rule of ILLUSTRATION_RULES) {
      for (const keyword of rule.keywords) {
        if (text.includes(normalizeKeyword(keyword))) return rule.key;
      }
    }
  }
  return fallbackForType(questionType);
}

/** Every key the component must be able to draw, and every picture must exist for. */
export const SURVEY_ILLUSTRATION_KEYS: readonly SurveyIllustrationKey[] = [
  "severity",
  "calendar",
  "frequency",
  "bodyMap",
  "appearance",
  "trigger",
  "treatmentsTried",
  "treatmentOptions",
  "products",
  "medication",
  "pastTreatment",
  "motivation",
  "skinConcerns",
  "goals",
  "outcome",
  "speed",
  "worry",
  "downtime",
  "hairWash",
  "hairBrush",
  "hairPattern",
  "scalpCare",
  "family",
  "pregnancy",
  "health",
  "sleep",
  "sun",
  "stress",
  "smoking",
  "work",
  "workplace",
  "hobbies",
  "activity",
  "dailyLife",
  "chat",
  "checklist",
  "choice",
];
