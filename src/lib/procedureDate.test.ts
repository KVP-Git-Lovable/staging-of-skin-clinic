import { describe, it, expect } from "vitest";
import { procedureDateLabel, isUndatedVisit, DATE_NOT_RECORDED } from "./procedureDate";

describe("procedureDateLabel", () => {
  it("formats a real visit date in whatever shape the screen uses", () => {
    const visit = { procedure_date: "2026-09-02T06:30:00Z", date_not_recorded: false };
    expect(procedureDateLabel(visit)).toBe("02/09/2026");
    expect(procedureDateLabel(visit, "MMM d, yyyy")).toBe("Sep 2, 2026");
  });

  it("says the date is not recorded for an imported visit, whatever the pattern", () => {
    // The sentinel is 1900-01-01; it must never reach a doctor's screen.
    const undated = { procedure_date: "1900-01-01T00:00:00Z", date_not_recorded: true };
    expect(procedureDateLabel(undated)).toBe(DATE_NOT_RECORDED);
    expect(procedureDateLabel(undated, "MMM d, yyyy")).toBe(DATE_NOT_RECORDED);
    expect(procedureDateLabel(undated, "EEE, dd/MM/yyyy · h:mm a")).toBe(DATE_NOT_RECORDED);
  });

  it("never prints 23 April for a flagged row", () => {
    // Belt and braces: even if a flagged row somehow still held the old date.
    expect(
      procedureDateLabel({ procedure_date: "2026-04-23T00:00:00Z", date_not_recorded: true }),
    ).toBe(DATE_NOT_RECORDED);
  });

  it("still shows 23 April for the genuine visits of that day", () => {
    expect(
      procedureDateLabel({ procedure_date: "2026-04-23T05:30:00Z", date_not_recorded: false }),
    ).toBe("23/04/2026");
  });

  it("does not throw on a missing or unusable date", () => {
    // format() raises a RangeError on an invalid Date, which would take a whole
    // patient's history off the screen over one bad row.
    expect(procedureDateLabel(null)).toBe(DATE_NOT_RECORDED);
    expect(procedureDateLabel(undefined)).toBe(DATE_NOT_RECORDED);
    expect(procedureDateLabel({ procedure_date: null })).toBe(DATE_NOT_RECORDED);
    expect(procedureDateLabel({ procedure_date: "" })).toBe(DATE_NOT_RECORDED);
    expect(procedureDateLabel({ procedure_date: "not a date" })).toBe(DATE_NOT_RECORDED);
  });

  it("accepts a Date as well as a string", () => {
    expect(procedureDateLabel({ procedure_date: new Date(2026, 8, 2) })).toBe("02/09/2026");
  });

  it("treats a row with no flag at all as dated", () => {
    // Rows written before the column existed default to false in the database.
    expect(procedureDateLabel({ procedure_date: "2026-09-02T06:30:00Z" })).toBe("02/09/2026");
  });
});

describe("isUndatedVisit", () => {
  it("is true only for a flagged row", () => {
    expect(isUndatedVisit({ date_not_recorded: true })).toBe(true);
    expect(isUndatedVisit({ date_not_recorded: false })).toBe(false);
    expect(isUndatedVisit({ procedure_date: "2026-09-02" })).toBe(false);
    expect(isUndatedVisit(null)).toBe(false);
  });
});
