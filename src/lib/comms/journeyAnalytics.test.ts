import { describe, expect, it } from "vitest";
import {
  computeJourneyAnalytics,
  istDayKey,
  istWeekStartKey,
  type AnalyticsMessage,
  type AnalyticsEnrollment,
} from "@/lib/comms/journeyAnalytics";

const msg = (id: string, patient: string, status: string, sentAt: string, extra: Partial<AnalyticsMessage> = {}): AnalyticsMessage => ({
  id,
  patient_id: patient,
  node_id: "n1",
  status,
  delivery_status: null,
  error_code: null,
  error_message: null,
  sent_at: sentAt,
  ...extra,
});
const enr = (id: string, patient: string, status: string, at: string): AnalyticsEnrollment => ({ id, patient_id: patient, status, enrolled_at: at });

// 10 enrolled; 8 delivered (4 of those read); 1 failed; 1 never sent.
const enrollments = Array.from({ length: 10 }, (_, i) => enr(`e${i}`, `p${i}`, i < 3 ? "completed" : "active", "2026-10-12T05:00:00Z"));
const messages: AnalyticsMessage[] = [
  ...Array.from({ length: 4 }, (_, i) => msg(`r${i}`, `p${i}`, "read", "2026-10-12T05:30:00Z")),
  ...Array.from({ length: 4 }, (_, i) => msg(`d${i}`, `p${i + 4}`, "delivered", "2026-10-12T06:00:00Z")),
  msg("f1", "p8", "failed", "2026-10-12T06:00:00Z", { error_code: "63049" }),
];

describe("computeJourneyAnalytics", () => {
  const out = computeJourneyAnalytics({ messages, enrollments, appointments: [], invoices: [] });

  it("counts people and rates against entered", () => {
    expect(out.kpis.entered).toBe(10);
    expect(out.kpis.delivered).toBe(8);
    expect(out.kpis.read).toBe(4);
    expect(out.kpis.failed).toBe(1);
    expect(out.kpis.pending).toBe(1);
    expect(out.kpis.deliveryRate).toBeCloseTo(80);
    expect(out.kpis.readRate).toBeCloseTo(40);
    expect(out.kpis.active).toBe(7);
    expect(out.kpis.completed).toBe(3);
  });

  it("builds the funnel with untracked stages flagged", () => {
    expect(out.funnel.map((f) => [f.label, f.count, f.tracked])).toEqual([
      ["Entered Journey", 10, true],
      ["Delivered", 8, true],
      ["Read", 4, true],
      ["Clicked", 0, false],
      ["Replied", 0, false],
      ["Appointment Booked", 0, true],
    ]);
  });

  it("segments warm, cold and lost", () => {
    expect(out.segments).toEqual({ warm: 4, cold: 4, lost: 1, highValue: 0 });
  });

  it("scores health from delivery, read and failures", () => {
    // 80*0.3 + 40*0.4 - 10 = 30 -> +40 = 70
    expect(out.health.score).toBe(70);
    expect(out.health.label).toBe("Good");
    expect(out.health.areas).toEqual(["Delivery rate below 90%", "Read rate below 60%", "Failed deliveries elevated"]);
  });

  it("buckets read messages into the IST heatmap", () => {
    // 05:30Z = 11:00 IST on Monday 12 Oct 2026
    expect(out.heat[1][11]).toBe(4);
    expect(out.trend).toEqual([{ day: "2026-10-12", delivered: 8, read: 4 }]);
  });

  it("groups cohorts by IST Monday and reads within a day", () => {
    expect(out.cohorts).toHaveLength(1);
    expect(out.cohorts[0]).toMatchObject({ week: "2026-10-12", entered: 10 });
    expect(out.cohorts[0].d1ReadPct).toBeCloseTo(40);
  });
});

describe("attribution", () => {
  it("only credits bookings and paid invoices after the first message", () => {
    const out = computeJourneyAnalytics({
      messages: [msg("m1", "p1", "read", "2026-10-12T05:00:00Z"), msg("m2", "p2", "delivered", "2026-10-12T05:00:00Z")],
      enrollments: [enr("e1", "p1", "active", "2026-10-12T04:00:00Z"), enr("e2", "p2", "active", "2026-10-12T04:00:00Z")],
      appointments: [
        { patient_id: "p1", created_at: "2026-10-13T05:00:00Z" }, // within 1 day
        { patient_id: "p2", created_at: "2026-10-01T05:00:00Z" }, // before the message: ignored
      ],
      invoices: [
        { patient_id: "p1", created_at: "2026-10-20T05:00:00Z", paid_amount: 1500 }, // within 15 days
        { patient_id: "p1", created_at: "2026-10-12T06:00:00Z", paid_amount: 0 }, // unpaid: ignored
      ],
    });
    expect(out.kpis.bookedPatients).toBe(1);
    expect(out.kpis.conversionRate).toBeCloseTo(50);
    expect(out.kpis.revenue).toBe(1500);
    expect(out.attribution.d1).toEqual({ revenue: 0, bookings: 1 });
    expect(out.attribution.d15).toEqual({ revenue: 1500, bookings: 1 });
    expect(out.segments.highValue).toBe(1);
  });
});

describe("date helpers and empty input", () => {
  it("uses the IST day and a Monday week start (Sunday belongs to the week before)", () => {
    expect(istDayKey("2026-10-12T20:00:00Z")).toBe("2026-10-13"); // 01:30 IST next day
    expect(istWeekStartKey("2026-10-18T10:00:00Z")).toBe("2026-10-12"); // Sunday
    expect(istWeekStartKey("2026-10-19T10:00:00Z")).toBe("2026-10-19"); // Monday
  });

  it("returns zeros without data", () => {
    const out = computeJourneyAnalytics({ messages: [], enrollments: [], appointments: [], invoices: [] });
    expect(out.hasData).toBe(false);
    expect(out.kpis.deliveryRate).toBe(0);
    expect(out.health.score).toBe(0);
    expect(out.funnel[0].count).toBe(0);
  });

  it("applies the date range to messages only", () => {
    const out = computeJourneyAnalytics({
      messages,
      enrollments,
      appointments: [],
      invoices: [],
      range: { from: new Date("2026-10-13T00:00:00Z"), to: new Date("2026-10-14T00:00:00Z") },
    });
    expect(out.kpis.entered).toBe(10);
    expect(out.kpis.delivered).toBe(0);
  });
});
