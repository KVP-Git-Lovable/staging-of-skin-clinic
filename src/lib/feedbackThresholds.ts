/**
 * How low a score has to be before somebody owns it.
 *
 * A root-cause case is opened by a DATABASE TRIGGER, not by a screen - a
 * patient editing their own score down from the portal has to open one too, and
 * no client code runs on that path. So the rule that matters lives in
 * supabase/migrations/20261117060000_how_low_is_low_enough.sql, reading one
 * settings row; this module is how the app reads the same row and can explain a
 * case the database opened.
 *
 * It used to be two hardcoded numbers in four places - the SQL gate, a second
 * copy inside the trigger that labelled the case, a TypeScript mirror, and a
 * test pinning the literals. Four copies of one decision is three too many, and
 * nobody could change it without a migration. Now the numbers are a row and
 * this file only knows the DEFAULTS, which the drift test pins against the
 * migration's own column defaults.
 *
 * Both scores, not just NPS: the live data contradicts itself. One patient gave
 * NPS 8 with a service rating of 1, another NPS 1 with a rating of 5. Either
 * rule on its own misses one of them, which is why it is OR.
 */

export interface FeedbackThresholds {
  /** A 0-10 "would you recommend us" at or below this opens a case. */
  npsAtOrBelow: number;
  /** A 1-5 service rating at or below this opens a case. */
  ratingAtOrBelow: number;
}

/**
 * What the migration seeds, and therefore what the clinic had before any of
 * this was configurable. Changing a number here changes nothing in the database
 * - it is here so the test can prove the two agree, and so a missing settings
 * row degrades to the behaviour everybody is used to.
 */
export const DEFAULT_FEEDBACK_THRESHOLDS: FeedbackThresholds = {
  npsAtOrBelow: 6,
  ratingAtOrBelow: 3,
};

export const NPS_MIN = 0;
export const NPS_MAX = 10;
export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** A score missing on a row counts as a good one, exactly as the SQL coalesces. */
const NPS_WHEN_MISSING = 10;
const RATING_WHEN_MISSING = 5;

type FeedbackRow = { nps_score?: number | null; service_rating?: number | null } | null | undefined;

/**
 * A real whole number, or nothing.
 *
 * `typeof value === "number"` deliberately, not `Number(value)`: the same
 * strictness portalModuleEnabled applies to its booleans. A string that happens
 * to parse means the row is not the shape anybody thinks it is, and guessing at
 * it is how a settings value nobody set ends up deciding which patients get
 * chased.
 */
const whole = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) ? value : null;

/**
 * The settings row as something safe to decide with.
 *
 * Tolerant in the house style (portalModuleEnabled, patientFacts): a missing
 * row, a null, a string or a number outside its own range falls back to that
 * field's default - never to "nothing needs a case" and never to "everything
 * does". A settings screen that silently widened the net to every visit would
 * bury the clinic; one that silently closed it would lose unhappy patients.
 */
export function thresholdsFrom(row: unknown): FeedbackThresholds {
  const raw = (row && typeof row === "object" && !Array.isArray(row) ? row : {}) as Record<string, unknown>;
  const nps = whole(raw.nps_at_or_below);
  const rating = whole(raw.rating_at_or_below);
  return {
    npsAtOrBelow: nps !== null && nps >= NPS_MIN && nps <= NPS_MAX ? nps : DEFAULT_FEEDBACK_THRESHOLDS.npsAtOrBelow,
    ratingAtOrBelow: rating !== null && rating >= RATING_MIN && rating <= RATING_MAX ? rating : DEFAULT_FEEDBACK_THRESHOLDS.ratingAtOrBelow,
  };
}

/** Does this feedback need somebody to find out what went wrong? */
export function needsRootCause(row: FeedbackRow, thresholds: FeedbackThresholds): boolean {
  if (!row) return false;
  const nps = Number(row.nps_score ?? NPS_WHEN_MISSING);
  const rating = Number(row.service_rating ?? RATING_WHEN_MISSING);
  return nps <= thresholds.npsAtOrBelow || rating <= thresholds.ratingAtOrBelow;
}

/**
 * Which score opened it - the same three labels the database writes into
 * feedback_rca.opened_reason, derived the same way, so a screen can explain a
 * case without reading the row that created it.
 */
export function openedReason(
  row: FeedbackRow,
  thresholds: FeedbackThresholds,
): "nps" | "service_rating" | "both" | null {
  if (!needsRootCause(row, thresholds)) return null;
  const lowNps = Number(row?.nps_score ?? NPS_WHEN_MISSING) <= thresholds.npsAtOrBelow;
  const lowRating = Number(row?.service_rating ?? RATING_WHEN_MISSING) <= thresholds.ratingAtOrBelow;
  if (lowNps && lowRating) return "both";
  return lowNps ? "nps" : "service_rating";
}

/** What an admin may type. Returns the complaint, or null when it is fine. */
export function validateThresholds(thresholds: FeedbackThresholds): string | null {
  if (!Number.isInteger(thresholds.npsAtOrBelow) || thresholds.npsAtOrBelow < NPS_MIN || thresholds.npsAtOrBelow > NPS_MAX) {
    return `The recommend score must be a whole number from ${NPS_MIN} to ${NPS_MAX}.`;
  }
  if (!Number.isInteger(thresholds.ratingAtOrBelow) || thresholds.ratingAtOrBelow < RATING_MIN || thresholds.ratingAtOrBelow > RATING_MAX) {
    return `The service rating must be a whole number from ${RATING_MIN} to ${RATING_MAX}.`;
  }
  return null;
}

/**
 * The rule in force, in one line.
 *
 * Shown on the settings screen and at the top of the worklist: a list of cases
 * that cannot tell you why these and not others is one you have to take on
 * faith.
 */
export function thresholdSentence(thresholds: FeedbackThresholds): string {
  return `A case opens when the recommend score is ${thresholds.npsAtOrBelow} or less, or the service rating is ${thresholds.ratingAtOrBelow} star${thresholds.ratingAtOrBelow === 1 ? "" : "s"} or less.`;
}
