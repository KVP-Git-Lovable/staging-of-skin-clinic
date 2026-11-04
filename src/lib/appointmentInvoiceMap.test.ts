import { describe, it, expect } from "vitest";
import { appointmentInvoiceMap } from "./appointmentInvoiceMap";

const full = new Map([["appt-1", { total_amount: 850, payment_mode: "Cash" }]]);
const page = new Map([["appt-2", { total_amount: 500, payment_mode: "Google Pay" }]]);
const empty = new Map<string, { total_amount: number; payment_mode: string }>();

describe("appointmentInvoiceMap", () => {
  it("reads the whole-table map when a saved view's filters are active", () => {
    // That is the only fetch running in this mode - the paged one is disabled.
    expect(appointmentInvoiceMap(true, full, empty)).toBe(full);
  });

  it("reads the page map otherwise", () => {
    expect(appointmentInvoiceMap(false, empty, page)).toBe(page);
  });

  it("does not hand back an empty map while the other one holds the invoice", () => {
    // The bug: under a custom view the cells read the empty page map, so every
    // Bill Amount and Payment Mode rendered as a dash while the full map had
    // the answer.
    expect(appointmentInvoiceMap(true, full, empty).get("appt-1")?.total_amount).toBe(850);
    expect(appointmentInvoiceMap(false, empty, page).get("appt-2")?.payment_mode).toBe("Google Pay");
  });

  it("never mixes the two", () => {
    expect(appointmentInvoiceMap(true, full, page).get("appt-2")).toBeUndefined();
    expect(appointmentInvoiceMap(false, full, page).get("appt-1")).toBeUndefined();
  });

  it("copes with both being empty", () => {
    expect(appointmentInvoiceMap(true, empty, empty).size).toBe(0);
    expect(appointmentInvoiceMap(false, empty, empty).size).toBe(0);
  });
});
