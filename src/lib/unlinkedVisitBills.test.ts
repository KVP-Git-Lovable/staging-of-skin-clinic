import { describe, it, expect } from "vitest";
import { withUnlinkedBills } from "./unlinkedVisitBills";

const BOBBY = "d54296b2";
const VISIT = { id: "284e3648", patient_id: BOBBY, start_time: "2026-09-30T17:55:00" };
const BILL = { id: "INV-49229", patient_id: BOBBY, created_at: "2026-09-30T18:27:00", total_amount: 800 };

describe("withUnlinkedBills", () => {
  it("finds the bill that saved without its visit", () => {
    // Bobby, 30 September: billed ₹800, the row read "No bill".
    const merged = withUnlinkedBills(new Map(), [BILL], [VISIT]);
    expect(merged.get(VISIT.id)).toBe(BILL);
  });

  it("leaves a visit that already has its own bill alone", () => {
    const own = { id: "INV-OWN", patient_id: BOBBY, created_at: "2026-09-30T18:00:00" };
    const merged = withUnlinkedBills(new Map([[VISIT.id, own]]), [BILL], [VISIT]);
    expect(merged.get(VISIT.id)).toBe(own);
  });

  it("says nothing when the patient has two visits that day", () => {
    const second = { id: "other-visit", patient_id: BOBBY, start_time: "2026-09-30T20:00:00" };
    const merged = withUnlinkedBills(new Map(), [BILL], [VISIT, second]);
    expect(merged.size).toBe(0);
  });

  it("says nothing when there are two unattached bills that day", () => {
    const second = { id: "INV-OTHER", patient_id: BOBBY, created_at: "2026-09-30T19:00:00" };
    const merged = withUnlinkedBills(new Map(), [BILL, second], [VISIT]);
    expect(merged.size).toBe(0);
  });

  it("does not reach across days", () => {
    const yesterday = { ...BILL, created_at: "2026-09-29T18:27:00" };
    expect(withUnlinkedBills(new Map(), [yesterday], [VISIT]).size).toBe(0);
  });

  it("does not reach across patients", () => {
    const someoneElse = { ...BILL, patient_id: "another-patient" };
    expect(withUnlinkedBills(new Map(), [someoneElse], [VISIT]).size).toBe(0);
  });

  it("counts a visit once although both of the page's lists hold it", () => {
    // The page concatenates the date-bounded set and the current server page,
    // which overlap. Counting the same visit twice would look ambiguous.
    const merged = withUnlinkedBills(new Map(), [BILL], [VISIT, { ...VISIT }]);
    expect(merged.get(VISIT.id)).toBe(BILL);
  });

  it("ignores a bill with no patient on it", () => {
    const orphan = { ...BILL, patient_id: null };
    expect(withUnlinkedBills(new Map(), [orphan], [VISIT]).size).toBe(0);
  });

  it("returns the original map untouched when there is nothing to add", () => {
    const linked = new Map([[VISIT.id, BILL]]);
    expect(withUnlinkedBills(linked, [], [VISIT])).toBe(linked);
  });
});

describe("withUnlinkedBills and a cancelled bill", () => {
  const CANCELLED = { ...BILL, id: "INV-CANCELLED", status: "Cancelled" };

  it("never claims one for a visit", () => {
    expect(withUnlinkedBills(new Map(), [CANCELLED], [VISIT]).size).toBe(0);
  });

  it("does not let one make the day look ambiguous", () => {
    // The live bill is still the only one that counts, so it is still claimed.
    const merged = withUnlinkedBills(new Map(), [CANCELLED, BILL], [VISIT]);
    expect(merged.get(VISIT.id)).toBe(BILL);
  });
});
