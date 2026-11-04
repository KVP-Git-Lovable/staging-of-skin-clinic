import { describe, it, expect } from "vitest";
import { APPOINTMENT_QUERY_KEYS, appointmentChangeKind, appointmentEventId, canApplyLiveChange, openAppointmentNotice } from "./liveAppointments";

const ID = "d398da7a-1965-4328-adb0-dc0c3ef96a2c";

describe("appointmentEventId", () => {
  it("reads the id off a new booking", () => {
    expect(appointmentEventId({ eventType: "INSERT", new: { id: ID, status: "Confirmed" }, old: {} })).toBe(ID);
  });

  it("reads it off a retimed one", () => {
    expect(appointmentEventId({ eventType: "UPDATE", new: { id: ID }, old: { id: ID } })).toBe(ID);
  });

  it("reads it off a deletion, which carries only the key", () => {
    expect(appointmentEventId({ eventType: "DELETE", new: {}, old: { id: ID } })).toBe(ID);
  });

  it("ignores anything that does not look like either, rather than guessing", () => {
    expect(appointmentEventId(null)).toBeNull();
    expect(appointmentEventId(undefined)).toBeNull();
    expect(appointmentEventId({ eventType: "DELETE", new: {}, old: {} })).toBeNull();
    expect(appointmentEventId({ eventType: "UPDATE", new: { id: 42 } as never })).toBeNull();
    expect(appointmentEventId({ eventType: "UPDATE", new: { id: "   " } })).toBeNull();
  });
});

describe("appointmentChangeKind", () => {
  it("calls a deletion a deletion", () => {
    expect(appointmentChangeKind({ eventType: "DELETE", old: { id: ID } })).toBe("deleted");
    expect(appointmentChangeKind({ eventType: "delete", old: { id: ID } })).toBe("deleted");
  });

  it("treats everything else as a change", () => {
    expect(appointmentChangeKind({ eventType: "UPDATE", new: { id: ID } })).toBe("changed");
    expect(appointmentChangeKind({ eventType: "INSERT", new: { id: ID } })).toBe("changed");
    expect(appointmentChangeKind(null)).toBe("changed");
  });
});

describe("openAppointmentNotice", () => {
  it("answers the question a deletion raises: have I lost what I typed", () => {
    const notice = openAppointmentNotice("deleted");
    expect(notice).toContain("deleted");
    expect(notice).toContain("patient's record");
  });

  it("says a change plainly, without alarming anyone", () => {
    expect(openAppointmentNotice("changed")).toBe("This appointment was changed at the front desk.");
  });
});

describe("canApplyLiveChange", () => {
  it("refreshes when the screen is free and someone is looking", () => {
    expect(canApplyLiveChange({ paused: false, hidden: false })).toBe(true);
  });

  it("holds while a row is being edited, so nothing moves under the typing", () => {
    expect(canApplyLiveChange({ paused: true, hidden: false })).toBe(false);
  });

  it("holds while the tab is in the background, and catches up on return", () => {
    expect(canApplyLiveChange({ paused: false, hidden: true })).toBe(false);
  });

  it("holds when both are true", () => {
    expect(canApplyLiveChange({ paused: true, hidden: true })).toBe(false);
  });
});

describe("APPOINTMENT_QUERY_KEYS", () => {
  /**
   * The literal keys each clinical screen passes to useQuery. Written out
   * rather than imported, so that renaming a key on a screen without adding it
   * here fails loudly instead of silently going stale again - which is exactly
   * how the reported fault happened.
   */
  const KEYS_IN_USE = [
    ["appointments", "page", 1], // pages/Appointments.tsx
    ["dashboard-appointments", "2026-10-23", "2026-10-24"], // pages/Index.tsx
    ["patient-appointments", "some-patient-id"], // pages/PatientDetail.tsx
    ["procedure-followup-appointments", "some-patient-id"], // ProcedureDetailSheet.tsx
    ["appointment-procedures", "some-appointment-id"], // the visit's prescriptions
  ];

  it("covers every key a screen showing appointments actually uses", () => {
    for (const key of KEYS_IN_USE) {
      expect(APPOINTMENT_QUERY_KEYS).toContain(key[0] as string);
    }
  });

  it("includes the three that were being missed", () => {
    // These are the screens the clinic was reading stale times from.
    expect(APPOINTMENT_QUERY_KEYS).toContain("dashboard-appointments");
    expect(APPOINTMENT_QUERY_KEYS).toContain("patient-appointments");
    expect(APPOINTMENT_QUERY_KEYS).toContain("procedure-followup-appointments");
  });

  it("is more than the one key that used to be invalidated", () => {
    // The whole fault in one assertion.
    expect(APPOINTMENT_QUERY_KEYS.length).toBeGreaterThan(1);
    expect(APPOINTMENT_QUERY_KEYS[0]).toBe("appointments");
  });

  it("names each key once", () => {
    expect(new Set(APPOINTMENT_QUERY_KEYS).size).toBe(APPOINTMENT_QUERY_KEYS.length);
  });
});
