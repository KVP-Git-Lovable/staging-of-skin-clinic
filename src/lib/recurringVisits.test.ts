import { describe, it, expect } from "vitest";
import { clearVisitAt, joinVisitDateTime, removeVisitAt, splitVisitDateTime, toVisitInputValue, visitsNeedingAppointment } from "./recurringVisits";

describe("splitVisitDateTime", () => {
  it("separates the day from the clock", () => {
    expect(splitVisitDateTime("2026-10-21T14:30")).toEqual({ date: "2026-10-21", time: "14:30" });
  });

  it("drops seconds a stored value may carry", () => {
    expect(splitVisitDateTime("2026-10-21T14:30:00")).toEqual({ date: "2026-10-21", time: "14:30" });
  });

  it("handles an empty visit", () => {
    expect(splitVisitDateTime("")).toEqual({ date: "", time: "" });
    expect(splitVisitDateTime(null)).toEqual({ date: "", time: "" });
  });
});

describe("joinVisitDateTime", () => {
  it("puts the halves back together", () => {
    expect(joinVisitDateTime("2026-10-21", "14:30")).toBe("2026-10-21T14:30");
  });

  it("is no visit at all without a date", () => {
    // A time on its own would save as an unparseable date.
    expect(joinVisitDateTime("", "14:30")).toBe("");
    expect(joinVisitDateTime("   ", "14:30")).toBe("");
  });

  it("opens at nine rather than midnight when only a date is given", () => {
    expect(joinVisitDateTime("2026-10-21", "")).toBe("2026-10-21T09:00");
  });
});

describe("clearVisitAt", () => {
  it("empties one visit and leaves the others alone", () => {
    expect(clearVisitAt(
      { dates: ["2026-10-21T09:00", "2026-11-04T09:00"], investigations: ["2nd session", "review"] },
      0,
    )).toEqual({ dates: ["", "2026-11-04T09:00"], investigations: ["", "review"] });
  });
});

describe("removeVisitAt", () => {
  it("takes the date and its own investigation out together", () => {
    // The hazard this exists for: splice one list and the visit below inherits
    // somebody else's investigation.
    expect(removeVisitAt(
      { dates: ["d1", "d2", "d3"], investigations: ["i1", "i2", "i3"] },
      1,
    )).toEqual({ dates: ["d1", "d3"], investigations: ["i1", "i3"] });
  });

  it("works when fewer investigations have been typed than there are dates", () => {
    expect(removeVisitAt({ dates: ["d1", "d2", "d3"], investigations: ["i1"] }, 0))
      .toEqual({ dates: ["d2", "d3"], investigations: ["", ""] });
  });

  it("keeps the pairing when the last visit goes", () => {
    expect(removeVisitAt({ dates: ["d1", "d2"], investigations: ["i1", "i2"] }, 1))
      .toEqual({ dates: ["d1"], investigations: ["i1"] });
  });
});

describe("toVisitInputValue", () => {
  it("brings a stored visit back as the clinic's own clock", () => {
    // Built from local parts, so this holds whatever zone the test runs in.
    const iso = new Date(2026, 9, 22, 14, 30).toISOString();
    expect(toVisitInputValue(iso)).toBe("2026-10-22T14:30");
  });

  it("pads single digits, so the date boxes accept it", () => {
    const iso = new Date(2026, 0, 5, 9, 5).toISOString();
    expect(toVisitInputValue(iso)).toBe("2026-01-05T09:05");
  });

  it("drops seconds, which the picker has no room for", () => {
    const iso = new Date(2026, 9, 22, 14, 30, 45).toISOString();
    expect(toVisitInputValue(iso)).toBe("2026-10-22T14:30");
  });

  it("leaves the box empty rather than writing Invalid Date", () => {
    expect(toVisitInputValue(null)).toBe("");
    expect(toVisitInputValue(undefined)).toBe("");
    expect(toVisitInputValue("")).toBe("");
    expect(toVisitInputValue("not a date")).toBe("");
  });
});

describe("visitsNeedingAppointment", () => {
  const visit = (date: string) => ({ date, investigation: "" });

  it("books a visit added to a course that is already in the diary", () => {
    const planned = [visit("2026-11-01T10:00"), visit("2026-11-08T10:00"), visit("2026-11-15T10:00")];
    const booked = [new Date(2026, 10, 1, 10, 0).toISOString(), new Date(2026, 10, 8, 10, 0).toISOString()];
    expect(visitsNeedingAppointment(planned, booked).map((v) => v.date)).toEqual(["2026-11-15T10:00"]);
  });

  it("does not book the whole course again over stray seconds", () => {
    // The stored instant carries seconds; the picker never does. Matching on
    // the exact string would call every existing visit new.
    const planned = [visit("2026-11-01T10:00")];
    const booked = [new Date(2026, 10, 1, 10, 0, 37).toISOString()];
    expect(visitsNeedingAppointment(planned, booked)).toEqual([]);
  });

  it("books everything when nothing is in the diary yet", () => {
    const planned = [visit("2026-11-01T10:00"), visit("2026-11-08T10:00")];
    expect(visitsNeedingAppointment(planned, [])).toHaveLength(2);
  });

  it("never books the same minute twice, however it was typed", () => {
    const planned = [visit("2026-11-01T10:00"), visit("2026-11-01T10:00")];
    expect(visitsNeedingAppointment(planned, [])).toHaveLength(1);
  });

  it("refuses a date that is not one - the year 268 case", () => {
    expect(visitsNeedingAppointment([visit("nonsense")], [])).toEqual([]);
    expect(visitsNeedingAppointment([visit("")], [])).toEqual([]);
  });

  it("is not confused by a booked value that is not a date", () => {
    const planned = [visit("2026-11-01T10:00")];
    expect(visitsNeedingAppointment(planned, [null, undefined, "rubbish"])).toHaveLength(1);
  });

  it("keeps each visit's own investigation with it", () => {
    const planned = [
      { date: "2026-11-01T10:00", investigation: "Session 2" },
      { date: "2026-11-08T10:00", investigation: "Review" },
    ];
    const booked = [new Date(2026, 10, 1, 10, 0).toISOString()];
    expect(visitsNeedingAppointment(planned, booked)).toEqual([
      { date: "2026-11-08T10:00", investigation: "Review" },
    ]);
  });
});

describe("reading what Postgres actually sends", () => {
  /**
   * recurring_dates is a timestamptz[], and PostgREST writes those with a
   * space instead of a T and a two-digit offset. Chrome parses it; Safari -
   * which is what the clinic's iPhones run - does not. These are the exact
   * strings the live database returned.
   */
  const POSTGRES_FORM = "2026-12-01 03:30:00+00";

  it("reads a stored visit in the form the database sends it", () => {
    // 03:30 UTC, shown in whatever zone the clinic is in.
    const expected = toVisitInputValue(new Date("2026-12-01T03:30:00Z").toISOString());
    expect(toVisitInputValue(POSTGRES_FORM)).toBe(expected);
    expect(toVisitInputValue(POSTGRES_FORM)).not.toBe("");
  });

  it("still reads a plain ISO string, which is what the form writes back", () => {
    expect(toVisitInputValue("2026-12-01T03:30:00.000Z")).not.toBe("");
  });

  it("matches a visit stored by Postgres against the same visit typed in", () => {
    // The whole point: a course already booked must not be booked again just
    // because the two values are spelled differently.
    const typed = [{ date: toVisitInputValue(POSTGRES_FORM), investigation: "" }];
    expect(visitsNeedingAppointment(typed, [POSTGRES_FORM])).toEqual([]);
  });
});
