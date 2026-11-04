import { describe, it, expect } from "vitest";
import { NEWEST_FIRST, sortForSearch, type ListSort } from "./appointmentSearchSort";

/**
 * The reported search: "Shibani" in the Appointments list returned her
 * 27/11/2020 visit first, with the appointment three days away 30 rows below.
 */

/** What Appointments.tsx holds by default - oldest first. */
const DEFAULT_SORT: ListSort = { column: "start_time", direction: "asc" };

describe("sortForSearch", () => {
  it("leaves an unsearched list exactly as it is", () => {
    // Today's Appointments reads in clock order, morning first. This is the
    // one that must not move.
    expect(sortForSearch(DEFAULT_SORT, "", false)).toEqual(DEFAULT_SORT);
    expect(sortForSearch(DEFAULT_SORT, null, false)).toEqual(DEFAULT_SORT);
    expect(sortForSearch(DEFAULT_SORT, undefined, false)).toEqual(DEFAULT_SORT);
  });

  it("treats a box holding only spaces as no search", () => {
    expect(sortForSearch(DEFAULT_SORT, "   ", false)).toEqual(DEFAULT_SORT);
  });

  it("puts the most recent visit first once something is typed", () => {
    expect(sortForSearch(DEFAULT_SORT, "Shibani", false)).toEqual(NEWEST_FIRST);
    expect(NEWEST_FIRST).toEqual({ column: "start_time", direction: "desc" });
  });

  it("keeps a sort the user picked, even one that looks like the default", () => {
    // The case a value-based rule gets wrong: searching AND deliberately
    // asking for oldest-first. Without this the click would be undone on the
    // next keystroke.
    expect(sortForSearch(DEFAULT_SORT, "Shibani", true)).toEqual(DEFAULT_SORT);
  });

  it("keeps a sort the user picked on any other column", () => {
    const byPatient: ListSort = { column: "patient", direction: "asc" };
    expect(sortForSearch(byPatient, "Shibani", true)).toEqual(byPatient);
    const byBill: ListSort = { column: "bill", direction: "desc" };
    expect(sortForSearch(byBill, "550", true)).toEqual(byBill);
  });

  it("overrides an unchosen sort on another column too", () => {
    // A view that names no real sort falls back to the default; searching from
    // there should still surface the newest.
    const notChosen: ListSort = { column: "service", direction: "asc" };
    expect(sortForSearch(notChosen, "Shibani", false)).toEqual(NEWEST_FIRST);
  });

  it("hands back the same shape it was given, never a mutated one", () => {
    const current: ListSort = { column: "start_time", direction: "asc" };
    const result = sortForSearch(current, "Shibani", false);
    expect(current).toEqual({ column: "start_time", direction: "asc" });
    expect(result).not.toBe(current);
  });
});
