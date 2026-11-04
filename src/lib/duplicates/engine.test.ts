import { describe, it, expect } from "vitest";
import { fieldMatches } from "./engine";
import type { MatchField } from "./types";

const field = (matchType: MatchField["matchType"]): MatchField => ({
  id: "mf1",
  field_key: "phone",
  matchType,
  joiner: "and",
});

describe("fieldMatches", () => {
  it("compares exactly, which is how the live phone rule is configured", () => {
    expect(fieldMatches(field("exact"), "8722884202", "8722884202")).toBe(true);
    expect(fieldMatches(field("exact"), "8722884202", "8722884203")).toBe(false);
    // Trimmed on both sides: staff paste numbers with stray spaces.
    expect(fieldMatches(field("exact"), " 8722884202 ", "8722884202")).toBe(true);
  });

  it("ignores case when asked, which is how the email rule is configured", () => {
    expect(fieldMatches(field("case_insensitive"), "Ravi@Mail.com", "ravi@mail.com")).toBe(true);
    expect(fieldMatches(field("exact"), "Ravi@Mail.com", "ravi@mail.com")).toBe(false);
  });

  it("matches starts_with in either direction", () => {
    expect(fieldMatches(field("starts_with"), "Shiv", "Shivananda")).toBe(true);
    expect(fieldMatches(field("starts_with"), "Shivananda", "Shiv")).toBe(true);
    expect(fieldMatches(field("starts_with"), "Ravi", "Shivananda")).toBe(false);
  });

  it("holds the fuzzy threshold at 0.85", () => {
    // One letter in ten is inside the threshold; three are not.
    expect(fieldMatches(field("fuzzy"), "Shivananda", "Shivanandu")).toBe(true);
    expect(fieldMatches(field("fuzzy"), "Shivananda", "Shivaaaaaa")).toBe(false);
    expect(fieldMatches(field("fuzzy"), "Ravi", "Shivananda")).toBe(false);
  });

  it("never matches when either side is empty", () => {
    // A blank phone on the form must not match every patient who has no phone.
    for (const t of ["exact", "case_insensitive", "starts_with", "fuzzy"] as const) {
      expect(fieldMatches(field(t), "", "8722884202")).toBe(false);
      expect(fieldMatches(field(t), "8722884202", "")).toBe(false);
      expect(fieldMatches(field(t), null, null)).toBe(false);
      expect(fieldMatches(field(t), "   ", "8722884202")).toBe(false);
    }
  });
});
