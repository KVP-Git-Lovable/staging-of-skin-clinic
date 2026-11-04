import { describe, it, expect } from "vitest";
import { invoiceCanBeSaved, invoiceFormHasContent } from "./invoiceFormState";

// The shape Billing's create form is reset to: one blank service line.
const blank = { serviceInputs: [{ name: "", price: 0 }], pharmaItemCount: 0, paidAmount: 0, notes: "" };

describe("invoiceFormHasContent", () => {
  it("treats a freshly reset form as empty", () => {
    expect(invoiceFormHasContent(blank)).toBe(false);
  });

  it("treats an entirely absent form as empty", () => {
    expect(invoiceFormHasContent({})).toBe(false);
  });

  it("counts a chosen patient, even with no lines yet", () => {
    expect(invoiceFormHasContent({ ...blank, patientId: "p1" })).toBe(true);
  });

  it("counts a chosen doctor", () => {
    expect(invoiceFormHasContent({ ...blank, doctorId: "d1" })).toBe(true);
  });

  it("counts a named service line", () => {
    expect(invoiceFormHasContent({ ...blank, serviceInputs: [{ name: "Needling", price: 0 }] })).toBe(true);
  });

  it("counts a priced line that has no name yet", () => {
    expect(invoiceFormHasContent({ ...blank, serviceInputs: [{ name: "", price: 1500 }] })).toBe(true);
  });

  it("ignores a service line holding only whitespace", () => {
    expect(invoiceFormHasContent({ ...blank, serviceInputs: [{ name: "   ", price: 0 }] })).toBe(false);
  });

  it("counts pharmacy lines", () => {
    expect(invoiceFormHasContent({ ...blank, pharmaItemCount: 2 })).toBe(true);
  });

  it("counts an amount already collected", () => {
    expect(invoiceFormHasContent({ ...blank, paidAmount: 500 })).toBe(true);
  });

  it("counts typed notes but not whitespace", () => {
    expect(invoiceFormHasContent({ ...blank, notes: "cash at counter" })).toBe(true);
    expect(invoiceFormHasContent({ ...blank, notes: "  \n " })).toBe(false);
  });

  it("survives malformed rows rather than throwing", () => {
    expect(invoiceFormHasContent({ serviceInputs: [null as never, undefined as never] })).toBe(false);
    expect(invoiceFormHasContent({ paidAmount: Number.NaN, pharmaItemCount: Number.NaN })).toBe(false);
  });
});

describe("invoiceCanBeSaved", () => {
  const billed = { hasLineItems: true, amountIsPositive: true, billedBy: "Anusha" };

  it("refuses a bill with no patient, however complete it otherwise is", () => {
    // INV-49097 and INV-49323 went in this way: services, an amount, and no
    // patient. Both showed in Billing and on neither patient's Invoices tab.
    expect(invoiceCanBeSaved({ ...billed, patientId: "" })).toBe(false);
    expect(invoiceCanBeSaved({ ...billed, patientId: null })).toBe(false);
    expect(invoiceCanBeSaved({ ...billed, patientId: undefined })).toBe(false);
    expect(invoiceCanBeSaved({ ...billed, patientId: "   " })).toBe(false);
  });

  it("allows it once the patient is chosen", () => {
    expect(invoiceCanBeSaved({ ...billed, patientId: "pat-1" })).toBe(true);
  });

  it("refuses a bill nobody has put their name to", () => {
    // Three people share the billing machine and the login, so a bill with
    // nobody against it cannot be traced back to whoever raised it.
    const withPatient = { ...billed, patientId: "pat-1" };
    expect(invoiceCanBeSaved({ ...withPatient, billedBy: "" })).toBe(false);
    expect(invoiceCanBeSaved({ ...withPatient, billedBy: null })).toBe(false);
    expect(invoiceCanBeSaved({ ...withPatient, billedBy: undefined })).toBe(false);
    expect(invoiceCanBeSaved({ ...withPatient, billedBy: "   " })).toBe(false);
  });

  it("allows it once somebody has put their name to it", () => {
    expect(invoiceCanBeSaved({ ...billed, patientId: "pat-1", billedBy: "Dorothy" })).toBe(true);
  });

  it("still refuses an empty bill, patient or not", () => {
    expect(invoiceCanBeSaved({ patientId: "pat-1", hasLineItems: false, amountIsPositive: true })).toBe(false);
    expect(invoiceCanBeSaved({ patientId: "pat-1", hasLineItems: true, amountIsPositive: false })).toBe(false);
  });
});
