import { describe, it, expect } from "vitest";
import { viewDatePreset } from "./viewDatePreset";
import type { ViewFilters } from "@/lib/listViews/engine";

const withDate = (operator: string, value?: string, value2?: string): ViewFilters => ({
  match: "all",
  conditions: [{ field: "start_time", operator, value: value ?? "", value2 }],
});

describe("viewDatePreset", () => {
  it("means All Dates when a view has no filters at all", () => {
    // The standard "All Appointments" and "Recently Viewed" are built with an
    // empty conditions array. A view named for all of them must not show one
    // day because that is where the chip happened to be.
    expect(viewDatePreset({ match: "all", conditions: [] })).toEqual({ preset: "all" });
    expect(viewDatePreset({ match: "any", conditions: [] })).toEqual({ preset: "all" });
    expect(viewDatePreset(null)).toEqual({ preset: "all" });
    expect(viewDatePreset(undefined)).toEqual({ preset: "all" });
  });

  it("leaves the chips alone for a view that filters on something other than the date", () => {
    // Switching to a status view should not discard the date the user picked.
    expect(
      viewDatePreset({ match: "all", conditions: [{ field: "status", operator: "equals", value: "Confirmed" }] }),
    ).toBeNull();
  });

  it("resolves the clinic's own saved Todays Appointments view", () => {
    // The exact filter the "Todays Appointments" view holds in the database,
    // as the hook normalises it. This view opened on "0 items" until the user
    // picked it a second time: on a page load its window never reached the
    // fetch, which then pulled the oldest rows in the table and filtered every
    // one of them away. The fetch now derives its bound from this.
    expect(
      viewDatePreset({
        match: "all",
        conditions: [{ field: "start_time", operator: "today", value: "", value2: "" }],
      }),
    ).toEqual({ preset: "today" });
  });

  it("maps the operators a chip can express exactly", () => {
    for (const key of ["today", "tomorrow", "yesterday", "this_week", "last_week", "next_week", "this_month"]) {
      expect(viewDatePreset(withDate(key))).toEqual({ preset: key });
    }
  });

  it("carries the date through for a specific day", () => {
    const out = viewDatePreset(withDate("on", "2026-09-17"));
    expect(out?.preset).toBe("specific");
    expect(out?.specificDate?.getFullYear()).toBe(2026);
  });

  it("carries both ends of a between", () => {
    const out = viewDatePreset(withDate("between", "2026-09-01", "2026-09-30"));
    expect(out?.preset).toBe("range");
    expect(out?.rangeFrom?.getDate()).toBe(1);
    expect(out?.rangeTo?.getDate()).toBe(30);
  });

  it("orders a backwards between rather than passing it through", () => {
    const out = viewDatePreset(withDate("between", "2026-09-30", "2026-09-01"));
    expect(out?.rangeFrom!.getTime()).toBeLessThan(out?.rangeTo!.getTime());
  });

  it("falls back to All Dates for an operator no chip can express", () => {
    // The chips must never claim a narrower window than the view wants: the
    // chip decides what is FETCHED, so anything narrower drops rows the view
    // would have shown. "all" fetches everything and lets the view filter it.
    for (const key of ["last_month", "next_month", "this_quarter", "last_year", "last_n_days", "before", "after"]) {
      expect(viewDatePreset(withDate(key, "5"))).toEqual({ preset: "all" });
    }
  });

  it("falls back to All Dates when conditions are OR'd", () => {
    // With match: "any" a row outside the date can still match another
    // condition, so the date does not bound the result and must not bound the
    // fetch either.
    expect(
      viewDatePreset({
        match: "any",
        conditions: [
          { field: "start_time", operator: "today", value: "" },
          { field: "status", operator: "equals", value: "Confirmed" },
        ],
      }),
    ).toEqual({ preset: "all" });
  });

  it("falls back to All Dates when there are two date conditions", () => {
    expect(
      viewDatePreset({
        match: "all",
        conditions: [
          { field: "start_time", operator: "after", value: "2026-01-01" },
          { field: "start_time", operator: "before", value: "2026-12-31" },
        ],
      }),
    ).toEqual({ preset: "all" });
  });

  it("never hands back an unparseable date", () => {
    // A bad value used to reach the chip as an Invalid Date, which renders as
    // "Invalid Date" in the label and fetches nothing.
    expect(viewDatePreset(withDate("on", "not a date"))).toEqual({ preset: "all" });
    expect(viewDatePreset(withDate("on", ""))).toEqual({ preset: "all" });
    expect(viewDatePreset(withDate("between", "2026-09-01"))).toEqual({ preset: "all" });
  });

  it("ignores date conditions on another field", () => {
    expect(
      viewDatePreset({ match: "all", conditions: [{ field: "created_at", operator: "today", value: "" }] }),
    ).toBeNull();
  });
});
