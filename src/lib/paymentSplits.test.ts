import { describe, it, expect } from "vitest";
import { paymentModeForSplits, paymentModeLabel, paymentSplitParts, splitProblem, splitTotal, splitsFromInvoice } from "./paymentSplits";

/** INV-49320, Basavaraju: ₹32,175 taken as ₹30,000 cash and ₹2,175 UPI. */
const INV_49320 = [
  { mode: "Cash", amount: 30000 },
  { mode: "UPI", amount: 2175 },
];

describe("splitsFromInvoice", () => {
  it("reads the rows stored on the invoice", () => {
    expect(splitsFromInvoice(INV_49320)).toEqual(INV_49320);
  });

  it("reads nothing from an invoice that was paid one way", () => {
    expect(splitsFromInvoice(null)).toEqual([]);
    expect(splitsFromInvoice(undefined)).toEqual([]);
    expect(splitsFromInvoice([])).toEqual([]);
    expect(splitsFromInvoice("Cash")).toEqual([]);
  });

  it("survives a row stored with the amount as text", () => {
    expect(splitsFromInvoice([{ mode: "Cash", amount: "30000" }])).toEqual([{ mode: "Cash", amount: 30000 }]);
  });
});

describe("paymentModeForSplits", () => {
  it("reads Split when the money came in two ways", () => {
    expect(paymentModeForSplits(INV_49320, "Cash")).toBe("Split");
  });

  it("names the mode when a split has only one row - it is just that payment", () => {
    expect(paymentModeForSplits([{ mode: "UPI", amount: 500 }], "Cash")).toBe("UPI");
  });

  it("leaves the chosen mode alone when there are no rows", () => {
    expect(paymentModeForSplits([], "Card")).toBe("Card");
  });
});

describe("splitProblem", () => {
  it("passes the real invoice's figures", () => {
    expect(splitTotal(INV_49320)).toBe(32175);
    expect(splitProblem(INV_49320, 32175)).toBeNull();
  });

  it("refuses a row with no mode", () => {
    expect(splitProblem([{ mode: "", amount: 100 }], 100)).toContain("payment mode");
  });

  it("refuses a row with nothing in it", () => {
    expect(splitProblem([{ mode: "Cash", amount: 0 }], 0)).toContain("amount");
  });

  it("refuses rows that do not add up to what was paid", () => {
    // The clinic edits UPI down to 2,000 and forgets the Paid Amount.
    expect(splitProblem([{ mode: "Cash", amount: 30000 }, { mode: "UPI", amount: 2000 }], 32175)).toContain(
      "equal paid amount",
    );
  });

  it("adds up in paise, so rounding cannot refuse a correct bill", () => {
    expect(splitProblem([{ mode: "Cash", amount: 0.1 }, { mode: "UPI", amount: 0.2 }], 0.3)).toBeNull();
  });

  it("has nothing to say about an invoice paid one way", () => {
    expect(splitProblem([], 5000)).toBeNull();
  });
});

describe("paymentModeLabel", () => {
  it("names the modes of a split rather than the word Split", () => {
    // The appointments list showed only "Split", so a cash-and-card bill and a
    // cash-and-UPI one looked identical without opening either.
    expect(paymentModeLabel("Split", [
      { mode: "Cash", amount: 30000 },
      { mode: "UPI", amount: 2175 },
    ])).toBe("Cash + UPI");
  });

  it("keeps the order the payments were taken in", () => {
    expect(paymentModeLabel("Split", [
      { mode: "UPI", amount: 500 },
      { mode: "Card", amount: 500 },
      { mode: "Cash", amount: 500 },
    ])).toBe("UPI + Card + Cash");
  });

  it("names a mode used twice only once", () => {
    expect(paymentModeLabel("Split", [
      { mode: "Cash", amount: 100 },
      { mode: "Cash", amount: 200 },
      { mode: "UPI", amount: 300 },
    ])).toBe("Cash + UPI");
  });

  it("leaves an ordinary bill exactly as it is", () => {
    expect(paymentModeLabel("UPI", null)).toBe("UPI");
    expect(paymentModeLabel("Cash", [])).toBe("Cash");
    // One row is not a split - it is that payment.
    expect(paymentModeLabel("Cash", [{ mode: "Cash", amount: 850 }])).toBe("Cash");
  });

  it("falls back to the stored word when the rows name nothing", () => {
    expect(paymentModeLabel("Split", [{ mode: "", amount: 1 }, { mode: "  ", amount: 2 }])).toBe("Split");
  });

  it("is empty when there is no bill at all, so the cell can show a dash", () => {
    expect(paymentModeLabel(null, null)).toBe("");
    expect(paymentModeLabel("", null)).toBe("");
  });
});

describe("paymentSplitParts", () => {
  it("names each mode with what went on it", () => {
    // Josily Boban, 17 Oct: ₹29,359 as ₹26,939 card and ₹2,420 UPI.
    expect(
      paymentSplitParts("Split", [
        { mode: "Card", amount: 26939 },
        { mode: "UPI", amount: 2420 },
      ]),
    ).toEqual([
      { mode: "Card", amount: 26939 },
      { mode: "UPI", amount: 2420 },
    ]);
  });

  it("keeps the order the payments were taken in", () => {
    const parts = paymentSplitParts("Split", [
      { mode: "UPI", amount: 500 },
      { mode: "Cash", amount: 1500 },
    ]);
    expect(parts.map((p) => p.mode)).toEqual(["UPI", "Cash"]);
  });

  it("merges two payments by the same mode into one, summed", () => {
    expect(
      paymentSplitParts("Split", [
        { mode: "Cash", amount: 1000 },
        { mode: "cash", amount: 250 },
      ]),
    ).toEqual([{ mode: "Cash", amount: 1250 }]);
  });

  it("has nothing to say about an ordinary bill", () => {
    expect(paymentSplitParts("Cash", [{ mode: "Cash", amount: 500 }])).toEqual([]);
    expect(paymentSplitParts("Cash", null)).toEqual([]);
    expect(paymentSplitParts("Cash", [])).toEqual([]);
  });

  it("falls silent when the rows name no mode, so the label can stand instead", () => {
    expect(
      paymentSplitParts("Split", [
        { mode: "", amount: 100 },
        { mode: "   ", amount: 200 },
      ]),
    ).toEqual([]);
  });
});
