import { describe, it, expect } from "vitest";
import { belongsToVisit, isSameDay, mediaDate, partitionVisitMedia } from "../lib/visitMedia";

const VISIT = { procedureId: "proc-1", appointmentId: "appt-1", date: "2026-05-14T11:30:00Z" };

describe("mediaDate", () => {
  it("prefers when the photo was taken over when the row landed", () => {
    expect(mediaDate({ taken_at: "2026-05-14T09:00:00Z", created_at: "2026-06-17T09:00:00Z" }))
      .toBe("2026-05-14T09:00:00Z");
  });
  it("falls back to created_at for a document, which has no taken_at", () => {
    expect(mediaDate({ created_at: "2026-06-17T09:00:00Z" })).toBe("2026-06-17T09:00:00Z");
  });
  it("is null when the row carries no date at all", () => {
    expect(mediaDate({})).toBeNull();
  });
});

describe("isSameDay", () => {
  it("matches across different times of the same day", () => {
    expect(isSameDay("2026-05-14T01:00:00", "2026-05-14T23:00:00")).toBe(true);
  });
  it("does not match a different day, or a missing or unparseable date", () => {
    expect(isSameDay("2026-05-14T12:00:00", "2026-05-15T12:00:00")).toBe(false);
    expect(isSameDay(null, "2026-05-14T12:00:00")).toBe(false);
    expect(isSameDay("not a date", "2026-05-14T12:00:00")).toBe(false);
  });
});

describe("belongsToVisit", () => {
  it("claims an image explicitly linked to this procedure", () => {
    expect(belongsToVisit({ procedure_id: "proc-1" }, VISIT)).toBe(true);
  });

  it("claims an image linked to this appointment when no procedure link exists", () => {
    expect(belongsToVisit({ appointment_id: "appt-1" }, VISIT)).toBe(true);
  });

  it("leaves an image linked to a different visit alone, even on the same day", () => {
    // An explicit link is a decision someone recorded; the date is only a guess.
    expect(belongsToVisit({ procedure_id: "proc-2", taken_at: VISIT.date }, VISIT)).toBe(false);
    expect(belongsToVisit({ appointment_id: "appt-2", taken_at: VISIT.date }, VISIT)).toBe(false);
  });

  it("claims an unlinked image taken on the visit's day - the imported case", () => {
    // 89,922 photos arrived from Salesforce with a patient and a date, nothing more.
    expect(belongsToVisit({ taken_at: "2026-05-14T08:15:00Z" }, VISIT)).toBe(true);
  });

  it("does not claim an unlinked image from another day", () => {
    expect(belongsToVisit({ taken_at: "2026-06-17T08:15:00Z" }, VISIT)).toBe(false);
  });

  it("does not claim an undated image rather than guessing", () => {
    expect(belongsToVisit({}, VISIT)).toBe(false);
  });
});

describe("partitionVisitMedia", () => {
  it("keeps every image, splitting rather than filtering", () => {
    const items = [
      { id: "a", procedure_id: "proc-1" },
      { id: "b", taken_at: "2026-05-14T08:00:00Z" },
      { id: "c", taken_at: "2020-01-01T08:00:00Z" },
      { id: "d", procedure_id: "proc-9", taken_at: "2026-05-14T08:00:00Z" },
      { id: "e" },
    ];
    const { thisVisit, otherVisits } = partitionVisitMedia(items, VISIT);
    expect(thisVisit.map((i) => i.id)).toEqual(["a", "b"]);
    expect(otherVisits.map((i) => i.id)).toEqual(["c", "d", "e"]);
    // Nothing may be dropped - a hidden clinical photo is worse than a misfiled one.
    expect(thisVisit.length + otherVisits.length).toBe(items.length);
  });

  it("puts everything under other visits when the visit has no date or links", () => {
    const items = [{ id: "a", taken_at: "2026-05-14T08:00:00Z" }];
    const { thisVisit, otherVisits } = partitionVisitMedia(items, {});
    expect(thisVisit).toEqual([]);
    expect(otherVisits).toHaveLength(1);
  });
});
