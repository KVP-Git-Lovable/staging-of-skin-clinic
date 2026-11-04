import { describe, it, expect, vi } from "vitest";
import { resolveInvoiceAppointmentId } from "./invoiceAppointmentLink";

const DAY = new Date(2026, 8, 30);
const DR_ASHWINI = "6d2329a5-4055-42f3-8bb9-77a81b30fb15";
const BOBBYS_VISIT = { id: "284e3648", start_time: "2026-09-30T17:55:00", staff_id: DR_ASHWINI };

describe("resolveInvoiceAppointmentId", () => {
  it("links the visit the form never managed to load", async () => {
    // The race that lost Bobby's link: the picker was still empty at save.
    const load = vi.fn().mockResolvedValue([BOBBYS_VISIT]);
    await expect(
      resolveInvoiceAppointmentId({
        explicitChoice: undefined,
        formValue: "",
        patientId: "d54296b2",
        invoiceDate: DAY,
        doctorId: DR_ASHWINI,
        loadAppointments: load,
      }),
    ).resolves.toBe("284e3648");
    expect(load).toHaveBeenCalledWith("d54296b2");
  });

  it("respects a deliberate Not linked and does not go looking", async () => {
    const load = vi.fn();
    await expect(
      resolveInvoiceAppointmentId({
        explicitChoice: "",
        formValue: "",
        patientId: "d54296b2",
        invoiceDate: DAY,
        doctorId: DR_ASHWINI,
        loadAppointments: load,
      }),
    ).resolves.toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it("keeps what the form already shows, without a second query", async () => {
    const load = vi.fn();
    await expect(
      resolveInvoiceAppointmentId({
        explicitChoice: undefined,
        formValue: "chosen-visit",
        patientId: "d54296b2",
        invoiceDate: DAY,
        doctorId: null,
        loadAppointments: load,
      }),
    ).resolves.toBe("chosen-visit");
    expect(load).not.toHaveBeenCalled();
  });

  it("stays unlinked when the day is ambiguous, as the rule always did", async () => {
    const load = vi.fn().mockResolvedValue([
      BOBBYS_VISIT,
      { id: "second", start_time: "2026-09-30T19:00:00", staff_id: "someone-else" },
    ]);
    await expect(
      resolveInvoiceAppointmentId({
        explicitChoice: undefined,
        formValue: "",
        patientId: "d54296b2",
        invoiceDate: DAY,
        doctorId: null,
        loadAppointments: load,
      }),
    ).resolves.toBeNull();
  });

  it("saves the bill anyway when the lookup fails", async () => {
    const load = vi.fn().mockRejectedValue(new Error("network"));
    await expect(
      resolveInvoiceAppointmentId({
        explicitChoice: undefined,
        formValue: "",
        patientId: "d54296b2",
        invoiceDate: DAY,
        doctorId: null,
        loadAppointments: load,
      }),
    ).resolves.toBeNull();
  });

  it("has nothing to link when no patient is selected", async () => {
    const load = vi.fn();
    await expect(
      resolveInvoiceAppointmentId({
        explicitChoice: undefined,
        formValue: "",
        patientId: "",
        invoiceDate: DAY,
        doctorId: null,
        loadAppointments: load,
      }),
    ).resolves.toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
});
