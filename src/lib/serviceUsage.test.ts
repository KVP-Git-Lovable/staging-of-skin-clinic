import { describe, it, expect } from "vitest";
import {
  sameServiceName,
  lineItemsForService,
  lineItemsTotal,
  rollUpServiceUsage,
  monthlyServiceSeries,
  filterServiceUsage,
  type ServiceUsageRow,
} from "./serviceUsage";

const HYDRA = { id: "svc-hydra", name: "HYDRADELUXE" };

/** An appointment row, with only the fields a test cares about spelled out. */
const row = (over: Partial<ServiceUsageRow> = {}): ServiceUsageRow => ({
  appointmentId: "a1",
  patientId: "p1",
  patientName: "Asha",
  startTime: "2026-01-15T10:00:00",
  doctorId: "d1",
  doctorName: "Dr Punya",
  value: null,
  rating: null,
  ...over,
});

describe("sameServiceName", () => {
  it("ignores the case and spacing the migration left behind", () => {
    expect(sameServiceName("EXION ", "exion")).toBe(true);
    expect(sameServiceName("  Peel B", "PEEL B  ")).toBe(true);
  });

  it("does not treat two empties as the same service", () => {
    // Appointments carry a blank service 1,111 times; they must not all
    // collapse onto whichever service happens to be looked at.
    expect(sameServiceName("", "")).toBe(false);
    expect(sameServiceName(null, undefined)).toBe(false);
    expect(sameServiceName("HYDRADELUXE", "")).toBe(false);
  });
});

describe("lineItemsForService", () => {
  it("takes only this service's line off a bill with several", () => {
    const lines = lineItemsForService(
      [
        { name: "Spot scar treatment", price: 800 },
        { name: "HYDRADELUXE", price: 4750 },
      ],
      HYDRA,
    );
    expect(lines).toHaveLength(1);
    expect(lineItemsTotal(lines)).toBe(4750);
  });

  it("believes the id over a name that disagrees with it", () => {
    // The id is what the app recorded; the name is free text somebody may
    // since have edited. A line stamped with another service is not ours even
    // when it still carries our name.
    const lines = lineItemsForService(
      [
        { name: "HYDRADELUXE", price: 4750, service_id: "svc-other" },
        { name: "renamed by staff", price: 1200, service_id: "svc-hydra" },
      ],
      HYDRA,
    );
    expect(lineItemsTotal(lines)).toBe(1200);
  });

  it("falls back to the name only when there is no id", () => {
    const lines = lineItemsForService(
      [{ name: "hydradeluxe ", price: 500, service_id: null }],
      HYDRA,
    );
    expect(lineItemsTotal(lines)).toBe(500);
  });

  it("multiplies by quantity, and treats a missing quantity as one", () => {
    expect(lineItemsTotal([{ name: "HYDRADELUXE", price: 500, qty: 3 }])).toBe(1500);
    expect(lineItemsTotal([{ name: "HYDRADELUXE", price: 500 }])).toBe(500);
    // Legacy rows store numbers as strings.
    expect(lineItemsTotal([{ name: "HYDRADELUXE", price: "800", qty: "2" }])).toBe(1600);
  });

  it("survives a bill with no line items at all", () => {
    expect(lineItemsForService(null, HYDRA)).toEqual([]);
    expect(lineItemsForService(undefined, HYDRA)).toEqual([]);
    expect(lineItemsTotal([])).toBe(0);
  });
});

describe("rollUpServiceUsage", () => {
  it("counts a returning patient once but all of their visits", () => {
    const summary = rollUpServiceUsage([
      row({ appointmentId: "a1", patientId: "p1" }),
      row({ appointmentId: "a2", patientId: "p1" }),
      row({ appointmentId: "a3", patientId: "p2" }),
    ]);
    expect(summary.patients).toBe(2);
    expect(summary.appointments).toBe(3);
  });

  it("keeps patients without an id apart from each other", () => {
    const summary = rollUpServiceUsage([
      row({ appointmentId: "a1", patientId: null }),
      row({ appointmentId: "a2", patientId: null }),
    ]);
    expect(summary.patients).toBe(2);
  });

  it("says nothing is rated rather than rating it zero", () => {
    const summary = rollUpServiceUsage([row(), row({ appointmentId: "a2" })]);
    expect(summary.avgRating).toBeNull();
    expect(summary.ratedCount).toBe(0);
  });

  it("averages only the visits that were rated", () => {
    const summary = rollUpServiceUsage([
      row({ appointmentId: "a1", rating: 5 }),
      row({ appointmentId: "a2", rating: 4 }),
      row({ appointmentId: "a3", rating: null }),
    ]);
    expect(summary.avgRating).toBe(4.5);
    expect(summary.ratedCount).toBe(2);
  });

  it("reports how many visits it could price, so revenue reads as a floor", () => {
    // Most historical bills cannot be attributed to a service at all. A low
    // revenue has to be distinguishable from a service nobody paid for.
    const summary = rollUpServiceUsage([
      row({ appointmentId: "a1", value: 4750 }),
      row({ appointmentId: "a2", value: null }),
      row({ appointmentId: "a3", value: null }),
    ]);
    expect(summary.revenue).toBe(4750);
    expect(summary.billedCount).toBe(1);
    expect(summary.appointments).toBe(3);
  });
});

describe("monthlyServiceSeries", () => {
  it("keeps a quiet month in the series instead of skipping it", () => {
    const series = monthlyServiceSeries([
      row({ appointmentId: "a1", startTime: "2026-01-10T10:00:00", value: 100 }),
      row({ appointmentId: "a2", startTime: "2026-03-10T10:00:00", value: 300 }),
    ]);
    expect(series.map((m) => m.key)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(series[1]).toMatchObject({ revenue: 0, appointments: 0, feedbackCount: 0, avgScore: null });
  });

  it("rolls the year over rather than running to month 13", () => {
    const series = monthlyServiceSeries([
      row({ appointmentId: "a1", startTime: "2025-11-10T10:00:00" }),
      row({ appointmentId: "a2", startTime: "2026-02-10T10:00:00" }),
    ]);
    expect(series.map((m) => m.key)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(series[0].label).toBe("Nov 2025");
  });

  it("totals revenue and visits within a month", () => {
    const series = monthlyServiceSeries([
      row({ appointmentId: "a1", startTime: "2026-01-02T10:00:00", value: 100 }),
      row({ appointmentId: "a2", startTime: "2026-01-20T10:00:00", value: 250 }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({ revenue: 350, appointments: 2 });
  });

  it("averages a month's ratings and leaves an unrated month null", () => {
    const series = monthlyServiceSeries([
      row({ appointmentId: "a1", startTime: "2026-01-02T10:00:00", rating: 5 }),
      row({ appointmentId: "a2", startTime: "2026-01-20T10:00:00", rating: 3 }),
      row({ appointmentId: "a3", startTime: "2026-02-02T10:00:00" }),
    ]);
    expect(series[0]).toMatchObject({ feedbackCount: 2, avgScore: 4 });
    expect(series[1]).toMatchObject({ feedbackCount: 0, avgScore: null });
  });

  it("has nothing to draw when there are no appointments", () => {
    expect(monthlyServiceSeries([])).toEqual([]);
  });

  it("ignores an unparseable date rather than inventing a month for it", () => {
    const series = monthlyServiceSeries([
      row({ appointmentId: "a1", startTime: "not a date" }),
      row({ appointmentId: "a2", startTime: "2026-01-10T10:00:00" }),
    ]);
    expect(series.map((m) => m.key)).toEqual(["2026-01"]);
    expect(series[0].appointments).toBe(1);
  });
});

describe("filterServiceUsage", () => {
  const now = new Date("2026-06-15T12:00:00");
  const rows = [
    row({ appointmentId: "a1", startTime: "2026-06-01T10:00:00", doctorId: "d1" }),
    row({ appointmentId: "a2", startTime: "2026-02-01T10:00:00", doctorId: "d2" }),
    row({ appointmentId: "a3", startTime: "2025-06-01T10:00:00", doctorId: "d1" }),
  ];

  it("keeps everything when no period and no doctor is chosen", () => {
    expect(filterServiceUsage(rows, { periodMonths: 0, doctorId: null }, now)).toHaveLength(3);
  });

  it("keeps only what falls inside the period", () => {
    const got = filterServiceUsage(rows, { periodMonths: 3, doctorId: null }, now);
    expect(got.map((r) => r.appointmentId)).toEqual(["a1"]);
  });

  it("narrows to one doctor across the whole history", () => {
    const got = filterServiceUsage(rows, { periodMonths: 0, doctorId: "d1" }, now);
    expect(got.map((r) => r.appointmentId)).toEqual(["a1", "a3"]);
  });

  it("applies period and doctor together, not one or the other", () => {
    const got = filterServiceUsage(rows, { periodMonths: 12, doctorId: "d1" }, now);
    expect(got.map((r) => r.appointmentId)).toEqual(["a1"]);
  });

  it("drops a visit with no readable date from a period rather than guessing", () => {
    const got = filterServiceUsage([row({ startTime: "not a date" })], { periodMonths: 6, doctorId: null }, now);
    expect(got).toHaveLength(0);
    // With no period there is nothing to place it against, so it stays.
    expect(filterServiceUsage([row({ startTime: "not a date" })], { periodMonths: 0, doctorId: null }, now)).toHaveLength(1);
  });
});
