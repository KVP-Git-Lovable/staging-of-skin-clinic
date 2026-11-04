import { describe, it, expect } from "vitest";
import { shouldOpenNewAppointment } from "./openNewAppointment";

const booking = { appointmentId: "apt-1" };

describe("shouldOpenNewAppointment", () => {
  it("opens a single new booking so the details can be checked", () => {
    expect(shouldOpenNewAppointment(booking)).toBe(true);
  });

  it("stays on the list when no appointment came back", () => {
    expect(shouldOpenNewAppointment({ appointmentId: null })).toBe(false);
    expect(shouldOpenNewAppointment({ appointmentId: "" })).toBe(false);
    expect(shouldOpenNewAppointment({ appointmentId: "   " })).toBe(false);
    expect(shouldOpenNewAppointment({})).toBe(false);
  });

  it("stays on the list for a recurring booking", () => {
    // A series has no single appointment to show, and the billing prompt
    // opens on top of the list the moment it is saved.
    expect(shouldOpenNewAppointment({ ...booking, wasRecurring: true })).toBe(false);
  });

  it("stays on the list when a survey form is about to open", () => {
    expect(shouldOpenNewAppointment({ ...booking, surveyToFillNow: true })).toBe(false);
  });
});
