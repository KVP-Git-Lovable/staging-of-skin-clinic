import { describe, it, expect } from "vitest";
import { reportFiltersFromUrl } from "./reportUrlFilters";

/** The Patient Feedback report's own filters. */
const FILTERS = [
  { key: "dateRange", type: "dateRange" },
  { key: "doctor", type: "doctor" },
  { key: "nps_category", type: "select" },
];

const url = (qs: string) => new URLSearchParams(qs);

describe("reportFiltersFromUrl", () => {
  it("opens the report on the band the dashboard card was clicked", () => {
    expect(reportFiltersFromUrl(url("nps_category=Detractor"), FILTERS)?.selects).toEqual({
      nps_category: "Detractor",
    });
  });

  it("carries the dashboard's own dates across", () => {
    const out = reportFiltersFromUrl(url("from=2026-09-24&to=2026-10-05"), FILTERS);
    expect(out?.datePreset).toBe("custom");
    expect(out?.customStart).toBe("2026-09-24");
    expect(out?.dateFrom?.getDate()).toBe(24);
    // The last day counts in full, or the day's own feedback is missed.
    expect(out?.dateTo?.getHours()).toBe(23);
  });

  it("ignores a filter the report does not have", () => {
    expect(reportFiltersFromUrl(url("made_up=1"), FILTERS)).toBeNull();
  });

  it("ignores a key that is not a select on this report", () => {
    // doctor is its own control, not a plain select - a link may not set it.
    expect(reportFiltersFromUrl(url("doctor=abc"), FILTERS)).toBeNull();
  });

  it("leaves a report opened with no parameters completely alone", () => {
    expect(reportFiltersFromUrl(url(""), FILTERS)).toBeNull();
  });

  it("needs both ends of a range before it touches the dates", () => {
    expect(reportFiltersFromUrl(url("from=2026-09-24"), FILTERS)).toBeNull();
    expect(reportFiltersFromUrl(url("from=nonsense&to=2026-10-05"), FILTERS)).toBeNull();
  });
});
