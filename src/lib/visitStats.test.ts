import { describe, it, expect, vi, afterEach } from "vitest";
import { daysSinceVisit, isVisit, VISIT_STATUSES } from "./visitStats";

afterEach(() => vi.useRealTimers());

const at = (iso: string) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
};

describe("isVisit", () => {
  it("counts an appointment the patient turned up to", () => {
    expect(isVisit("Completed")).toBe(true);
    expect(isVisit("Checked-in")).toBe(true);
    expect(isVisit("In Progress")).toBe(true);
  });

  it("does not count a booking that has not happened", () => {
    // The whole bug: nine Confirmed bookings, one of them next month, were being
    // counted as visits alongside the single attended one.
    expect(isVisit("Confirmed")).toBe(false);
    expect(isVisit("Cancelled")).toBe(false);
    expect(isVisit("No Show")).toBe(false);
    expect(isVisit("Reserved")).toBe(false);
    expect(isVisit("Requested")).toBe(false);
  });

  it("treats a missing status as not a visit", () => {
    expect(isVisit(null)).toBe(false);
    expect(isVisit(undefined)).toBe(false);
    expect(isVisit("")).toBe(false);
  });

  it("agrees with the exported list", () => {
    for (const s of VISIT_STATUSES) expect(isVisit(s)).toBe(true);
  });
});

describe("daysSinceVisit", () => {
  it("counts the days since the patient was last in", () => {
    at("2026-09-21T12:00:00Z");
    expect(daysSinceVisit("2026-09-18T12:00:00Z")).toBe(3);
  });

  it("reads today as 0", () => {
    at("2026-09-21T18:00:00Z");
    expect(daysSinceVisit("2026-09-21T09:00:00Z")).toBe(0);
  });

  it("never goes negative for a visit dated ahead of now", () => {
    // This is what produced "Days Since Last Visit: -32" on the patient page -
    // a future booking subtracted from today.
    at("2026-09-21T12:00:00Z");
    expect(daysSinceVisit("2026-10-23T12:00:00Z")).toBe(0);
  });

  it("gives null when the patient has never been in", () => {
    expect(daysSinceVisit(null)).toBeNull();
    expect(daysSinceVisit(undefined)).toBeNull();
    expect(daysSinceVisit("")).toBeNull();
    expect(daysSinceVisit("not a date")).toBeNull();
  });

  it("accepts a Date as well as a string", () => {
    at("2026-09-21T12:00:00Z");
    expect(daysSinceVisit(new Date("2026-09-11T12:00:00Z"))).toBe(10);
  });
});

describe("isVisit, read from the appointment rather than from its status alone", () => {
  const PAST = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  it("counts a past appointment nobody closed", () => {
    // 13,205 of these: imported from Salesforce as "Confirmed" and left there.
    // Tahniya's header read "1 Visits" against seven attended appointments.
    expect(isVisit("Confirmed", PAST)).toBe(true);
    expect(isVisit("Reserved", PAST)).toBe(true);
  });

  it("still does not count a patient who did not come", () => {
    expect(isVisit("Cancelled", PAST)).toBe(false);
    expect(isVisit("No Show", PAST)).toBe(false);
  });

  it("still does not count a booking that has not happened", () => {
    expect(isVisit("Confirmed", FUTURE)).toBe(false);
    expect(isVisit("Reserved", FUTURE)).toBe(false);
  });

  it("counts an appointment marked attended ahead of time, as it always did", () => {
    expect(isVisit("Completed", FUTURE)).toBe(true);
  });

  it("falls back to the status when there is no date", () => {
    expect(isVisit("Confirmed")).toBe(false);
    expect(isVisit("Completed")).toBe(true);
    expect(isVisit("Confirmed", "not a date")).toBe(false);
  });
});
