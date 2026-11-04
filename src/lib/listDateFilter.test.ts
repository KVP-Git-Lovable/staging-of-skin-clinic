import { describe, it, expect } from "vitest";
import { withinRange } from "./listDateFilter";

const day = (iso: string) => new Date(iso);

describe("withinRange", () => {
  it("passes everything when no period is chosen", () => {
    expect(withinRange("2026-09-19T10:00:00Z", {})).toBe(true);
    expect(withinRange("2026-09-19T10:00:00Z", null)).toBe(true);
    expect(withinRange("2026-09-19T10:00:00Z", undefined)).toBe(true);
    // Including a record with no date: that is how the unfiltered list reads.
    expect(withinRange(null, {})).toBe(true);
  });

  it("keeps a date inside the window and drops one outside it", () => {
    const range = { start: day("2026-09-01T00:00:00Z"), end: day("2026-09-30T23:59:59Z") };
    expect(withinRange("2026-09-19T10:00:00Z", range)).toBe(true);
    expect(withinRange("2026-08-31T23:00:00Z", range)).toBe(false);
    expect(withinRange("2026-10-01T00:30:00Z", range)).toBe(false);
  });

  it("counts both ends of the window", () => {
    const range = { start: day("2026-09-01T00:00:00Z"), end: day("2026-09-30T23:59:59Z") };
    expect(withinRange("2026-09-01T00:00:00Z", range)).toBe(true);
    expect(withinRange("2026-09-30T23:59:59Z", range)).toBe(true);
  });

  it("holds an open end of the window open", () => {
    expect(withinRange("2030-01-01T00:00:00Z", { start: day("2026-01-01T00:00:00Z") })).toBe(true);
    expect(withinRange("2020-01-01T00:00:00Z", { start: day("2026-01-01T00:00:00Z") })).toBe(false);
    expect(withinRange("2020-01-01T00:00:00Z", { end: day("2026-01-01T00:00:00Z") })).toBe(true);
    expect(withinRange("2030-01-01T00:00:00Z", { end: day("2026-01-01T00:00:00Z") })).toBe(false);
  });

  it("will not call a visit of unknown date part of a chosen period", () => {
    const range = { start: day("2026-09-01T00:00:00Z"), end: day("2026-09-30T23:59:59Z") };
    expect(withinRange(null, range)).toBe(false);
    expect(withinRange(undefined, range)).toBe(false);
    expect(withinRange("", range)).toBe(false);
    expect(withinRange("not a date", range)).toBe(false);
  });

  it("takes a Date or a timestamp as readily as a string", () => {
    const range = { start: day("2026-09-01T00:00:00Z"), end: day("2026-09-30T23:59:59Z") };
    expect(withinRange(day("2026-09-19T10:00:00Z"), range)).toBe(true);
    expect(withinRange(day("2026-09-19T10:00:00Z").getTime(), range)).toBe(true);
  });

  it("simply matches nothing when From is later than To", () => {
    const range = { start: day("2026-09-30T00:00:00Z"), end: day("2026-09-01T00:00:00Z") };
    expect(withinRange("2026-09-15T10:00:00Z", range)).toBe(false);
  });
});
