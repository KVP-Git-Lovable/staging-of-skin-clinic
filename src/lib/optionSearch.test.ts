import { describe, it, expect } from "vitest";
import { optionMatchScore } from "./optionSearch";

/** Names taken from the clinic's own product list. */
const ACNEMOIST = "Acnemoist Moisturiser";
const AHAGLOW = "Ahaglow Acne Control Moisturiser";
const ACNE_UV = "Acne - UV";

const shows = (text: string, query: string) => optionMatchScore(text, query) > 0;

describe("optionMatchScore", () => {
  it("finds a medicine by the last word of its name", () => {
    // The reported case: "moisturiser" used to be no help at all.
    expect(shows(ACNEMOIST, "moisturiser")).toBe(true);
    expect(shows(AHAGLOW, "moisturiser")).toBe(true);
  });

  it("finds a word sitting inside another one", () => {
    expect(shows(ACNEMOIST, "moist")).toBe(true);
  });

  it("ignores punctuation in the name", () => {
    expect(shows(ACNE_UV, "acne uv")).toBe(true);
    expect(shows(ACNE_UV, "uv")).toBe(true);
  });

  it("needs every word typed, so a search narrows as it is typed", () => {
    expect(shows(AHAGLOW, "ahaglow moisturiser")).toBe(true);
    expect(shows(ACNEMOIST, "ahaglow moisturiser")).toBe(false);
  });

  it("does not mind the order the words are typed in", () => {
    expect(shows(AHAGLOW, "moisturiser ahaglow")).toBe(true);
  });

  it("hides a name that does not hold the word at all", () => {
    expect(optionMatchScore(ACNEMOIST, "sunscreen")).toBe(0);
  });

  it("shows everything before anything is typed", () => {
    expect(optionMatchScore(ACNEMOIST, "")).toBe(1);
    expect(optionMatchScore(ACNEMOIST, "   ")).toBe(1);
  });

  it("sorts a word-start match above one buried in the middle", () => {
    // Both stay visible; the one whose word begins with "moist" comes first.
    // (Acnemoist Moisturiser scores top too - its second word starts with it.)
    expect(optionMatchScore("Moisturiser SPF", "moist")).toBeGreaterThan(
      optionMatchScore("Acnemoist Cream", "moist"),
    );
  });

  it("is case blind", () => {
    expect(shows(AHAGLOW, "AHAGLOW")).toBe(true);
    expect(shows("AKLIEF", "aklief")).toBe(true);
  });

  it("scores an empty name as no match rather than throwing", () => {
    expect(optionMatchScore("", "moist")).toBe(0);
  });
});
