import { describe, it, expect } from "vitest";
import { APPOINTMENT_REMOVED_NOTICE, appointmentDayMismatch, decideAppointmentLink } from "./procedureAppointment";

const APPOINTMENT = "63b90873-8e57-4e8e-90f6-94371e243d0e";

describe("decideAppointmentLink", () => {
  it("keeps the link when the appointment is still there", () => {
    expect(decideAppointmentLink(APPOINTMENT, true)).toEqual({ id: APPOINTMENT, removed: false });
  });

  it("drops a link to an appointment that has been deleted, rather than losing the visit", () => {
    expect(decideAppointmentLink(APPOINTMENT, false)).toEqual({ id: null, removed: true });
  });

  it("says nothing when no appointment was named - a walk-in is not a loss", () => {
    expect(decideAppointmentLink(null, false)).toEqual({ id: null, removed: false });
    expect(decideAppointmentLink(undefined, false)).toEqual({ id: null, removed: false });
    expect(decideAppointmentLink("", false)).toEqual({ id: null, removed: false });
    expect(decideAppointmentLink("   ", false)).toEqual({ id: null, removed: false });
  });

  it("does not report a removal for a blank id even when nothing exists", () => {
    // The notice is for the front desk. Showing it on every walk-in would
    // teach them to ignore it.
    expect(decideAppointmentLink("", false).removed).toBe(false);
  });

  it("has a notice that explains where the visit went", () => {
    expect(APPOINTMENT_REMOVED_NOTICE).toContain("deleted");
    expect(APPOINTMENT_REMOVED_NOTICE).toContain("patient");
  });
});

describe("appointmentDayMismatch", () => {
  const writtenOn = new Date(2026, 9, 23, 11, 0); // 23 Oct 2026, 11:00

  it("is content when the visit is being written up on its own day", () => {
    const sameDay = new Date(2026, 9, 23, 9, 30);
    expect(appointmentDayMismatch(sameDay.toISOString(), writtenOn).mismatched).toBe(false);
  });

  it("flags an appointment from another day - the reported fault", () => {
    // 612 days apart was the worst found in the live data.
    const longAgo = new Date(2025, 0, 21, 10, 0);
    const check = appointmentDayMismatch(longAgo.toISOString(), writtenOn);
    expect(check.mismatched).toBe(true);
    expect(check.dayLabel).toContain("2025");
  });

  it("flags yesterday too, because the doctor should still be told", () => {
    // Writing up last night's clinic is ordinary - so this asks, it does not
    // refuse. The caller decides.
    const yesterday = new Date(2026, 9, 22, 19, 30);
    expect(appointmentDayMismatch(yesterday.toISOString(), writtenOn).mismatched).toBe(true);
  });

  it("says nothing about a walk-in, which has no appointment to be wrong about", () => {
    expect(appointmentDayMismatch(null, writtenOn)).toEqual({ mismatched: false, dayLabel: "" });
    expect(appointmentDayMismatch(undefined, writtenOn)).toEqual({ mismatched: false, dayLabel: "" });
    expect(appointmentDayMismatch("", writtenOn)).toEqual({ mismatched: false, dayLabel: "" });
  });

  it("does not block a save over a stored date it cannot read", () => {
    expect(appointmentDayMismatch("not a date", writtenOn).mismatched).toBe(false);
  });

  it("names the day and time, so the warning can be specific", () => {
    const appt = new Date(2026, 8, 21, 14, 30);
    const label = appointmentDayMismatch(appt.toISOString(), writtenOn).dayLabel;
    expect(label).toContain("21");
    expect(label).toContain("2026");
  });

  it("compares the day, not the clock - late evening is still the same day", () => {
    const sameDayLate = new Date(2026, 9, 23, 23, 45);
    expect(appointmentDayMismatch(sameDayLate.toISOString(), writtenOn).mismatched).toBe(false);
  });
});
