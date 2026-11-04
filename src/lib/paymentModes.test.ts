import { describe, it, expect } from "vitest";
import {
  collectionCards,
  collectionsByBucket,
  modesOf,
  paymentBucket,
  paymentModeLabel,
  UNRECORDED_MODE,
  unrecognisedModeTotals,
} from "./paymentModes";

const money = (n: number) => `Rs ${n}`;

describe("paymentBucket", () => {
  it("files every UPI wallet the clinic has ever typed under UPI", () => {
    for (const mode of ["UPI", "upi", "Google Pay", "GooglePay", "G Pay", "GPay", "PhonePe", "Phone Pe", "Paytm", "BHIM"]) {
      expect(paymentBucket(mode)).toBe("UPI");
    }
  });

  it("files the card spellings under Card", () => {
    for (const mode of ["Card", "Credit Card", "Debit Card", "Credit/Debit", "Visa", "RuPay"]) {
      expect(paymentBucket(mode)).toBe("Card");
    }
  });

  it("files the bank spellings under Bank Transfer", () => {
    for (const mode of ["Bank Transfer", "NEFT", "IMPS", "RTGS", "Net Banking", "netbanking"]) {
      expect(paymentBucket(mode)).toBe("Bank Transfer");
    }
  });

  it("keeps Cash and Cheque apart", () => {
    expect(paymentBucket("Cash")).toBe("Cash");
    expect(paymentBucket("Cheque")).toBe("Cheque");
    expect(paymentBucket("Demand Draft")).toBe("Cheque");
  });

  it("does not mistake Part-Payment for a payment instrument", () => {
    // Salesforce stores it to mean the bill was only partly settled. A rule
    // matching a bare "pay" would have filed it under UPI and inflated the
    // UPI card with money that came in some other way.
    expect(paymentBucket("Part-Payment")).toBe("Other");
  });

  it("calls anything unrecognised Other rather than guessing", () => {
    expect(paymentBucket("")).toBe("Other");
    expect(paymentBucket(null)).toBe("Other");
    expect(paymentBucket(undefined)).toBe("Other");
    expect(paymentBucket("Insurance")).toBe("Other");
  });
});

describe("collectionsByBucket", () => {
  it("adds up what came in on each instrument", () => {
    const totals = collectionsByBucket([
      { paid_amount: 5000, payment_mode: "Google Pay" },
      { paid_amount: 850, payment_mode: "UPI" },
      { paid_amount: 800, payment_mode: "Cash" },
      { paid_amount: 3500, payment_mode: "Credit Card" },
    ]);
    expect(totals.get("UPI")).toBe(5850);
    expect(totals.get("Cash")).toBe(800);
    expect(totals.get("Card")).toBe(3500);
  });

  it("breaks a split payment across its parts", () => {
    const totals = collectionsByBucket([
      {
        paid_amount: 7750,
        payment_mode: "Split",
        payment_splits: [
          { mode: "Cash", amount: 2750 },
          { mode: "Google Pay", amount: 5000 },
        ],
      },
    ]);
    expect(totals.get("Cash")).toBe(2750);
    expect(totals.get("UPI")).toBe(5000);
    expect(totals.get("Other")).toBeUndefined();
  });

  it("never loses a rupee - the buckets always add up to what was collected", () => {
    const rows = [
      { paid_amount: 13045, payment_mode: "Part-Payment" },
      { paid_amount: 4500, payment_mode: "Google Pay" },
      { paid_amount: 850, payment_mode: "Cash" },
      { paid_amount: 1800, payment_mode: "Split", payment_splits: [{ mode: "Cheque", amount: 1000 }, { mode: "NEFT", amount: 800 }] },
      // splits that do not add up to paid_amount: the remainder must still land
      // somewhere rather than vanishing from the report.
      { paid_amount: 1000, payment_mode: "Cash", payment_splits: [{ mode: "UPI", amount: 600 }] },
    ];
    const collected = rows.reduce((a, r) => a + Number(r.paid_amount), 0);
    const totals = collectionsByBucket(rows);
    const bucketed = Array.from(totals.values()).reduce((a, n) => a + n, 0);
    expect(bucketed).toBe(collected);
    expect(totals.get("Cash")).toBe(850 + 400);
    expect(totals.get("UPI")).toBe(4500 + 600);
    expect(totals.get("Other")).toBe(13045);
  });

  it("ignores payment_splits that is not an array", () => {
    const totals = collectionsByBucket([{ paid_amount: 500, payment_mode: "Cash", payment_splits: "{}" }]);
    expect(totals.get("Cash")).toBe(500);
  });
});

describe("collectionCards", () => {
  it("shows only the instruments actually used, in a fixed order", () => {
    const cards = collectionCards(
      [
        { paid_amount: 100, payment_mode: "Cash" },
        { paid_amount: 200, payment_mode: "Google Pay" },
      ],
      money,
    );
    expect(cards).toEqual([
      { label: "UPI", value: "Rs 200" },
      { label: "Cash", value: "Rs 100" },
    ]);
  });

  it("shows nothing at all when nothing was collected", () => {
    expect(collectionCards([{ paid_amount: 0, payment_mode: "Cash" }], money)).toEqual([]);
    expect(collectionCards([], money)).toEqual([]);
  });
});

describe("what is inside the Other card", () => {
  const cards = (rows: Parameters<typeof collectionCards>[0]) => collectionCards(rows, money);
  const other = (rows: Parameters<typeof collectionCards>[0]) =>
    cards(rows).find((c) => c.label === "Other");

  it("names the stored mode, so nobody has to ask what the money is", () => {
    expect(other([{ paid_amount: 15650, payment_mode: "Part-Payment" }])?.hint).toBe("Part-Payment");
  });

  it("keeps the card called Other, because the filter below it offers buckets", () => {
    // A card labelled "Part-Payment" would leave the reader's next click with
    // nowhere to land - the Payment Mode filter has no such option.
    expect(other([{ paid_amount: 15650, payment_mode: "Part-Payment" }])?.label).toBe("Other");
  });

  it("collapses spellings of one mode and shows the commonest", () => {
    const hint = other([
      { paid_amount: 100, payment_mode: "part-payment" },
      { paid_amount: 100, payment_mode: "Part-Payment" },
      { paid_amount: 100, payment_mode: "Part-Payment" },
    ])?.hint;
    expect(hint).toBe("Part-Payment");
  });

  it("says so when no mode was recorded at all", () => {
    expect(other([{ paid_amount: 500, payment_mode: null }])?.hint).toBe("Not recorded");
    expect(other([{ paid_amount: 500, payment_mode: "   " }])?.hint).toBe("Not recorded");
  });

  it("lists several modes biggest first", () => {
    expect(
      other([
        { paid_amount: 100, payment_mode: "Insurance" },
        { paid_amount: 900, payment_mode: "Part-Payment" },
      ])?.hint,
    ).toBe("Part-Payment, Insurance");
  });

  it("counts the tail rather than running off the card", () => {
    const hint = other([
      { paid_amount: 500, payment_mode: "A-mode" },
      { paid_amount: 400, payment_mode: "B-mode" },
      { paid_amount: 300, payment_mode: "C-mode" },
      { paid_amount: 200, payment_mode: "D-mode" },
      { paid_amount: 100, payment_mode: "E-mode" },
    ])?.hint;
    expect(hint).toBe("A-mode, B-mode, C-mode +2 more");
  });

  it("puts no hint on the instrument cards", () => {
    const list = cards([
      { paid_amount: 100, payment_mode: "Cash" },
      { paid_amount: 200, payment_mode: "Google Pay" },
      { paid_amount: 300, payment_mode: "Part-Payment" },
    ]);
    expect(list.find((c) => c.label === "Cash")?.hint).toBeUndefined();
    expect(list.find((c) => c.label === "UPI")?.hint).toBeUndefined();
    expect(list.find((c) => c.label === "Other")?.hint).toBe("Part-Payment");
  });

  it("shows no Other card at all on a day where every mode was recognised", () => {
    expect(other([{ paid_amount: 850, payment_mode: "Cash" }])).toBeUndefined();
  });

  it("names the mode behind an unrecognised half of a split", () => {
    expect(
      other([
        {
          paid_amount: 1000,
          payment_mode: "Split",
          payment_splits: [{ mode: "Cash", amount: 600 }, { mode: "Insurance", amount: 400 }],
        },
      ])?.hint,
    ).toBe("Insurance");
  });

  it("does not name a mode that contributed nothing", () => {
    // A zero-amount row must not put a label on the card for money that is not there.
    expect(
      other([
        { paid_amount: 0, payment_mode: "Insurance" },
        { paid_amount: 700, payment_mode: "Part-Payment" },
      ])?.hint,
    ).toBe("Part-Payment");
  });

  it("still shows the mode when the splits overshoot and leave a negative", () => {
    // paymentModes keeps a negative remainder on purpose - dropping it would
    // overstate the collection - so the hint has to survive one too.
    const rows = [
      { paid_amount: 1000, payment_mode: "Part-Payment", payment_splits: [{ mode: "Cash", amount: 1500 }] },
    ];
    expect(other(rows)?.hint).toBe("Part-Payment");
    const bucketed = Array.from(collectionsByBucket(rows).values()).reduce((a, n) => a + n, 0);
    expect(bucketed).toBe(1000);
  });

  it("the cards still add up to everything collected", () => {
    const rows = [
      { paid_amount: 13045, payment_mode: "Part-Payment" },
      { paid_amount: 4500, payment_mode: "Google Pay" },
      { paid_amount: 850, payment_mode: "Cash" },
      { paid_amount: 900, payment_mode: "Insurance" },
      { paid_amount: 1800, payment_mode: "Split", payment_splits: [{ mode: "Cheque", amount: 1000 }, { mode: "NEFT", amount: 800 }] },
    ];
    const collected = rows.reduce((a, r) => a + Number(r.paid_amount), 0);
    const bucketed = Array.from(collectionsByBucket(rows).values()).reduce((a, n) => a + n, 0);
    expect(bucketed).toBe(collected);
    // and the Other card is the sum of the modes its hint names
    const unrecognised = Array.from(unrecognisedModeTotals(rows).values()).reduce((a, n) => a + n, 0);
    expect(unrecognised).toBe(13045 + 900);
  });
});

describe("paymentModeLabel", () => {
  it("prints the stored mode when there is no split", () => {
    expect(paymentModeLabel({ payment_mode: "UPI", paid_amount: 850 })).toBe("UPI");
    expect(paymentModeLabel({ payment_mode: "Cash", paid_amount: 500, payment_splits: null })).toBe("Cash");
  });

  it("names both instruments instead of the useless word Split", () => {
    // INV-365362: the report printed "Split" and nobody could tell whether the
    // drawer should hold the money.
    expect(
      paymentModeLabel({
        payment_mode: "Split",
        paid_amount: 800,
        payment_splits: [{ mode: "Cash", amount: 700 }, { mode: "UPI", amount: 100 }],
      }),
    ).toBe("Cash ₹700 + UPI ₹100");
  });

  it("uses the stored mode when a split has only one part", () => {
    // Billing already collapses a single-part split to that mode on save.
    expect(
      paymentModeLabel({ payment_mode: "Cash", paid_amount: 500, payment_splits: [{ mode: "Cash", amount: 500 }] }),
    ).toBe("Cash");
  });

  it("survives a malformed or empty payment_splits", () => {
    expect(paymentModeLabel({ payment_mode: "Cash", payment_splits: [] })).toBe("Cash");
    expect(paymentModeLabel({ payment_mode: "Cash", payment_splits: "nonsense" })).toBe("Cash");
    expect(paymentModeLabel({ payment_mode: null, paid_amount: 0 })).toBe("");
    expect(
      paymentModeLabel({ payment_mode: "Split", paid_amount: 300, payment_splits: [{ amount: 200 }, { mode: "UPI", amount: 100 }] }),
    ).toBe(`${UNRECORDED_MODE} ₹200 + UPI ₹100`);
  });

  it("formats amounts the Indian way, as the rest of the app does", () => {
    expect(
      paymentModeLabel({
        payment_mode: "Split",
        paid_amount: 250000,
        payment_splits: [{ mode: "Cash", amount: 150000 }, { mode: "Card", amount: 100000 }],
      }),
    ).toBe("Cash ₹1,50,000 + Card ₹1,00,000");
  });
});

describe("modesOf", () => {
  it("returns the one bucket an ordinary invoice paid through", () => {
    expect(modesOf({ payment_mode: "Google Pay", paid_amount: 500 })).toEqual(["UPI"]);
    expect(modesOf({ payment_mode: null, paid_amount: 500 })).toEqual(["Other"]);
  });

  it("returns every bucket a split paid through, so either finds it", () => {
    // "Split" buckets to "Other", so filtering by Cash used to miss this row
    // while the Cash card above it counted its 700.
    const row = {
      payment_mode: "Split",
      paid_amount: 800,
      payment_splits: [{ mode: "Cash", amount: 700 }, { mode: "Google Pay", amount: 100 }],
    };
    expect(modesOf(row).sort()).toEqual(["Cash", "UPI"]);
  });

  it("also returns the invoice's own mode when the split does not add up", () => {
    // attributions() puts the remainder on the invoice's mode, so the filter
    // has to agree with where the money was counted.
    const row = {
      payment_mode: "Card",
      paid_amount: 800,
      payment_splits: [{ mode: "Cash", amount: 700 }],
    };
    expect(modesOf(row).sort()).toEqual(["Card", "Cash"]);
  });
});
