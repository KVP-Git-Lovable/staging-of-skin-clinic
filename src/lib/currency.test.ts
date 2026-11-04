import { describe, it, expect, afterEach } from "vitest";
import {
  DEFAULT_CURRENCY_SETTINGS,
  formatAmountExact,
  formatMoney,
  formatMoneyCompact,
  formatMoneyExact,
  formatNumber,
  setCurrencySettingsCache,
  formatMoneyPrecise,
} from "./currency";

afterEach(() => setCurrencySettingsCache(DEFAULT_CURRENCY_SETTINGS));

describe("formatMoneyExact", () => {
  it("shows every digit of a figure the other two shorten", () => {
    // The report cards read "Rs 1.95 L", which nobody can reconcile against a
    // bank statement or the cash drawer.
    expect(formatMoneyCompact(194800)).toBe("₹1.95 L");
    expect(formatMoneyExact(194800)).toBe("₹1,94,800");
  });

  it("groups the Indian way", () => {
    expect(formatMoneyExact(15650)).toBe("₹15,650");
    expect(formatMoneyExact(10900)).toBe("₹10,900");
    expect(formatMoneyExact(12345678)).toBe("₹1,23,45,678");
  });

  it("stays exact even when the clinic has turned abbreviation on", () => {
    // This is the case formatMoney gets wrong: it routes through formatNumber,
    // which honours the setting. A card asked to be exact has to be exact.
    setCurrencySettingsCache({ ...DEFAULT_CURRENCY_SETTINGS, abbreviate: true });
    expect(formatNumber(194800)).toBe("1.95 L");
    expect(formatMoney(194800)).toBe("₹1.95 L");
    expect(formatMoneyExact(194800)).toBe("₹1,94,800");
  });

  it("follows the configured symbol and number style", () => {
    setCurrencySettingsCache({ ...DEFAULT_CURRENCY_SETTINGS, symbol: "$", number_style: "us" });
    expect(formatMoneyExact(194800)).toBe("$194,800");
  });

  it("follows the decimals setting", () => {
    setCurrencySettingsCache({ ...DEFAULT_CURRENCY_SETTINGS, show_decimals: true, decimal_digits: 2 });
    expect(formatMoneyExact(13045)).toBe("₹13,045.00");
    expect(formatMoneyExact(850.5)).toBe("₹850.50");
  });

  it("clamps an absurd decimal_digits rather than throwing", () => {
    setCurrencySettingsCache({ ...DEFAULT_CURRENCY_SETTINGS, show_decimals: true, decimal_digits: 99 });
    expect(() => formatMoneyExact(850)).not.toThrow();
  });

  it("reads a numeric string, as the invoice rows hand it over", () => {
    expect(formatMoneyExact("194800")).toBe("₹1,94,800");
  });

  it("gives zero, not a dash, for nothing", () => {
    expect(formatMoneyExact(null)).toBe("₹0");
    expect(formatMoneyExact(undefined)).toBe("₹0");
    expect(formatMoneyExact("not a number")).toBe("₹0");
    expect(formatMoneyExact(0)).toBe("₹0");
  });

  it("keeps a negative readable", () => {
    expect(formatMoneyExact(-2000)).toBe("-₹2,000");
  });
});

describe("formatMoneyExact - paise, only when there are paise", () => {
  it("shows the half-rupee that made the report disagree with Salesforce", () => {
    // 21 September took Rs 1,66,322.50. Rounded to whole rupees the report read
    // Rs 1,66,323 and Salesforce read Rs 1,66,322 - the same half-rupee rounded
    // in opposite directions, on a figure the clinic reconciles daily.
    expect(formatMoneyExact(166322.5)).toBe("₹1,66,322.50");
  });

  it("leaves a whole amount whole, which is what the setting was chosen for", () => {
    expect(formatMoneyExact(166322)).toBe("₹1,66,322");
    expect(formatMoneyExact(4200)).toBe("₹4,200");
    expect(formatMoneyExact(0)).toBe("₹0");
  });

  it("does not read floating-point drift in a summed column as a whole rupee", () => {
    // Summing numerics lands just under; this is still a half-rupee.
    expect(formatMoneyExact(166322.49999999)).toBe("₹1,66,322.50");
    // And drift just above a whole amount is still whole.
    expect(formatMoneyExact(4200.0000001)).toBe("₹4,200");
  });

  it("shows paise on a negative too, sign outside the symbol", () => {
    expect(formatMoneyExact(-166322.5)).toBe("-₹1,66,322.50");
  });

  it("still obeys an explicit decimals setting rather than second-guessing it", () => {
    setCurrencySettingsCache({ ...DEFAULT_CURRENCY_SETTINGS, show_decimals: true, decimal_digits: 2 });
    expect(formatMoneyExact(166322)).toBe("₹1,66,322.00");
  });

  it("rounds to paise, never inventing a third decimal", () => {
    expect(formatMoneyExact(95.238095)).toBe("₹95.24");
  });
});

describe("the other formatters are unchanged by the shared grouping helper", () => {
  it("formatNumber still groups and still dashes on nothing", () => {
    expect(formatNumber(1234567)).toBe("12,34,567");
    expect(formatNumber(null)).toBe("—");
  });

  it("formatNumber still abbreviates only when asked to", () => {
    expect(formatNumber(194800)).toBe("1,94,800");
    setCurrencySettingsCache({ ...DEFAULT_CURRENCY_SETTINGS, abbreviate: true });
    expect(formatNumber(194800)).toBe("1.95 L");
  });

  it("formatMoneyCompact still shortens above a lakh and not below", () => {
    expect(formatMoneyCompact(99999)).toBe("₹99,999");
    expect(formatMoneyCompact(100000)).toBe("₹1.00 L");
    expect(formatMoneyCompact(12345678)).toBe("₹1.23 Cr");
  });
});

describe("formatMoneyPrecise", () => {
  it("keeps two decimals even when the clinic has chosen whole rupees", () => {
    setCurrencySettingsCache({ symbol: "₹", show_decimals: false, decimal_digits: 2, number_style: "indian", abbreviate: false });
    // The exact case that made the screen and the PDF disagree: a ₹4,000 bill
    // at 5% inclusive splits ₹3,809.52 + ₹190.48, and CGST/SGST are ₹95.24 each.
    expect(formatMoneyPrecise(3809.523809523809)).toBe("₹3,809.52");
    expect(formatMoneyPrecise(95.23809523809541)).toBe("₹95.24");
    expect(formatMoneyPrecise(4000)).toBe("₹4,000.00");
  });

  it("never abbreviates, so a large bill stays reconcilable", () => {
    setCurrencySettingsCache({ symbol: "₹", show_decimals: false, decimal_digits: 2, number_style: "indian", abbreviate: true });
    expect(formatMoneyPrecise(250000)).toBe("₹2,50,000.00");
  });

  it("puts the sign outside the symbol and handles a missing value", () => {
    setCurrencySettingsCache({ symbol: "₹", show_decimals: false, decimal_digits: 2, number_style: "indian", abbreviate: false });
    expect(formatMoneyPrecise(-2000)).toBe("-₹2,000.00");
    expect(formatMoneyPrecise(null)).toBe("₹0.00");
  });
});

describe("formatAmountExact - the report PDF's cells", () => {
  it("prints the same figure as formatMoneyExact, without the symbol", () => {
    // reportColumnHeader already puts "(Rs)" in the heading.
    expect(formatAmountExact(334000)).toBe("3,34,000");
    expect(formatAmountExact(334000)).toBe(formatMoneyExact(334000).replace("₹", ""));
  });

  it("keeps the paise that made a report disagree with its own total", () => {
    expect(formatAmountExact(9922.5)).toBe("9,922.50");
    expect(formatAmountExact(4987.5)).toBe("4,987.50");
  });

  it("leaves a whole amount whole", () => {
    expect(formatAmountExact(850)).toBe("850");
  });

  it("never abbreviates, whatever the setting says", () => {
    setCurrencySettingsCache({ ...DEFAULT_CURRENCY_SETTINGS, abbreviate: true });
    expect(formatAmountExact(334000)).toBe("3,34,000");
  });

  it("puts the sign in front and gives zero for nothing", () => {
    expect(formatAmountExact(-2000)).toBe("-2,000");
    expect(formatAmountExact(null)).toBe("0");
    expect(formatAmountExact("not a number")).toBe("0");
  });
});
