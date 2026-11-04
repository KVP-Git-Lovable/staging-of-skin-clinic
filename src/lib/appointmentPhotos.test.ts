import { describe, it, expect } from "vitest";
import { orderAppointmentPhotos, photoPositionIn } from "./appointmentPhotos";

const APPT = "appt-1";

/**
 * Newest first, as the query returns them - and deliberately interleaved, so
 * the concatenated order is demonstrably NOT the date order.
 */
const PHOTOS = [
  { id: "d", appointment_id: "appt-9" },
  { id: "c", appointment_id: APPT },
  { id: "b", appointment_id: null },
  { id: "a", appointment_id: APPT },
];

describe("orderAppointmentPhotos", () => {
  it("puts this appointment's photos under the first heading", () => {
    const { thisAppointment } = orderAppointmentPhotos(PHOTOS, APPT);
    expect(thisAppointment.map((p) => p.id)).toEqual(["c", "a"]);
  });

  it("puts everything else under the second, including photos linked to nothing", () => {
    const { others } = orderAppointmentPhotos(PHOTOS, APPT);
    expect(others.map((p) => p.id)).toEqual(["d", "b"]);
  });

  // The point of the module: the viewer steps through the page's order, which
  // is not the order the rows arrived in.
  it("reads in the page's order, not the date order", () => {
    const { ordered } = orderAppointmentPhotos(PHOTOS, APPT);
    expect(ordered.map((p) => p.id)).toEqual(["c", "a", "d", "b"]);
    expect(ordered.map((p) => p.id)).not.toEqual(PHOTOS.map((p) => p.id));
  });

  it("keeps each group in the order it was given", () => {
    const { ordered } = orderAppointmentPhotos(PHOTOS, APPT);
    expect(ordered.indexOf(PHOTOS[1])).toBeLessThan(ordered.indexOf(PHOTOS[3]));
    expect(ordered.indexOf(PHOTOS[0])).toBeLessThan(ordered.indexOf(PHOTOS[2]));
  });

  // Nobody may be dropped from the viewer, and nobody may appear twice - a
  // duplicate would make "next" stand still.
  it("loses nobody and repeats nobody", () => {
    const { ordered } = orderAppointmentPhotos(PHOTOS, APPT);
    expect(ordered).toHaveLength(PHOTOS.length);
    expect(new Set(ordered.map((p) => p.id)).size).toBe(PHOTOS.length);
    expect([...ordered].sort()).toHaveLength(PHOTOS.length);
    for (const p of PHOTOS) expect(ordered).toContain(p);
  });

  it("treats every photo as the patient's when there is no appointment", () => {
    for (const none of [null, undefined, ""]) {
      const { thisAppointment, others, ordered } = orderAppointmentPhotos(PHOTOS, none);
      expect(thisAppointment).toEqual([]);
      expect(others.map((p) => p.id)).toEqual(["d", "c", "b", "a"]);
      expect(ordered).toHaveLength(PHOTOS.length);
    }
  });

  it("copes with no photos at all", () => {
    for (const empty of [[], null, undefined]) {
      const { thisAppointment, others, ordered } = orderAppointmentPhotos(empty, APPT);
      expect(thisAppointment).toEqual([]);
      expect(others).toEqual([]);
      expect(ordered).toEqual([]);
    }
  });

  it("does not modify what it was given", () => {
    const input = [...PHOTOS];
    orderAppointmentPhotos(input, APPT);
    expect(input.map((p) => p.id)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("photoPositionIn", () => {
  it("finds a photo by id, wherever the grid clicked it from", () => {
    const { ordered } = orderAppointmentPhotos(PHOTOS, APPT);
    expect(photoPositionIn(ordered, { id: "c" })).toBe(0);
    expect(photoPositionIn(ordered, { id: "a" })).toBe(1);
    // Clicked in the second grid: opens at its own photo, not back at the first.
    expect(photoPositionIn(ordered, { id: "d" })).toBe(2);
    expect(photoPositionIn(ordered, { id: "b" })).toBe(3);
  });

  it("returns null for a photo that is not in the list", () => {
    const { ordered } = orderAppointmentPhotos(PHOTOS, APPT);
    expect(photoPositionIn(ordered, { id: "gone" })).toBeNull();
    expect(photoPositionIn([], { id: "c" })).toBeNull();
  });
});
