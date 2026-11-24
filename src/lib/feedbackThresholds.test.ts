import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEEDBACK_THRESHOLDS, needsRootCause, openedReason, thresholdSentence,
  thresholdsFrom, validateThresholds, type FeedbackThresholds,
} from "./feedbackThresholds";

/**
 * The rule that decides which patients get chased after a bad visit.
 *
 * Two things matter here. The arithmetic has to match the database exactly,
 * because the case is opened by a trigger and this module only explains it. And
 * the resolver has to be unshakeable: it reads a settings row an admin edits, so
 * a junk value must land on the clinic's own defaults rather than on "chase
 * nobody" or "chase everybody" - one loses unhappy patients, the other buries
 * the clinic in cases.
 */

const at = (npsAtOrBelow: number, ratingAtOrBelow: number): FeedbackThresholds =>
  ({ npsAtOrBelow, ratingAtOrBelow });

describe("who needs a case", () => {
  const dflt = DEFAULT_FEEDBACK_THRESHOLDS;

  it("opens at the number, not just below it", () => {
    // "6 or less" has to include 6, or the screen and the database disagree
    // about the one score the admin actually typed.
    expect(needsRootCause({ nps_score: 6, service_rating: 5 }, dflt)).toBe(true);
    expect(needsRootCause({ nps_score: 7, service_rating: 5 }, dflt)).toBe(false);
    expect(needsRootCause({ nps_score: 10, service_rating: 3 }, dflt)).toBe(true);
    expect(needsRootCause({ nps_score: 10, service_rating: 4 }, dflt)).toBe(false);
  });

  it("is OR, because the live data contradicts itself", () => {
    // Both are real rows: happy to recommend but rated the service 1, and
    // rated the service 5 but would not recommend. Either rule alone misses one.
    expect(needsRootCause({ nps_score: 8, service_rating: 1 }, dflt)).toBe(true);
    expect(needsRootCause({ nps_score: 1, service_rating: 5 }, dflt)).toBe(true);
  });

  it("follows the numbers it is given, not the defaults", () => {
    const loose = at(8, 4);
    expect(needsRootCause({ nps_score: 8, service_rating: 5 }, loose)).toBe(true);
    expect(needsRootCause({ nps_score: 8, service_rating: 5 }, dflt)).toBe(false);
    const strict = at(2, 1);
    expect(needsRootCause({ nps_score: 5, service_rating: 3 }, strict)).toBe(false);
    expect(needsRootCause({ nps_score: 5, service_rating: 3 }, dflt)).toBe(true);
  });

  it("treats a missing score as nothing to chase, never as a zero", () => {
    expect(needsRootCause({ nps_score: null, service_rating: null }, dflt)).toBe(false);
    expect(needsRootCause({}, dflt)).toBe(false);
    expect(needsRootCause(null, dflt)).toBe(false);
    expect(needsRootCause(undefined, dflt)).toBe(false);
    // But one missing score must not hide a bad one.
    expect(needsRootCause({ nps_score: null, service_rating: 2 }, dflt)).toBe(true);
  });
});

describe("why it opened", () => {
  const dflt = DEFAULT_FEEDBACK_THRESHOLDS;

  it("names the score that was low", () => {
    expect(openedReason({ nps_score: 3, service_rating: 5 }, dflt)).toBe("nps");
    expect(openedReason({ nps_score: 10, service_rating: 2 }, dflt)).toBe("service_rating");
    expect(openedReason({ nps_score: 3, service_rating: 2 }, dflt)).toBe("both");
  });

  it("says nothing at all when no case is due", () => {
    expect(openedReason({ nps_score: 10, service_rating: 5 }, dflt)).toBeNull();
    expect(openedReason(null, dflt)).toBeNull();
  });

  it("uses only the three labels the database stores", () => {
    const rows = [
      { nps_score: 0, service_rating: 5 }, { nps_score: 10, service_rating: 1 },
      { nps_score: 0, service_rating: 1 }, { nps_score: 9, service_rating: 5 },
    ];
    for (const row of rows) {
      expect([null, "nps", "service_rating", "both"]).toContain(openedReason(row, dflt));
    }
  });
});

describe("reading the settings row", () => {
  it("takes the numbers when they are usable", () => {
    expect(thresholdsFrom({ nps_at_or_below: 8, rating_at_or_below: 4 })).toEqual(at(8, 4));
    // The bottom of each range is a real setting, not an absence.
    expect(thresholdsFrom({ nps_at_or_below: 0, rating_at_or_below: 1 })).toEqual(at(0, 1));
  });

  it("falls back to the clinic's own numbers, never to all or nothing", () => {
    for (const row of [null, undefined, {}, "nope", [], 7]) {
      expect(thresholdsFrom(row)).toEqual(DEFAULT_FEEDBACK_THRESHOLDS);
    }
  });

  it("refuses junk and out-of-range values field by field", () => {
    // One bad field must not throw away the other good one.
    expect(thresholdsFrom({ nps_at_or_below: "8", rating_at_or_below: 4 }).npsAtOrBelow)
      .toBe(DEFAULT_FEEDBACK_THRESHOLDS.npsAtOrBelow);
    expect(thresholdsFrom({ nps_at_or_below: "8", rating_at_or_below: 4 }).ratingAtOrBelow).toBe(4);
    expect(thresholdsFrom({ nps_at_or_below: 11 })).toEqual(DEFAULT_FEEDBACK_THRESHOLDS);
    expect(thresholdsFrom({ nps_at_or_below: -1 })).toEqual(DEFAULT_FEEDBACK_THRESHOLDS);
    expect(thresholdsFrom({ rating_at_or_below: 0 })).toEqual(DEFAULT_FEEDBACK_THRESHOLDS);
    expect(thresholdsFrom({ rating_at_or_below: 6 })).toEqual(DEFAULT_FEEDBACK_THRESHOLDS);
    expect(thresholdsFrom({ nps_at_or_below: 6.5 })).toEqual(DEFAULT_FEEDBACK_THRESHOLDS);
    expect(thresholdsFrom({ nps_at_or_below: null })).toEqual(DEFAULT_FEEDBACK_THRESHOLDS);
  });
});

describe("what an admin may type", () => {
  it("accepts the whole of each range", () => {
    for (const nps of [0, 5, 10]) expect(validateThresholds(at(nps, 3))).toBeNull();
    for (const rating of [1, 3, 5]) expect(validateThresholds(at(6, rating))).toBeNull();
  });

  it("names the field that is wrong", () => {
    expect(validateThresholds(at(11, 3))).toMatch(/recommend score/i);
    expect(validateThresholds(at(-1, 3))).toMatch(/recommend score/i);
    expect(validateThresholds(at(6, 0))).toMatch(/service rating/i);
    expect(validateThresholds(at(6, 6))).toMatch(/service rating/i);
    expect(validateThresholds(at(6.5, 3))).toMatch(/whole number/i);
  });
});

describe("the rule, said out loud", () => {
  it("names both numbers", () => {
    const line = thresholdSentence(at(8, 4));
    expect(line).toContain("8");
    expect(line).toContain("4");
  });

  it("says star, not stars, for one", () => {
    expect(thresholdSentence(at(6, 1))).toContain("1 star or less");
    expect(thresholdSentence(at(6, 2))).toContain("2 stars or less");
  });
});
