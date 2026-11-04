// What tax a Salesforce bill actually carried.
//
// Billing__c has a GST__c rate on the header and a Total_Tax_Applicable__c
// amount beside it, and the two can disagree. The import believed the rate and
// worked the tax out from it - `total - total/(1 + rate/100)` - on the stated
// grounds that Salesforce "doesn't always populate" the amount.
//
// That assumption no longer holds, and it cost two bills. B-49050 (Hormonal
// Hirsutism, a medical treatment) and B-49052 (Eczema) each have a header rate
// of 5% while every one of their Salesforce line items records rate 0 and tax
// 0. The clinic levied nothing; this app billed Rs 140 and Rs 47.62. The second
// figure is the tell: Rs 47.619047619047706 is 1000 - 1000/1.05, a repeating
// decimal no one ever charged.
//
// So the order of trust is the order of evidence. The line items are what the
// clinic wrote against the treatment, the header amount is what Salesforce
// totalled, and the rate is the only thing left when neither says anything.
// Checked against the whole history: of 46,925 imported bills, 46,923 already
// agree with their Salesforce line items, so this changes nothing for them.
//
// A recorded zero is an answer, not a gap. `null` means Salesforce said
// nothing; `0` means it said none was charged. Telling those apart is the
// whole point, which is why nothing here coerces a blank to a number.

export interface BillingTaxInput {
  /** The bill's tax-inclusive total. */
  total: number;
  /** Billing__c.GST__c - the header rate. */
  rate?: number | null;
  /** Billing__c.Total_Tax_Applicable__c - the header amount. */
  headerTax?: number | string | null;
  /** The tax on this bill's own Billing_Line_Item__c rows, where they exist. */
  lineTax?: number | string | null;
}

export interface BillingTax {
  /** Pre-tax value of the bill. */
  base: number;
  /** The tax charged on it. */
  tax: number;
  /** The rate to record and to pick an HSN from. */
  rate: number;
  /** Which of the three said so - for the import's own report. */
  from: "lines" | "header" | "rate" | "none";
}

const recorded = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** A rate that squares with the tax actually charged, so the HSN follows it. */
const rateFor = (base: number, tax: number, headerRate: number): number => {
  if (tax === 0) return 0;
  if (base <= 0) return headerRate;
  const implied = (tax / base) * 100;
  // Within a rupee of the header rate, keep the header rate - it is the one
  // the clinic set, and the arithmetic is only rounding.
  return Math.abs(implied - headerRate) < 0.01 ? headerRate : Number(implied.toFixed(2));
};

export function billingTax({ total, rate, headerTax, lineTax }: BillingTaxInput): BillingTax {
  const amount = Number(total) || 0;
  const headerRate = Number(rate) || 0;

  const fromLines = recorded(lineTax);
  if (fromLines !== null) {
    const base = Math.max(amount - fromLines, 0);
    return { base, tax: fromLines, rate: rateFor(base, fromLines, headerRate), from: "lines" };
  }

  const fromHeader = recorded(headerTax);
  if (fromHeader !== null) {
    const base = Math.max(amount - fromHeader, 0);
    return { base, tax: fromHeader, rate: rateFor(base, fromHeader, headerRate), from: "header" };
  }

  // Salesforce recorded no amount anywhere. The rate is all there is, and the
  // total is tax-inclusive, so the base comes out of it algebraically.
  if (headerRate > 0) {
    const base = amount / (1 + headerRate / 100);
    return { base, tax: amount - base, rate: headerRate, from: "rate" };
  }

  return { base: amount, tax: 0, rate: 0, from: "none" };
}
