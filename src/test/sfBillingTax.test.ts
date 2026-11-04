import { describe, it, expect } from "vitest";
import { billingTax } from "../../supabase/functions/sf-import-clinical/billingTax";

/**
 * B-49050 and B-49052 arrived taxed when the clinic had levied nothing: the
 * Billing__c header said 5% while every Salesforce line item on them said 0.
 * The import believed the header and worked the tax out from it.
 */

describe("billingTax", () => {
  it("believes the line items over a header rate that contradicts them", () => {
    // B-49050: Rs 2,940, header 5%, lines say no tax at all.
    expect(billingTax({ total: 2940, rate: 5, headerTax: 0, lineTax: 0 })).toEqual({
      base: 2940, tax: 0, rate: 0, from: "lines",
    });
  });

  it("stops the repeating decimal that gave this away", () => {
    // B-49052 was billed Rs 47.619047619047706 - 1000 - 1000/1.05.
    const out = billingTax({ total: 1000, rate: 5, headerTax: 0, lineTax: 0 });
    expect(out.tax).toBe(0);
    expect(out.base).toBe(1000);
  });

  it("leaves a genuinely taxed bill exactly as it was", () => {
    // The 46,923 that already agree: 5% on a 1,050 inclusive total.
    const out = billingTax({ total: 1050, rate: 5, headerTax: 50, lineTax: 50 });
    expect(out.tax).toBe(50);
    expect(out.base).toBe(1000);
    expect(out.rate).toBe(5);
  });

  it("falls back to the header amount when there are no line items", () => {
    expect(billingTax({ total: 1050, rate: 5, headerTax: 50, lineTax: null })).toEqual({
      base: 1000, tax: 50, rate: 5, from: "header",
    });
  });

  it("works it out from the rate only when Salesforce recorded no amount at all", () => {
    const out = billingTax({ total: 1050, rate: 5, headerTax: null, lineTax: null });
    expect(out.from).toBe("rate");
    expect(out.tax).toBeCloseTo(50, 2);
    expect(out.base).toBeCloseTo(1000, 2);
  });

  it("tells a recorded nil apart from nothing recorded", () => {
    // This is the whole distinction. A blank is a gap; a zero is an answer.
    expect(billingTax({ total: 1050, rate: 5, headerTax: 0, lineTax: null }).tax).toBe(0);
    expect(billingTax({ total: 1050, rate: 5, headerTax: "", lineTax: null }).from).toBe("rate");
    expect(billingTax({ total: 1050, rate: 5, headerTax: null, lineTax: 0 }).tax).toBe(0);
  });

  it("reports the rate the tax actually came to, so the HSN follows the money", () => {
    // Lines say 50 on a 1,050 bill while the header claims 18%. The line is
    // right, and 5% is what it works out at - an 18% HSN would be a wrong
    // code on a tax invoice.
    expect(billingTax({ total: 1050, rate: 18, headerTax: null, lineTax: 50 }).rate).toBe(5);
  });

  it("keeps the clinic's own rate when the arithmetic only rounds", () => {
    expect(billingTax({ total: 2100, rate: 5, headerTax: null, lineTax: 100 }).rate).toBe(5);
  });

  it("charges nothing on a bill with no rate and no figure", () => {
    expect(billingTax({ total: 800, rate: 0, headerTax: null, lineTax: null })).toEqual({
      base: 800, tax: 0, rate: 0, from: "none",
    });
  });

  it("never returns a negative base, whatever Salesforce says", () => {
    expect(billingTax({ total: 100, rate: 0, headerTax: 500, lineTax: null }).base).toBe(0);
  });
});
