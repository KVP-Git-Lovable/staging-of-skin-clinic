import { describe, it, expect } from "vitest";
import { blankServiceLine } from "./procedureFormSeed";

/**
 * Reported four times. Each earlier fix narrowed which names could pre-fill;
 * the fifth name came straight through - "CONSULTATION - DR P SURAKSHA", a
 * real billed service on 22 of that doctor's appointments.
 */

describe("blankServiceLine", () => {
  it("names no service, so none can arrive uninvited", () => {
    expect(blankServiceLine().name).toBe("");
  });

  it("carries no service id, so nothing auto-fills from the Service Master", () => {
    // The id is what pulled in the price, the master's notes and
    // recommendations, and every medicine and asset linked to the service.
    expect(blankServiceLine().service_id).toBe("");
  });

  it("puts no money on a procedure nobody has written yet", () => {
    expect(blankServiceLine().price).toBe(0);
    expect(blankServiceLine().material_percent).toBe("");
  });

  it("opens the notes empty", () => {
    const line = blankServiceLine();
    expect(line.procedure_notes).toBe("");
    expect(line.recommendations).toBe("");
  });

  it("is the same empty line every time, whatever the visit was booked as", () => {
    // There is no argument to pass a service through - that is the point.
    const { key: _a, ...first } = blankServiceLine("svc-1");
    const { key: _b, ...second } = blankServiceLine("svc-2");
    expect(first).toEqual(second);
  });

  it("gives each line its own key so React can tell them apart", () => {
    expect(blankServiceLine("svc-1").key).toBe("svc-1");
    expect(blankServiceLine().key).toMatch(/^svc-/);
  });
});
