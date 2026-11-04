import { describe, it, expect } from "vitest";
import { amountBeforeGst, totalWithGst, gstAmount, gstRate, gstRateLabel, gstRatesCharged } from "./invoiceGst";

/** Real bills from the clinic's own data. Numerics arrive as strings. */
const NO_GST = { total_amount: "850.00", tax_amount: null, tax_rate: null };

/** INV-49372: Rs 10,900 of treatment, all of it cosmetic, 5%. */
const FLAT_5 = {
  total_amount: "11445.00",
  tax_amount: "545",
  tax_rate: null,
  line_items: [{ qty: 1, price: 10900, gst: 5, hsn: "999722" }],
};

/**
 * INV-49277: Rs 6,000 + Rs 18,400 of medical treatment, exempt, and Rs 50,400
 * of cosmetic treatment at 5%. The report called this 3.37%.
 */
const MIXED_EXEMPT = {
  total_amount: "77320.00",
  tax_amount: "2520",
  tax_rate: null,
  line_items: [
    { qty: 1, price: 6000, gst: 0, hsn: "999319" },
    { qty: 1, price: 18400, gst: 0, hsn: "999319" },
    { qty: 1, price: 50400, gst: 5, hsn: "999722" },
  ],
};

/** A consultation, a cosmetic treatment at 5% and a product at 18%. */
const TWO_RATES = {
  total_amount: "13540.00",
  tax_amount: "1040",
  tax_rate: null,
  line_items: [
    { qty: 1, price: 500, gst: 0, hsn: "9993" },
    { qty: 1, price: 10000, gst: 5, hsn: "999722" },
    { qty: 1, price: 3000, gst: 18, hsn: "9997" },
  ],
};

/** Salesforce history: a total and a tax, no line snapshot, a recorded rate. */
const IMPORTED_5 = { total_amount: "2940.00", tax_amount: "140", tax_rate: "5" };

/** The importer stores 0 on a mixed bill, meaning "no single rate". */
const IMPORTED_MIXED = { total_amount: "9775.00", tax_amount: "125", tax_rate: "0" };

describe("amountBeforeGst", () => {
  it("is the total less the GST on it", () => {
    expect(amountBeforeGst(FLAT_5)).toBe(10900);
    expect(amountBeforeGst(IMPORTED_5)).toBe(2800);
  });

  it("is the total itself when no GST was charged", () => {
    expect(amountBeforeGst(NO_GST)).toBe(850);
  });

  it("always adds back up to the total, so nothing is lost", () => {
    for (const row of [FLAT_5, MIXED_EXEMPT, TWO_RATES, IMPORTED_5, IMPORTED_MIXED, NO_GST]) {
      expect(amountBeforeGst(row) + gstAmount(row)).toBeCloseTo(totalWithGst(row), 2);
    }
  });

  it("reads a missing row as nothing rather than throwing", () => {
    expect(amountBeforeGst(null)).toBe(0);
    expect(amountBeforeGst({})).toBe(0);
  });
});

describe("totalWithGst", () => {
  it("is the bill's own total, untouched", () => {
    expect(totalWithGst(FLAT_5)).toBe(11445);
    expect(totalWithGst(NO_GST)).toBe(850);
  });
});

describe("gstRatesCharged", () => {
  it("reads the rate off the lines it was charged on", () => {
    expect(gstRatesCharged(FLAT_5)).toEqual([5]);
    expect(gstRatesCharged(MIXED_EXEMPT)).toEqual([5]);
    expect(gstRatesCharged(TWO_RATES)).toEqual([5, 18]);
  });

  it("ignores a snapshot that cannot account for the GST on the bill", () => {
    expect(gstRatesCharged({ total_amount: "1000", tax_amount: "90", line_items: [{ qty: 1, price: 910, gst: 5 }] }))
      .toEqual([]);
  });

  it("is empty for a bill with no GST and for one with no lines", () => {
    expect(gstRatesCharged(NO_GST)).toEqual([]);
    expect(gstRatesCharged(IMPORTED_5)).toEqual([]);
  });
});

describe("gstRate", () => {
  it("is the rate the taxed part of the bill was charged at", () => {
    expect(gstRate(FLAT_5)).toBe(5);
    // The whole point: Rs 2,520 on a Rs 74,800 bill is 5% of what was taxed,
    // not the 3.37% that dividing by the whole bill produces.
    expect(gstRate(MIXED_EXEMPT)).toBe(5);
  });

  it("gives no single rate when the bill carries two", () => {
    expect(gstRate(TWO_RATES)).toBeNull();
  });

  it("falls back to the recorded rate where there is no line snapshot", () => {
    expect(gstRate(IMPORTED_5)).toBe(5);
  });

  it("treats an imported 0 as 'mixed', never as a reason to invent a rate", () => {
    // The importer writes 0 on a mixed bill on purpose. Dividing Rs 125 by
    // Rs 9,650 used to turn that into "1.3%".
    expect(gstRate(IMPORTED_MIXED)).toBeNull();
  });

  it("is nothing at all for a bill with no GST", () => {
    expect(gstRate(NO_GST)).toBeNull();
    expect(gstRate({ total_amount: "500", tax_amount: "0", tax_rate: "5" })).toBeNull();
  });
});

describe("gstRateLabel", () => {
  it("reads as a plain percentage", () => {
    expect(gstRateLabel(FLAT_5)).toBe("5%");
    expect(gstRateLabel(IMPORTED_5)).toBe("5%");
  });

  it("names both rates when a bill carries two", () => {
    expect(gstRateLabel(TWO_RATES)).toBe("5% + 18%");
  });

  it("never shows a rate nobody charged", () => {
    // 3.35%, 3.36%, 3.37% - the figures the clinic asked about.
    for (const row of [MIXED_EXEMPT, TWO_RATES, IMPORTED_MIXED]) {
      expect(gstRateLabel(row) ?? "").not.toMatch(/3\.3/);
    }
  });

  it("is blank rather than a guess where nothing recorded the rate", () => {
    expect(gstRateLabel(IMPORTED_MIXED)).toBeNull();
    expect(gstRateLabel(NO_GST)).toBeNull();
  });
});

describe("gstAmount", () => {
  it("is the GST the bill carries, so a row can be reconciled by hand", () => {
    expect(gstAmount(MIXED_EXEMPT)).toBe(2520);
    expect(gstAmount(NO_GST)).toBe(0);
  });
});

describe("bills whose lines record the HSN but not the rate", () => {
  /** INV-49294: every line's gst is 0, but the cosmetic line was charged 5%. */
  const HSN_ONLY = {
    total_amount: "36585.00",
    tax_amount: "1185",
    tax_rate: null,
    line_items: [
      { qty: 1, price: 850, gst: 0, hsn: "999319" },
      { qty: 1, price: 6100, gst: 0, hsn: "999319" },
      { qty: 1, price: 4750, gst: 0, hsn: "999319" },
      { qty: 1, price: 23700, gst: 0, hsn: "999722" },
    ],
  };

  it("works the rate back from the lines that were taxable", () => {
    // Rs 1,185 is 5% of the Rs 23,700 cosmetic line. The report showed 3.35%.
    expect(gstRate(HSN_ONLY)).toBe(5);
    expect(gstRateLabel(HSN_ONLY)).toBe("5%");
  });

  it("claims nothing when two different rates could equally explain the GST", () => {
    // Rs 90 is 5% of the Rs 1,800 group and 18% of the Rs 500 one. Either
    // reading is a guess, so neither is offered.
    const ambiguous = {
      total_amount: "2390",
      tax_amount: "90",
      tax_rate: null,
      line_items: [
        { qty: 1, price: 1800, gst: 0, hsn: "A" },
        { qty: 1, price: 500, gst: 0, hsn: "B" },
      ],
    };
    expect(gstRateLabel(ambiguous)).toBeNull();
  });

  it("is content when two groups point at the same rate", () => {
    // Whichever group was taxed, the rate was 5%.
    const agreed = {
      total_amount: "4100",
      tax_amount: "100",
      tax_rate: null,
      line_items: [
        { qty: 1, price: 2000, gst: 0, hsn: "A" },
        { qty: 1, price: 2000, gst: 0, hsn: "B" },
      ],
    };
    expect(gstRateLabel(agreed)).toBe("5%");
  });

  it("claims nothing when the GST is not a slab on any group", () => {
    const odd = {
      total_amount: "1000",
      tax_amount: "77",
      tax_rate: null,
      line_items: [{ qty: 1, price: 900, gst: 0, hsn: "A" }],
    };
    expect(gstRateLabel(odd)).toBeNull();
  });
});
