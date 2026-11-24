import { describe, expect, it } from "vitest";
import {
  datesIn, historyRange, historyRows, historyTotals, hoursLabel, shiftAnchor,
} from "./attendanceHistory";

/**
 * Reading a person's own attendance back over a day, a week or a month.
 *
 * /attendance showed today and nothing else, so nobody could answer "how
 * many hours did I work last week" from inside the app.
 *
 * The case worth protecting is the empty day. Listing the records you happen
 * to have renders a week somebody missed Wednesday as six rows, and the
 * missing day disappears exactly when it matters.
 */

const at = (iso: string) => new Date(iso + "T12:00:00");

describe("historyRange", () => {
  it("covers one day for the day view", () => {
    expect(historyRange("day", at("2026-11-13"))).toEqual({ from: "2026-11-13", to: "2026-11-13" });
  });

  it("runs a week Monday to Sunday", () => {
    // 2026-11-13 is a Friday.
    expect(historyRange("week", at("2026-11-13"))).toEqual({ from: "2026-11-09", to: "2026-11-15" });
  });

  it("keeps SUNDAY in the week that is ending, not the one about to start", () => {
    // getDay() calls Sunday 0, so the naive `date - getDay()` pulls it back
    // nowhere and files its hours under next week.
    expect(historyRange("week", at("2026-11-15"))).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    // And Monday is the first day of its own week, not the last of the one before.
    expect(historyRange("week", at("2026-11-09"))).toEqual({ from: "2026-11-09", to: "2026-11-15" });
  });

  it("covers a whole month, whatever length it is", () => {
    expect(historyRange("month", at("2026-11-13"))).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(historyRange("month", at("2026-01-20"))).toEqual({ from: "2026-01-01", to: "2026-01-31" });
    expect(historyRange("month", at("2026-02-10"))).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    // A leap year, without a leap-year rule anywhere in the code.
    expect(historyRange("month", at("2028-02-10"))).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
});

describe("shiftAnchor", () => {
  it("steps a day and a week", () => {
    expect(historyRange("day", shiftAnchor("day", at("2026-11-13"), -1)).from).toBe("2026-11-12");
    expect(historyRange("week", shiftAnchor("week", at("2026-11-13"), -1)).from).toBe("2026-11-02");
    expect(historyRange("week", shiftAnchor("week", at("2026-11-13"), 1)).from).toBe("2026-11-16");
  });

  it("steps back from the 31st into the month before, not the one before that", () => {
    // Dec 31 minus one month is Nov 31, which does not exist - JavaScript
    // rolls it to Dec 1 and the view jumps back to where it started.
    expect(historyRange("month", shiftAnchor("month", at("2026-12-31"), -1))).toEqual({
      from: "2026-11-01", to: "2026-11-30",
    });
    expect(historyRange("month", shiftAnchor("month", at("2026-03-31"), -1))).toEqual({
      from: "2026-02-01", to: "2026-02-28",
    });
  });

  it("steps across a year boundary", () => {
    expect(historyRange("month", shiftAnchor("month", at("2026-01-15"), -1)).from).toBe("2025-12-01");
    expect(historyRange("month", shiftAnchor("month", at("2026-12-15"), 1)).from).toBe("2027-01-01");
  });
});

describe("datesIn", () => {
  it("includes both ends", () => {
    expect(datesIn({ from: "2026-11-09", to: "2026-11-11" }))
      .toEqual(["2026-11-09", "2026-11-10", "2026-11-11"]);
  });

  it("crosses a month boundary", () => {
    expect(datesIn({ from: "2026-10-30", to: "2026-11-02" }))
      .toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("gives one date when both ends are the same day", () => {
    expect(datesIn({ from: "2026-11-09", to: "2026-11-09" })).toEqual(["2026-11-09"]);
  });

  it("gives nothing rather than spinning when the range is backwards", () => {
    expect(datesIn({ from: "2026-11-09", to: "2026-11-01" })).toEqual([]);
  });
});

describe("historyRows", () => {
  const range = { from: "2026-11-09", to: "2026-11-11" };
  const records = [
    { date: "2026-11-09", check_in_time: "2026-11-09T09:30:00", check_out_time: "2026-11-09T18:00:00" },
    // Monday worked, Tuesday missed entirely, Wednesday still running.
    { date: "2026-11-11", check_in_time: "2026-11-11T09:00:00", check_out_time: null },
  ];

  it("gives a row for a day with NO record, rather than leaving it out", () => {
    // The whole point. Six rows for a five-day week hides the day somebody
    // did not clock in, which is the day anybody is looking for.
    const rows = historyRows(records as never, range);
    expect(rows.map((r) => r.date)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11"]);
    expect(rows[1]).toMatchObject({ present: false, checkIn: null, checkOut: null, hours: null });
  });

  it("works out the hours for a finished day", () => {
    expect(historyRows(records as never, range)[0].hours).toBe(8.5);
  });

  it("shows no hours for a day still running, rather than a guess", () => {
    const open = historyRows(records as never, range)[2];
    expect(open.present).toBe(true);
    expect(open.hours).toBeNull();
  });

  it("names the reason the clinic was closed", () => {
    // 2026-11-15 is a Sunday.
    const rows = historyRows([], { from: "2026-11-14", to: "2026-11-15" },
      [{ day_of_week: 0, is_off: true, alternate_pattern: null }],
      [{ date: "2026-11-14", name: "Diwali" }]);
    expect(rows[0].closed).toBe("Diwali");
    expect(rows[1].closed).toBe("Week off");
  });

  it("leaves an ordinary working day unlabelled", () => {
    expect(historyRows([], { from: "2026-11-13", to: "2026-11-13" }, [], [])[0].closed).toBe("");
  });

  it("matches a record whose date carries a timestamp", () => {
    const rows = historyRows(
      [{ date: "2026-11-09T00:00:00+00:00", check_in_time: "2026-11-09T09:00:00", check_out_time: null }] as never,
      { from: "2026-11-09", to: "2026-11-09" },
    );
    expect(rows[0].present).toBe(true);
  });

  it("copes with no records at all", () => {
    expect(historyRows(null, range).every((r) => !r.present)).toBe(true);
    expect(historyRows(undefined, range)).toHaveLength(3);
  });
});

describe("historyTotals", () => {
  const rows = historyRows(
    [
      { date: "2026-11-09", check_in_time: "2026-11-09T09:30:00", check_out_time: "2026-11-09T18:00:00" },
      { date: "2026-11-10", check_in_time: "2026-11-10T09:00:00", check_out_time: "2026-11-10T17:15:00" },
      { date: "2026-11-11", check_in_time: "2026-11-11T09:00:00", check_out_time: null },
    ] as never,
    { from: "2026-11-09", to: "2026-11-13" },
  );

  it("adds the finished days up", () => {
    expect(historyTotals(rows).totalHours).toBe(16.75);
  });

  it("counts a day still running as present but adds no hours for it", () => {
    // Showing "so far" in a monthly total puts a number in front of somebody
    // that quietly changes after lunch.
    const t = historyTotals(rows);
    expect(t.daysPresent).toBe(3);
    expect(t.daysOpen).toBe(1);
  });

  it("is zero for a period nobody worked", () => {
    expect(historyTotals(historyRows([], { from: "2026-11-09", to: "2026-11-11" })))
      .toEqual({ daysPresent: 0, daysOpen: 0, totalHours: 0 });
  });
});

describe("hoursLabel", () => {
  it("reads as hours and minutes", () => {
    expect(hoursLabel(8.5)).toBe("8h 30m");
    expect(hoursLabel(0.25)).toBe("0h 15m");
    expect(hoursLabel(16.75)).toBe("16h 45m");
  });

  it("pads the minutes, so a column of them lines up", () => {
    expect(hoursLabel(9.1)).toBe("9h 06m");
  });

  it("says nothing rather than zero when there are no hours yet", () => {
    expect(hoursLabel(null)).toBe("—");
    expect(hoursLabel(undefined)).toBe("—");
  });
});
