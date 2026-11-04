import { describe, it, expect } from "vitest";
import { phoneKey, portalLoginStep, resolvePortalPatient } from "./portalPhoneLogin";

/**
 * The patient portal told a patient her registered number was not
 * registered. It was looking at the newest 1,000 of 27,625 patients,
 * because the edge function downloaded a page of the table and matched in
 * JavaScript, and PostgREST caps a response at 1,000 rows.
 *
 * These are the decisions that were buried in that function.
 */
describe("phoneKey", () => {
  it("reads the clinic's numbers however they were written down", () => {
    // All four of these forms are in the live patients table.
    expect(phoneKey("9663438657")).toBe("9663438657");
    expect(phoneKey("+91 96634 38657")).toBe("9663438657");
    expect(phoneKey("919663438657")).toBe("9663438657");
    expect(phoneKey("09663438657")).toBe("9663438657");
    expect(phoneKey("(0824) 966-343-8657")).toBe("9663438657");
  });

  it("REFUSES a number that is too short rather than matching on its tail", () => {
    // The dangerous case. A nine-digit key would match the end of other
    // people's numbers and hand over the wrong patient's records.
    expect(phoneKey("966343865")).toBe("");
    expect(phoneKey("12345")).toBe("");
    expect(phoneKey("")).toBe("");
    expect(phoneKey(null)).toBe("");
    expect(phoneKey(undefined)).toBe("");
  });

  it("has nothing to say about text", () => {
    expect(phoneKey("not a phone")).toBe("");
    expect(phoneKey("-")).toBe("");
  });
});

describe("portalLoginStep", () => {
  const ASHA = { id: "a", name: "Asha" };
  const MINHA = { id: "b", name: "Minha" };

  it("says the number is incomplete instead of claiming it is unknown", () => {
    // This used to read "Not registered. Please contact the clinic." for a
    // half-typed number, sending people to the front desk for nothing.
    expect(portalLoginStep("96634386", [ASHA]).kind).toBe("incomplete_number");
  });

  it("says not registered only when the number really reaches nobody", () => {
    expect(portalLoginStep("9663438657", []).kind).toBe("not_registered");
  });

  it("goes straight on when the number reaches one patient", () => {
    const step = portalLoginStep("9663438657", [ASHA]);
    expect(step).toEqual({ kind: "proceed", patient: ASHA });
  });

  it("asks WHICH when a family shares the number", () => {
    // 5,825 of this clinic's patients share a phone with somebody else, and
    // one number is on fourteen of them. Picking one silently is what kept
    // the rest of a family out of the portal.
    const step = portalLoginStep("8951465686", [ASHA, MINHA]);
    expect(step.kind).toBe("choose_patient");
    expect(step.kind === "choose_patient" && step.patients).toHaveLength(2);
  });

  it("checks the number before the patients, so a bad number never leaks who is on it", () => {
    expect(portalLoginStep("123", [ASHA, MINHA]).kind).toBe("incomplete_number");
  });
});

/**
 * The security line.
 *
 * patientId comes from the browser once the chooser has been answered. If
 * it were trusted, pairing any patient's uuid with any phone number would
 * set a PIN on a record that is not theirs and open their history.
 */
describe("resolvePortalPatient", () => {
  const ASHA = { id: "a", name: "Asha" };
  const MINHA = { id: "b", name: "Minha" };

  it("accepts an id that really is on this number", () => {
    expect(resolvePortalPatient([ASHA, MINHA], "b")).toEqual(MINHA);
  });

  it("REFUSES an id that is not, however well formed", () => {
    expect(resolvePortalPatient([ASHA, MINHA], "someone-elses-uuid")).toBeNull();
    // The number reaches one patient and a different id is supplied: still no.
    expect(resolvePortalPatient([ASHA], "b")).toBeNull();
  });

  it("needs no id when the number reaches exactly one patient", () => {
    expect(resolvePortalPatient([ASHA])).toEqual(ASHA);
    expect(resolvePortalPatient([ASHA], null)).toEqual(ASHA);
  });

  it("refuses to guess when several share the number and nobody has chosen", () => {
    expect(resolvePortalPatient([ASHA, MINHA])).toBeNull();
    expect(resolvePortalPatient([ASHA, MINHA], "")).toBeNull();
  });

  it("has nobody to resolve when the number reaches nobody", () => {
    expect(resolvePortalPatient([], "a")).toBeNull();
  });
});
