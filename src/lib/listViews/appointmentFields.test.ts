import { describe, it, expect } from "vitest";
import {
  APPOINTMENT_VIEW_FIELDS,
  DEFAULT_APPOINTMENT_VIEW_COLUMNS,
  withoutBillingFields,
  withoutBillingConditions,
} from "./appointmentFields";

describe("withoutBillingFields", () => {
  it("removes bill and payment_mode from a field list, keeping order", () => {
    const keys = withoutBillingFields(APPOINTMENT_VIEW_FIELDS).map((f) => f.key);
    expect(keys).toEqual(["patient", "phone", "doctor", "start_time", "service", "status", "therapist"]);
  });

  it("removes them from a column-key list", () => {
    expect(withoutBillingFields(DEFAULT_APPOINTMENT_VIEW_COLUMNS)).toEqual([
      "patient", "phone", "doctor", "start_time", "service", "status",
    ]);
  });

  it("leaves a list with no money fields unchanged", () => {
    expect(withoutBillingFields(["patient", "status"])).toEqual(["patient", "status"]);
  });
});

describe("withoutBillingConditions", () => {
  it("drops only conditions on money fields", () => {
    const out = withoutBillingConditions({
      match: "all",
      conditions: [
        { field: "bill", operator: "gt", value: "1" },
        { field: "status", operator: "eq", value: "x" },
        { field: "payment_mode", operator: "eq", value: "UPI" },
      ],
    });
    expect(out.match).toBe("all");
    expect(out.conditions.map((c) => c.field)).toEqual(["status"]);
  });
});
