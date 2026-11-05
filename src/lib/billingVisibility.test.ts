import { describe, it, expect } from "vitest";
import { canSeeBillingAmounts, mentionsMoney, BILLING_AMOUNTS_KEY } from "./billingVisibility";

describe("mentionsMoney", () => {
  it("flags lines that quote or discuss money", () => {
    for (const s of [
      "Spent ₹45,000 over the last year",
      "Lifetime value is high",
      "Has Rs 12000 outstanding",
      "Pays promptly; invoices settled in full",
      "Responds to discount offers",
      "Total spend is trending up",
      "Billed 3 lakh in 2026",
    ]) {
      expect(mentionsMoney(s), s).toBe(true);
    }
  });

  it("leaves clinical and visit-pattern lines alone", () => {
    for (const s of [
      "Visits roughly every 30 days",
      "Missed two appointments in March",
      "Responds well to laser sessions",
      "Likely to book a follow-up for acne scars",
      "",
    ]) {
      expect(mentionsMoney(s), s).toBe(false);
    }
    expect(mentionsMoney(undefined)).toBe(false);
    expect(mentionsMoney(42)).toBe(false);
  });
});

const perm = (can_view: boolean) => ({ can_view });

describe("canSeeBillingAmounts", () => {
  it("never restricts an administrator, whatever the rows say", () => {
    expect(
      canSeeBillingAmounts({ isAdmin: true, permissions: { [BILLING_AMOUNTS_KEY]: perm(false) } }),
    ).toBe(true);
  });

  it("does not restrict an empty permissions map (not a staff login / still loading)", () => {
    expect(canSeeBillingAmounts({ isAdmin: false, permissions: {} })).toBe(true);
  });

  it("keeps showing money for a role that has no billing_amounts row (every existing role)", () => {
    expect(
      canSeeBillingAmounts({
        isAdmin: false,
        permissions: { patients: perm(true), billing: perm(true), appointments: perm(true) },
      }),
    ).toBe(true);
  });

  it("hides money only when the row is explicitly switched off", () => {
    expect(
      canSeeBillingAmounts({
        isAdmin: false,
        permissions: { patients: perm(true), [BILLING_AMOUNTS_KEY]: perm(false) },
      }),
    ).toBe(false);
  });

  it("shows money when the row is switched on", () => {
    expect(
      canSeeBillingAmounts({
        isAdmin: false,
        permissions: { patients: perm(true), [BILLING_AMOUNTS_KEY]: perm(true) },
      }),
    ).toBe(true);
  });
});
