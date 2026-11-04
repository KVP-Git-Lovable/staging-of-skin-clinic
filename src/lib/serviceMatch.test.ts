import { describe, it, expect } from "vitest";
import { resolveServiceFromMaster } from "./serviceMatch";

// The clinic's real Service Master rows, in the order the query returns them.
const master = [
  { id: "ash", name: "CONSULTATION - DR ASHWINI ASHOKAN", price: 800 },
  { id: "sur", name: "CONSULTATION - DR P SURAKSHA", price: 800 },
  { id: "pun", name: "CONSULTATION - DR PUNYA SUVARNA", price: 850 },
  { id: "vin", name: "CONSULTATION- DR VINDHYA PAI", price: 1250 },
  { id: "peel", name: "Peel", price: 2000 },
];

describe("resolveServiceFromMaster", () => {
  it("does not bill one doctor's consultation for another's visit", () => {
    // The reported bug: an invoice for Dr Punya Suvarna arrived carrying
    // "CONSULTATION - DR ASHWINI ASHOKAN" at 800, because her row sorts first
    // and merely starts with the word.
    expect(resolveServiceFromMaster("Consultation", master)).toBeUndefined();
    expect(resolveServiceFromMaster("consultation", master)).toBeUndefined();
  });

  it("still resolves a consultation someone named in full", () => {
    expect(resolveServiceFromMaster("CONSULTATION - DR PUNYA SUVARNA", master)?.id).toBe("pun");
    // Punctuation and case are normalised, so the Vindhya row's missing space
    // does not stop it matching.
    expect(resolveServiceFromMaster("Consultation - Dr Vindhya Pai", master)?.id).toBe("vin");
  });

  it("matches when the recorded name is the more specific one", () => {
    expect(resolveServiceFromMaster("Peel - full face", master)?.id).toBe("peel");
  });

  it("refuses to guess when the master entry is the more specific one", () => {
    // "Dr" alone must not land on a doctor's consultation.
    expect(resolveServiceFromMaster("Dr", master)).toBeUndefined();
  });

  it("returns nothing for an unknown or empty name", () => {
    expect(resolveServiceFromMaster("Hydrafacial", master)).toBeUndefined();
    expect(resolveServiceFromMaster("", master)).toBeUndefined();
    expect(resolveServiceFromMaster("   ", master)).toBeUndefined();
  });
});
