import { readFileSync } from "node:fs";
import { describe, it, expect, afterEach } from "vitest";
import {
  DEFAULT_CURRENCY_SETTINGS,
  formatAmountExact,
  formatMoney,
  formatMoneyExact,
  formatNumber,
  setCurrencySettingsCache,
  formatMoneyPrecise,
  formatMoneyTile,
} from "./currency";

afterEach(() => setCurrencySettingsCache(DEFAULT_CURRENCY_SETTINGS));

describe("formatMoneyExact", () => {
  it("shows every digit of a figure the other two shorten", () => {
    // The report cards read "Rs 1.95 L", which nobody can reconcile against a
    // bank statement or the cash drawer.
    setCurrencySettingsCache({ ...DEFAULT_CURRENCY_SETTINGS, abbreviate: true });
    expect(formatMoney(194800)).toBe("₹1.95 L");
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

/**
 * The clinic's live settings when this was written: symbol ₹, Indian
 * grouping, show_decimals ON with 2 digits, abbreviate OFF. They had already
 * told the app not to abbreviate, and a patient's Billed figure still read
 * "₹24.8k" - because the card hand-rolled its own `/1000` instead of asking.
 */
const CLINIC = { ...DEFAULT_CURRENCY_SETTINGS, show_decimals: true, decimal_digits: 2 };

describe("formatMoneyTile", () => {
  it("shows the whole figure when the clinic has abbreviation switched OFF", () => {
    // The bug, in one line: this used to render "₹24.8k".
    setCurrencySettingsCache({ ...CLINIC, abbreviate: false });
    expect(formatMoneyTile(24800)).toBe("₹24,800");
  });

  it("shortens only when the clinic asks for it", () => {
    setCurrencySettingsCache({ ...CLINIC, abbreviate: true });
    expect(formatMoneyTile(24800)).toBe("₹24.8K");
    expect(formatMoneyTile(194800)).toBe("₹1.95 L");
    expect(formatMoneyTile(12345678)).toBe("₹1.23 Cr");
  });

  it("stays on whole rupees even while decimals are switched on", () => {
    // show_decimals is for invoices, which reconcile against a tax document.
    // A tile is read at a glance and "₹24,800.00" is just noise.
    setCurrencySettingsCache({ ...CLINIC, show_decimals: true, decimal_digits: 2 });
    expect(formatMoneyTile(24800)).toBe("₹24,800");
    expect(formatMoneyTile(24800.49)).toBe("₹24,800");
    expect(formatMoneyTile(24800.5)).toBe("₹24,801");
  });

  it("honours the symbol and the grouping style", () => {
    setCurrencySettingsCache({ ...CLINIC, symbol: "$", number_style: "us" });
    expect(formatMoneyTile(1948000)).toBe("$1,948,000");
    setCurrencySettingsCache({ ...CLINIC, symbol: "$", number_style: "us", abbreviate: true });
    expect(formatMoneyTile(1948000)).toBe("$1.95M");
  });

  it("puts the sign OUTSIDE the symbol", () => {
    setCurrencySettingsCache(CLINIC);
    expect(formatMoneyTile(-24800)).toBe("-₹24,800");
    setCurrencySettingsCache({ ...CLINIC, abbreviate: true });
    expect(formatMoneyTile(-194800)).toBe("-₹1.95 L");
  });

  it("never renders a signed zero", () => {
    // A rounding detail with a visible consequence: a balance of -0.40 must
    // read "₹0", not "-₹0". The grouping already rounds the digits, so this
    // is the one case that proves the amount is rounded BEFORE its sign is
    // decided.
    setCurrencySettingsCache(CLINIC);
    expect(formatMoneyTile(-0.4)).toBe("₹0");
    expect(formatMoneyTile(-0.6)).toBe("-₹1");
  });

  it("has something to show for nothing at all", () => {
    setCurrencySettingsCache(CLINIC);
    expect(formatMoneyTile(0)).toBe("₹0");
    expect(formatMoneyTile(null)).toBe("₹0");
    expect(formatMoneyTile(undefined)).toBe("₹0");
    expect(formatMoneyTile("not a number")).toBe("₹0");
  });

  it("reads a numeric string, the way the API returns totals", () => {
    setCurrencySettingsCache(CLINIC);
    expect(formatMoneyTile("24800")).toBe("₹24,800");
  });
});

/**
 * The guarantee the clinic asked for by name: "make sure billing will not be
 * affected". src/pages/Billing.tsx formats every invoice figure - Total,
 * Paid, Balance, the split total and the HSN rollup - with formatMoneyExact,
 * so switching abbreviation on cannot turn ₹2,50,000 into "₹2.50 L" on a
 * document a patient is asked to pay against.
 */
describe("an invoice figure is never abbreviated", () => {
  it("prints every digit even with abbreviation switched ON", () => {
    setCurrencySettingsCache({ ...CLINIC, abbreviate: true });
    // What formatMoney would have done to the same number:
    expect(formatMoney(250000)).toBe("₹2.50 L");
    // What the invoice does instead:
    expect(formatMoneyExact(250000)).toBe("₹2,50,000.00");
    expect(formatMoneyExact(12345678)).toBe("₹1,23,45,678.00");
  });

  it("renders exactly what it rendered before this change, with the toggle off", () => {
    // Billing rounds to whole rupees first, so formatMoney and
    // formatMoneyExact agree character for character on the clinic's real
    // settings. Swapping one for the other changed no invoice on screen.
    setCurrencySettingsCache({ ...CLINIC, abbreviate: false });
    for (const n of [250000, 15650, 4000, 0]) {
      expect(formatMoneyExact(Math.round(n))).toBe(formatMoney(Math.round(n)));
    }
  });
});

/**
 * The tests above prove the formatters behave. These prove the two screens
 * actually CALL them - which is the whole of this bug. The Billed figure was
 * wrong not because a formatter misbehaved but because a component formatted
 * money by hand and never consulted the settings at all.
 */
describe("the screens use the shared formatters", () => {
  it("no invoice figure in Billing goes through the abbreviating formatter", () => {
    // formatMoney inherits "Abbreviate large amounts". On an invoice that
    // would print "₹2.50 L" as the amount due. Only the Exact and Precise
    // formatters may appear here.
    const billing = readFileSync("src/pages/Billing.tsx", "utf8");
    const abbreviating = billing.match(/(?<![A-Za-z])formatMoney\s*\(/g) ?? [];
    expect(abbreviating, "Billing.tsx must use formatMoneyExact / formatMoneyPrecise").toEqual([]);
  });

  it("the patient Engagement card does not format money by hand", () => {
    // It used to read:
    //   `₹${totalBilled >= 1000 ? `${(totalBilled / 1000).toFixed(1)}k` : ...}`
    // which is where the clinic's "₹24.8k" came from.
    const card = readFileSync("src/components/patients/EngagementScoreCard.tsx", "utf8");
    expect(card).toContain("formatMoneyTile");
    expect(card, "no hand-rolled /1000 abbreviation").not.toMatch(/\/\s*1000\s*\)?\s*\)?\.toFixed/);
    expect(card, "no hardcoded currency symbol in the Billed figure").not.toMatch(/`₹\$\{/);
  });
});
