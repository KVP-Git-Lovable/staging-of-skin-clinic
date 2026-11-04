import { describe, it, expect } from "vitest";
import { recentSyncWindow } from "./salesforceSyncWindow";

/**
 * The bug this covers: every window used to end at today 23:59, and the edge
 * function matches on Start_Time__c, so an appointment scheduled for a future
 * date could never be pulled in no matter which button was pressed.
 */

// Wed 16 Sep 2026, mid-afternoon.
const NOW = new Date(2026, 8, 16, 15, 30, 0);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("recentSyncWindow", () => {
  it("reaches into the future when asked, which is what makes upcoming appointments syncable", () => {
    const { start, end } = recentSyncWindow(0, 7, NOW);
    expect(ymd(start)).toBe("2026-09-16");
    expect(ymd(end)).toBe("2026-09-23");
    // The reported case: a 19 Sep appointment has to fall inside the window.
    expect(new Date(2026, 8, 19, 17, 30).getTime()).toBeGreaterThan(start.getTime());
    expect(new Date(2026, 8, 19, 17, 30).getTime()).toBeLessThan(end.getTime());
  });

  it("covers the whole of both end days, not just the instant of the call", () => {
    const { start, end } = recentSyncWindow(7, 7, NOW);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    // An 8am appointment on the first day is inside the window.
    expect(new Date(2026, 8, 9, 8, 0).getTime()).toBeGreaterThan(start.getTime());
  });

  it("still ends today when no forward reach is asked for", () => {
    const { start, end } = recentSyncWindow(30, 0, NOW);
    expect(ymd(start)).toBe("2026-08-17");
    expect(ymd(end)).toBe("2026-09-16");
  });

  it("treats 'Today' as the whole of today, including appointments later this evening", () => {
    const { start, end } = recentSyncWindow(0, 0, NOW);
    expect(ymd(start)).toBe("2026-09-16");
    expect(ymd(end)).toBe("2026-09-16");
    expect(new Date(2026, 8, 16, 21, 0).getTime()).toBeLessThan(end.getTime());
  });

  it("crosses month and year boundaries correctly", () => {
    const newYearsEve = new Date(2026, 11, 31, 10, 0, 0);
    const { start, end } = recentSyncWindow(1, 1, newYearsEve);
    expect(ymd(start)).toBe("2026-12-30");
    expect(ymd(end)).toBe("2027-01-01");
  });

  it("does not mutate the date it was given", () => {
    const now = new Date(2026, 8, 16, 15, 30, 0);
    const before = now.getTime();
    recentSyncWindow(30, 60, now);
    expect(now.getTime()).toBe(before);
  });
});
