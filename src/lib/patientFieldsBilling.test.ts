import { describe, expect, it } from "vitest";
import { PATIENT_FIELDS, isBillingPatientField, patientFieldsFor, patientKeysFor } from "./patientFields";

describe("patient billing field helpers", () => {
  it("returns the same list when billing is visible", () => {
    expect(patientFieldsFor(true)).toBe(PATIENT_FIELDS);
    const keys = ["full_name", "lifetime_value"];
    expect(patientKeysFor(true, keys)).toBe(keys);
  });

  it("drops money-revealing fields when restricted", () => {
    const keys = patientFieldsFor(false).map((f) => f.key);
    expect(keys).not.toContain("lifetime_value");
    expect(keys).not.toContain("engagement_tier");
    expect(keys).not.toContain("engagement_revenue_value");
    expect(keys).toContain("total_visits");
    expect(keys).toContain("last_visit_date");
  });

  it("filters column keys and keeps order", () => {
    expect(patientKeysFor(false, ["full_name", "lifetime_value", "status", "engagement_tier"])).toEqual(["full_name", "status"]);
    expect(isBillingPatientField("phone")).toBe(false);
  });
});
