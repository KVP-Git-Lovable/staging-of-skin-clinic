import { describe, it, expect } from "vitest";
import { npsCategory, ratingLabel, npsBreakdown } from "./feedbackScores";

describe("npsCategory", () => {
  it("uses the standard bands", () => {
    expect([0, 3, 6].map(npsCategory)).toEqual(["Detractor", "Detractor", "Detractor"]);
    expect([7, 8].map(npsCategory)).toEqual(["Passive", "Passive"]);
    expect([9, 10].map(npsCategory)).toEqual(["Promoter", "Promoter"]);
  });

  it("has nothing to say about a missing score", () => {
    expect(npsCategory(null)).toBe("");
    expect(npsCategory(undefined)).toBe("");
  });
});

describe("ratingLabel", () => {
  it("matches the wording under the stars", () => {
    expect([1, 2].map(ratingLabel)).toEqual(["Poor", "Poor"]);
    expect(ratingLabel(3)).toBe("Average");
    expect(ratingLabel(4)).toBe("Good");
    expect(ratingLabel(5)).toBe("Excellent");
  });

  it("has nothing to say about a missing rating", () => {
    expect(ratingLabel(null)).toBe("");
  });
});

describe("npsBreakdown", () => {
  // The live figures the day this was written: 31 responses, 23/6/2.
  const live = [
    ...Array(23).fill({ nps_score: 10, service_rating: 5 }),
    ...Array(6).fill({ nps_score: 8, service_rating: 4 }),
    ...Array(2).fill({ nps_score: 5, service_rating: 2 }),
  ];

  it("counts the three groups", () => {
    const b = npsBreakdown(live);
    expect(b).toMatchObject({ responses: 31, promoters: 23, passives: 6, detractors: 2 });
  });

  it("computes NPS as promoters minus detractors, not the average score", () => {
    const b = npsBreakdown(live);
    // (23 - 2) / 31 = 67.7% -> 68, while the mean score is 288/31 = 9.29.
    // Reporting the mean as "NPS" would be wrong by a wide margin.
    expect(b.nps).toBe(68);
    expect(b.averageScore).toBeCloseTo(9.29, 2);
  });

  it("averages the star rating separately", () => {
    expect(npsBreakdown(live).averageRating).toBeCloseTo(4.61, 2);
  });

  it("is all promoters at 100 and all detractors at -100", () => {
    expect(npsBreakdown([{ nps_score: 10 }, { nps_score: 9 }]).nps).toBe(100);
    expect(npsBreakdown([{ nps_score: 0 }, { nps_score: 6 }]).nps).toBe(-100);
  });

  it("reports nothing rather than zero when there is nothing to score", () => {
    const b = npsBreakdown([]);
    expect(b.nps).toBeNull();
    expect(b.averageScore).toBeNull();
    expect(b.averageRating).toBeNull();
    expect(b.responses).toBe(0);
  });

  it("ignores a missing rating when averaging, without dropping the response", () => {
    const b = npsBreakdown([{ nps_score: 10, service_rating: 5 }, { nps_score: 9, service_rating: null }]);
    expect(b.responses).toBe(2);
    expect(b.averageRating).toBe(5);
  });
});
