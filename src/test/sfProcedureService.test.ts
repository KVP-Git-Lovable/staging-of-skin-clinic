import { describe, it, expect } from "vitest";
import {
  procedureServiceName,
  awaitingRealService,
  NO_SERVICE_RECORDED,
  investigationAddsDetail,
} from "../../supabase/functions/sf-import-clinical/serviceName";

/**
 * The Procedures list showed "Walk-In" in its Service column because the import
 * fell back to Type_Of_Appointment__c, a visit-type picklist, when no treatment
 * had been recorded yet.
 */

describe("procedureServiceName", () => {
  it("never uses the visit type as a service, which is what put Walk-In in the column", () => {
    const d = { Type_Of_Appointment__c: "Walk-In", Visit_type__c: "Walk-In" };
    expect(procedureServiceName(d)).toBe(NO_SERVICE_RECORDED);
    expect(procedureServiceName(d)).not.toBe("Walk-In");
  });

  it("prefers the recorded treatment, with semicolons read as a list", () => {
    expect(procedureServiceName({ Treatment__c: "Photofractional;Face Hair Reduction" }))
      .toBe("Photofractional, Face Hair Reduction");
  });

  it("falls back through procedure type, service type, billing, then appointment", () => {
    expect(procedureServiceName({ Procedure_Type__c: "Chemical Peel" })).toBe("Chemical Peel");
    expect(procedureServiceName({ Service_Type__c: "Laser" })).toBe("Laser");
    expect(procedureServiceName({}, "Hydrafacial")).toBe("Hydrafacial");
    expect(procedureServiceName({}, null, "Acne Consultation")).toBe("Acne Consultation");
  });

  it("keeps the treatment ahead of the visit type even when both are present", () => {
    expect(procedureServiceName({ Treatment__c: "Microneedling", Type_Of_Appointment__c: "Walk-In" }))
      .toBe("Microneedling");
  });

  it("ignores whitespace-only Salesforce values rather than showing a blank service", () => {
    expect(procedureServiceName({ Treatment__c: "   ", Procedure_Type__c: "  " })).toBe(NO_SERVICE_RECORDED);
  });
});

describe("awaitingRealService", () => {
  const d = { Type_Of_Appointment__c: "Walk-In", Visit_type__c: "Online" };

  it("treats the visit type an older import wrote as replaceable", () => {
    expect(awaitingRealService("Walk-In", d)).toBe(true);
    expect(awaitingRealService("walk-in", d)).toBe(true); // casing differs between SF and the app
    expect(awaitingRealService("Online", d)).toBe(true);
  });

  it("treats the placeholder and an empty value as replaceable", () => {
    expect(awaitingRealService(NO_SERVICE_RECORDED, d)).toBe(true);
    expect(awaitingRealService("", d)).toBe(true);
    expect(awaitingRealService(null, d)).toBe(true);
  });

  it("never overwrites a real service, however it got there", () => {
    // This is the guard that stops a re-sync destroying clinical work.
    expect(awaitingRealService("Photofractional Treatment", d)).toBe(false);
    expect(awaitingRealService("Chemical Peel", d)).toBe(false);
  });

  it("does not treat a service as replaceable just because some other row's visit type matches", () => {
    expect(awaitingRealService("Walk-In", { Type_Of_Appointment__c: null, Visit_type__c: null })).toBe(false);
  });
});

/**
 * A prescription showed "Consultation" while Salesforce showed
 * "Review + 3rx Peel B last session on 17/06/2026". 1,244 prescriptions across
 * 974 patients were hiding treatment detail behind the placeholder.
 */
describe("investigationAddsDetail", () => {
  it("is false for a plain visit marker, which Consultation renders faithfully", () => {
    for (const raw of ["New Consult", "Old consult", "new consult", "Review", "review", "Consultation", "New Consult "]) {
      expect(investigationAddsDetail(raw)).toBe(false);
    }
  });

  it("is true when the text names an actual treatment", () => {
    for (const raw of [
      "New consult + RF",
      "Review+ 1rx Peel B",
      "2rx Peel B last session on 14/05/2026",
      "consullt + Hydra facial+4rx underarms",
      "PORE REFINING",
    ]) {
      expect(investigationAddsDetail(raw)).toBe(true);
    }
  });

  it("is false for nothing at all, so a blank never becomes a service name", () => {
    expect(investigationAddsDetail("")).toBe(false);
    expect(investigationAddsDetail(null)).toBe(false);
    expect(investigationAddsDetail("  + - ")).toBe(false);
  });
});
