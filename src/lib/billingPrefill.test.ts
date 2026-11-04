import { describe, it, expect } from "vitest";
import { billingPrefillFields, readBillingPrefill } from "./billingPrefill";

/**
 * A doctor records a recommended procedure and the bill opened with it already
 * on, priced from the Service Master. The clinic bills what was actually done.
 */

const fromAVisit = {
  patientId: "pat-1",
  doctorId: "doc-1",
  appointmentId: "appt-1",
  services: ["Laser toning", "Hydra signature"],
  products: [{ name: "Sunscreen", product_id: "prod-1", quantity: 2 }],
};

describe("billingPrefillFields", () => {
  it("never carries a service onto the bill", () => {
    const out = billingPrefillFields(fromAVisit);
    expect(out).not.toHaveProperty("services");
    expect(Object.values(out)).not.toContain("Laser toning");
  });

  it("never carries a prescribed medicine onto the bill", () => {
    expect(billingPrefillFields(fromAVisit)).not.toHaveProperty("products");
  });

  it("keeps the patient, the doctor and the visit the bill belongs to", () => {
    // The appointment link is what stops a paid visit reading "No bill".
    expect(billingPrefillFields(fromAVisit)).toEqual({
      patientId: "pat-1",
      doctorId: "doc-1",
      appointmentId: "appt-1",
    });
  });

  it("passes nothing on rather than something blank", () => {
    expect(billingPrefillFields({ patientId: "  ", doctorId: "" })).toEqual({});
    expect(billingPrefillFields({ patientId: "pat-1" })).toEqual({ patientId: "pat-1" });
  });

  it("ignores a key it was never meant to read, however it is spelled", () => {
    // The point of naming what may pass: a new key on the payload, or a new
    // screen sending one, cannot become a line on somebody's bill.
    const out = billingPrefillFields({
      patientId: "pat-1",
      lineItems: [{ name: "Peel", price: 4000 }],
      serviceInputs: [{ name: "Peel", price: 4000 }],
      amount: 4000,
    });
    expect(out).toEqual({ patientId: "pat-1" });
  });

  it("survives anything that is not a payload", () => {
    for (const junk of [null, undefined, "", 0, "a string", [], true]) {
      expect(billingPrefillFields(junk)).toEqual({});
    }
  });
});

describe("readBillingPrefill", () => {
  it("reads what the visit screens stash", () => {
    expect(readBillingPrefill(JSON.stringify(fromAVisit))).toEqual({
      patientId: "pat-1",
      doctorId: "doc-1",
      appointmentId: "appt-1",
    });
  });

  it("opens an empty form rather than throwing on a half-written entry", () => {
    expect(readBillingPrefill("{not json")).toEqual({});
    expect(readBillingPrefill(null)).toEqual({});
    expect(readBillingPrefill("null")).toEqual({});
  });
});
