import { describe, it, expect } from "vitest";
import { billedPatientDays, patientDayKey } from "./billedPatientDays";

const row = (id: string, patient_id: string | null, start_time: string | null) =>
  ({ id, patient_id, start_time });

describe("patientDayKey", () => {
  it("groups a patient's appointments by the day they fall on", () => {
    const a = patientDayKey("p1", "2026-09-21T10:30:00");
    const b = patientDayKey("p1", "2026-09-21T16:00:00");
    expect(a).toBe(b);
  });

  it("separates the same patient on different days", () => {
    expect(patientDayKey("p1", "2026-09-21T10:30:00"))
      .not.toBe(patientDayKey("p1", "2026-09-22T10:30:00"));
  });

  it("separates different patients on the same day", () => {
    expect(patientDayKey("p1", "2026-09-21T10:30:00"))
      .not.toBe(patientDayKey("p2", "2026-09-21T10:30:00"));
  });

  it("has nothing to say without a patient or a usable date", () => {
    expect(patientDayKey(null, "2026-09-21T10:30:00")).toBeNull();
    expect(patientDayKey("p1", null)).toBeNull();
    expect(patientDayKey("p1", "not a date")).toBeNull();
  });
});

describe("billedPatientDays", () => {
  it("covers the sibling appointment that carries the bill", () => {
    // Kiran Shetty, 21 September: two rows at 4:00 PM, one bill of Rs 6,300.
    const rows = [
      row("gfc", "kiran", "2026-09-21T16:00:00"),
      row("consult", "kiran", "2026-09-21T16:00:00"),
    ];
    const billed = billedPatientDays(rows, (id) => id === "gfc");
    expect(billed.has(patientDayKey("kiran", "2026-09-21T16:00:00")!)).toBe(true);
  });

  it("does not cover a patient with no bill anywhere that day", () => {
    // A free Review follow-up stays a free Review follow-up.
    const rows = [row("review", "neha", "2026-09-21T16:00:00")];
    expect(billedPatientDays(rows, () => false).size).toBe(0);
  });

  it("does not let yesterday's bill cover today's visit", () => {
    const rows = [
      row("yesterday", "p1", "2026-09-20T16:00:00"),
      row("today", "p1", "2026-09-21T16:00:00"),
    ];
    const billed = billedPatientDays(rows, (id) => id === "yesterday");
    expect(billed.has(patientDayKey("p1", "2026-09-21T16:00:00")!)).toBe(false);
  });

  it("does not let one patient's bill cover another's", () => {
    const rows = [
      row("a", "p1", "2026-09-21T16:00:00"),
      row("b", "p2", "2026-09-21T16:00:00"),
    ];
    const billed = billedPatientDays(rows, (id) => id === "a");
    expect(billed.has(patientDayKey("p2", "2026-09-21T16:00:00")!)).toBe(false);
  });

  it("ignores rows with nothing to key on", () => {
    const rows = [row("x", null, "2026-09-21T16:00:00"), row("y", "p1", null)];
    expect(billedPatientDays(rows, () => true).size).toBe(0);
  });
});
