import { describe, it, expect } from "vitest";
import { confirmationSendPlan } from "./confirmationSend";

const booking = { status: "Confirmed", phone: "9845242383", patientName: "Arun Bhat", enabled: true };

describe("confirmationSendPlan", () => {
  it("sends for a confirmed booking with a patient and a number", () => {
    expect(confirmationSendPlan(booking)).toEqual({ send: true });
  });

  it("says nothing about a booking that was never a candidate", () => {
    // A Reserved hold is not a missed message, and saying so on every booking
    // would be noise the front desk learns to ignore.
    expect(confirmationSendPlan({ ...booking, status: "Reserved" })).toEqual({ send: false });
    expect(confirmationSendPlan({ ...booking, status: null })).toEqual({ send: false });
  });

  it("names the missing phone number rather than staying silent", () => {
    const plan = confirmationSendPlan({ ...booking, phone: "" });
    expect(plan.send).toBe(false);
    expect(plan.skippedBecause).toContain("No phone number");
  });

  it("names an unlinked patient", () => {
    const plan = confirmationSendPlan({ ...booking, patientName: "   " });
    expect(plan.send).toBe(false);
    expect(plan.skippedBecause).toContain("no patient linked");
  });

  it("says so when confirmations are switched off", () => {
    // The state the clinic spent a day in without knowing: bookings saved,
    // nothing sent, nothing said.
    const plan = confirmationSendPlan({ ...booking, enabled: false });
    expect(plan.send).toBe(false);
    expect(plan.skippedBecause).toContain("switched off");
  });

  it("checks the status before anything else", () => {
    // A Reserved booking for a patient with no phone is still not a failure.
    expect(confirmationSendPlan({ status: "Reserved", phone: "", patientName: "", enabled: true }))
      .toEqual({ send: false });
  });
});
