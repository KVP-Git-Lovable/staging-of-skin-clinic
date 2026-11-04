import { describe, it, expect } from "vitest";
import { isWeekOff, nonWorkingReason, localDateKey, type WeekOffRow } from "./workingDays";

// November 2026: 1st is a Sunday, so Saturdays fall on 7, 14, 21, 28.
const SAT = (d: number) => new Date(2026, 10, d);
const sundayOff: WeekOffRow = { day_of_week: 0, is_off: true, alternate_pattern: "all" };

describe("isWeekOff", () => {
  it("closes every week when the pattern is 'all'", () => {
    for (const d of [1, 8, 15, 22, 29]) {
      expect(isWeekOff(new Date(2026, 10, d), [sundayOff])).toBe(true);
    }
  });

  it("leaves a working day alone", () => {
    expect(isWeekOff(new Date(2026, 10, 2), [sundayOff])).toBe(false);
    expect(isWeekOff(SAT(7), [sundayOff])).toBe(false);
  });

  /**
   * The case the reference gets wrong in three different places: a day marked
   * off with no pattern. Two of its copies read it as every week, the third
   * as no weeks - so the same row makes somebody absent on one screen and
   * present on another.
   */
  it("reads a day marked off with NO pattern as every week", () => {
    const row: WeekOffRow = { day_of_week: 0, is_off: true, alternate_pattern: null };
    for (const d of [1, 8, 15, 22]) {
      expect(isWeekOff(new Date(2026, 10, d), [row])).toBe(true);
    }
  });

  it("closes 1st and 3rd Saturdays only", () => {
    const row: WeekOffRow = { day_of_week: 6, is_off: true, alternate_pattern: "1st_3rd" };
    expect(isWeekOff(SAT(7), [row])).toBe(true);   // bucket 1
    expect(isWeekOff(SAT(14), [row])).toBe(false); // bucket 2
    expect(isWeekOff(SAT(21), [row])).toBe(true);  // bucket 3
    expect(isWeekOff(SAT(28), [row])).toBe(false); // bucket 4
  });

  it("closes 2nd and 4th Saturdays only", () => {
    const row: WeekOffRow = { day_of_week: 6, is_off: true, alternate_pattern: "2nd_4th" };
    expect(isWeekOff(SAT(7), [row])).toBe(false);
    expect(isWeekOff(SAT(14), [row])).toBe(true);
    expect(isWeekOff(SAT(21), [row])).toBe(false);
    expect(isWeekOff(SAT(28), [row])).toBe(true);
  });

  it("never treats a 5th-week day as an alternate week-off", () => {
    // ceil(29/7) = 5, which matches neither pattern. Kept from the reference
    // so "2nd and 4th Saturday" keeps its existing meaning for the clinic.
    const row: WeekOffRow = { day_of_week: 6, is_off: true, alternate_pattern: "2nd_4th" };
    expect(isWeekOff(new Date(2026, 7, 29), [row])).toBe(false); // Sat 29 Aug 2026
  });

  it("ignores a day that is configured but not off", () => {
    const row: WeekOffRow = { day_of_week: 0, is_off: false, alternate_pattern: "all" };
    expect(isWeekOff(new Date(2026, 10, 1), [row])).toBe(false);
  });

  it("treats no configuration at all as a normal working week", () => {
    for (const empty of [[], null, undefined]) {
      expect(isWeekOff(new Date(2026, 10, 1), empty)).toBe(false);
    }
  });
});

describe("localDateKey", () => {
  it("uses the clinic's own day, not UTC's", () => {
    // Half past midnight in Mangalore is still the PREVIOUS day in UTC
    // (IST is +5:30), so toISOString().slice(0,10) returns 03 November for a
    // date that is plainly the 4th to everybody in the clinic. Attendance is
    // filed under `date`, so that is a check-in landing on the wrong day.
    //
    // This assertion only bites because the suite runs in Asia/Kolkata - see
    // vitest.config.ts. In a UTC runner the two are identical and the bug is
    // invisible, which is exactly how it survived mutation testing at first.
    const afterMidnightIST = new Date(2026, 10, 4, 0, 30);
    expect(localDateKey(afterMidnightIST)).toBe("2026-11-04");
    expect(afterMidnightIST.toISOString().slice(0, 10)).toBe("2026-11-03");

    expect(localDateKey(new Date(2026, 10, 3, 23, 30))).toBe("2026-11-03");
    expect(localDateKey(new Date(2026, 0, 5, 0, 15))).toBe("2026-01-05");
  });
});

describe("nonWorkingReason", () => {
  const holidays = [{ date: "2026-11-14", name: "Diwali" }];

  it("names the holiday rather than saying 'week off'", () => {
    // "Diwali" tells somebody more than "Week off" does.
    expect(nonWorkingReason(new Date(2026, 10, 14), [], holidays)).toBe("Diwali");
  });

  it("prefers the holiday when the date is also a week-off", () => {
    const satOff: WeekOffRow = { day_of_week: 6, is_off: true, alternate_pattern: "all" };
    expect(nonWorkingReason(new Date(2026, 10, 14), [satOff], holidays)).toBe("Diwali");
  });

  it("says 'Week off' for a closed weekday with no holiday", () => {
    expect(nonWorkingReason(new Date(2026, 10, 1), [sundayOff], holidays)).toBe("Week off");
  });

  it("says nothing on an ordinary working day", () => {
    expect(nonWorkingReason(new Date(2026, 10, 3), [sundayOff], holidays)).toBe("");
  });

  it("copes with a timestamp where the database returned a full date-time", () => {
    const withTime = [{ date: "2026-11-14T00:00:00+00:00", name: "Diwali" }];
    expect(nonWorkingReason(new Date(2026, 10, 14), [], withTime)).toBe("Diwali");
  });

  it("is quiet when nothing is configured", () => {
    expect(nonWorkingReason(new Date(2026, 10, 14), null, null)).toBe("");
  });
});
