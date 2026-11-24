import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ATTENDANCE_PERIODS, DEFAULT_ATTENDANCE_PERIOD, periodLabel, periodRange,
} from "./attendancePeriod";

/**
 * The window the All staff attendance list shows.
 *
 * It had two date boxes and nothing else: seeing today meant typing today's
 * date twice, and seeing one person meant reading past everybody else.
 *
 * The clock matters here. vitest runs under TZ: "Asia/Kolkata" on purpose -
 * a helper that reaches for toISOString() names YESTERDAY for anybody using
 * the app after 18:30 IST, which is most of the clinic's evening.
 */

const NOON = new Date("2026-11-16T12:00:00");

describe("periodRange", () => {
  it("covers everything, by filtering on nothing", () => {
    // Null rather than a wide range: the caller then applies no date filter
    // at all instead of comparing every row against a far-past date.
    expect(periodRange("all", NOON)).toBeNull();
  });

  it("gives today as a single day", () => {
    expect(periodRange("today", NOON)).toEqual({ from: "2026-11-16", to: "2026-11-16" });
  });

  it("gives yesterday as a single day", () => {
    expect(periodRange("yesterday", NOON)).toEqual({ from: "2026-11-15", to: "2026-11-15" });
  });

  it("counts the last 7 days inclusive of today", () => {
    // Today and the six before it - what the two boxes defaulted to.
    expect(periodRange("last7", NOON)).toEqual({ from: "2026-11-10", to: "2026-11-16" });
  });

  it("counts the last 30 days inclusive of today", () => {
    expect(periodRange("last30", NOON)).toEqual({ from: "2026-10-18", to: "2026-11-16" });
  });

  it("still says today in the small hours, IST", () => {
    // The boundary that actually catches a UTC-based helper. IST is UTC+5:30,
    // so between midnight and 05:29 the UTC date is still YESTERDAY:
    // 02:00 IST on the 16th is 20:30 UTC on the 15th, and
    // toISOString().slice(0, 10) would name the 15th all morning.
    const earlyHours = new Date("2026-11-16T02:00:00");
    expect(periodRange("today", earlyHours)).toEqual({ from: "2026-11-16", to: "2026-11-16" });
    expect(periodRange("yesterday", earlyHours)).toEqual({ from: "2026-11-15", to: "2026-11-15" });
    expect(periodRange("last7", earlyHours)).toEqual({ from: "2026-11-10", to: "2026-11-16" });
  });

  it("still says today late in the evening, IST", () => {
    const late = new Date("2026-11-16T23:30:00");
    expect(periodRange("today", late)).toEqual({ from: "2026-11-16", to: "2026-11-16" });
    expect(periodRange("last7", late)?.to).toBe("2026-11-16");
  });

  it("steps back over a month boundary", () => {
    const first = new Date("2026-03-02T09:00:00");
    expect(periodRange("yesterday", first)).toEqual({ from: "2026-03-01", to: "2026-03-01" });
    expect(periodRange("last7", first)?.from).toBe("2026-02-24");
  });

  it("steps back over a year boundary", () => {
    const jan = new Date("2027-01-02T09:00:00");
    expect(periodRange("last7", jan)?.from).toBe("2026-12-27");
  });

  describe("custom", () => {
    it("passes the typed dates through", () => {
      expect(periodRange("custom", NOON, { from: "2026-11-01", to: "2026-11-05" }))
        .toEqual({ from: "2026-11-01", to: "2026-11-05" });
    });

    it("shows everything while only one box is filled", () => {
      // A half-filled range is not a filter yet. Clamping to whichever end
      // was typed first hides rows the moment somebody starts typing.
      expect(periodRange("custom", NOON, { from: "2026-11-01" })).toBeNull();
      expect(periodRange("custom", NOON, { to: "2026-11-05" })).toBeNull();
      expect(periodRange("custom", NOON, {})).toBeNull();
      expect(periodRange("custom", NOON)).toBeNull();
      expect(periodRange("custom", NOON, { from: "  ", to: "  " })).toBeNull();
    });

    it("rights a range typed backwards", () => {
      expect(periodRange("custom", NOON, { from: "2026-11-05", to: "2026-11-01" }))
        .toEqual({ from: "2026-11-01", to: "2026-11-05" });
    });
  });
});

describe("the options offered", () => {
  it("are the ones the clinic asked for", () => {
    expect(ATTENDANCE_PERIODS.map((p) => p.value))
      .toEqual(["today", "yesterday", "last7", "last30", "all", "custom"]);
  });

  it("open on the seven days the screen already showed", () => {
    // Nobody's view changes on the day this ships.
    expect(DEFAULT_ATTENDANCE_PERIOD).toBe("last7");
  });

  it("every option has a range rule, so none can render an empty list by accident", () => {
    for (const { value } of ATTENDANCE_PERIODS) {
      const range = periodRange(value, NOON, { from: "2026-11-01", to: "2026-11-02" });
      if (value === "all") expect(range, value).toBeNull();
      else expect(range, value).not.toBeNull();
    }
  });

  it("names a period for anywhere that has to say which one is on", () => {
    expect(periodLabel("last7")).toBe("Last 7 days");
    expect(periodLabel("all")).toBe("All time");
  });
});

describe("the All staff list", () => {
  const src = () =>
    readFileSync("src/components/attendance/TeamAttendance.tsx", "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

  it("filters by period and by person", () => {
    const page = src();
    expect(page).toMatch(/data-testid="attendance-period"/);
    expect(page).toMatch(/<StaffCombobox/);
    expect(page).toMatch(/noneLabel="All staff"/);
  });

  it("shows the date boxes only under Custom range", () => {
    // They are still reachable; they just stop sitting on the screen for
    // everybody who wanted "today".
    expect(src()).toMatch(/\{period === "custom" && \(/);
  });

  it("applies each filter only when there is one to apply", () => {
    const page = src();
    expect(page).toMatch(/if \(range\) q = q\.gte\("date", range\.from\)\.lte\("date", range\.to\)/);
    expect(page).toMatch(/if \(staffId\) q = q\.eq\("staff_id", staffId\)/);
  });

  it("sorts within a day, and caps what it fetches", () => {
    const page = src();
    expect(page).toMatch(/\.order\("check_in_time", \{ ascending: false \}\)/);
    expect(page).toMatch(/\.limit\(ROW_LIMIT\)/);
    expect(page).toMatch(/data-testid="row-limit-notice"/);
  });

  it("refetches when any filter changes", () => {
    // All four belong in the key; one missing silently serves a stale list.
    expect(src()).toMatch(
      /queryKey: \["attendance", "admin", period, range\?\.from \?\? "", range\?\.to \?\? "", staffId\]/,
    );
  });
});
