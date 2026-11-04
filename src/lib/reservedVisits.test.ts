import { describe, it, expect } from "vitest";
import { reservedVisits } from "./reservedVisits";

describe("reservedVisits", () => {
  it("keeps each visit's own investigation", () => {
    expect(
      reservedVisits(
        ["2026-11-01T10:00", "2026-11-22T10:00"],
        ["3rd of 6 laser toning sessions", "review pigmentation"],
      ),
    ).toEqual([
      { date: "2026-11-01T10:00", investigation: "3rd of 6 laser toning sessions" },
      { date: "2026-11-22T10:00", investigation: "review pigmentation" },
    ]);
  });

  it("does not slide an investigation onto an earlier visit when a date is left blank", () => {
    // Visit 2 is to be dated later. Visit 3's text must not become visit 1's -
    // which is what dropping the blanks before pairing would have done.
    expect(
      reservedVisits(
        ["2026-11-01T10:00", "", "2026-12-06T10:00"],
        ["first session", "second session", "review"],
      ),
    ).toEqual([
      { date: "2026-11-01T10:00", investigation: "first session" },
      { date: "2026-12-06T10:00", investigation: "review" },
    ]);
  });

  it("gives a dated visit with nothing written an empty investigation", () => {
    expect(reservedVisits(["2026-11-01T10:00"], [])).toEqual([
      { date: "2026-11-01T10:00", investigation: "" },
    ]);
    expect(reservedVisits(["2026-11-01T10:00"], ["   "])).toEqual([
      { date: "2026-11-01T10:00", investigation: "" },
    ]);
  });

  it("reserves nothing when no date was picked", () => {
    expect(reservedVisits(["", "  "], ["something", "else"])).toEqual([]);
    expect(reservedVisits([], [])).toEqual([]);
  });

  it("ignores text left over from visits that are no longer booked", () => {
    // The number of visits can be reduced after the boxes were typed in.
    expect(reservedVisits(["2026-11-01T10:00"], ["first", "stale", "staler"])).toEqual([
      { date: "2026-11-01T10:00", investigation: "first" },
    ]);
  });

  it("survives a list with nothing in it at all", () => {
    expect(reservedVisits([null, undefined], [null, undefined])).toEqual([]);
  });
});
