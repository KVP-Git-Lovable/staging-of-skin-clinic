import { describe, it, expect } from "vitest";
import { isPlaceholderService } from "../../supabase/functions/generate-prescription-pdf/placeholderService";

/**
 * Dr Suraksha's prescriptions kept printing "CONSULTATION - DR P SURAKSHA" in
 * the Procedure Details table, as though a treatment had been carried out. The
 * check only recognised the word "consultation" on its own, and the clinic's
 * Service Master carries one consultation per doctor.
 */

describe("isPlaceholderService", () => {
  it("knows a plain consultation, whatever its case", () => {
    expect(isPlaceholderService("Consultation")).toBe(true);
    expect(isPlaceholderService("consultation")).toBe(true);
    expect(isPlaceholderService("  CONSULTATION  ")).toBe(true);
  });

  it("knows a consultation with the doctor's name on it - the reported case", () => {
    expect(isPlaceholderService("CONSULTATION - DR P SURAKSHA")).toBe(true);
    expect(isPlaceholderService("CONSULTATION - DR PUNYA SUVARNA")).toBe(true);
    expect(isPlaceholderService("CONSULTATION - DR ASHWINI ASHOKAN")).toBe(true);
  });

  it("does not mind where the clinic put the spaces", () => {
    // This one is in the Service Master with no space before the dash.
    expect(isPlaceholderService("CONSULTATION- DR VINDHYA PAI")).toBe(true);
    expect(isPlaceholderService("Consultation -Dr X")).toBe(true);
  });

  it("leaves a real service alone, even one with 'consult' in its name", () => {
    // Separately listed and separately priced; the clinic means it.
    expect(isPlaceholderService("COSMETIC CONSULT")).toBe(false);
    expect(isPlaceholderService("Pre-consultation workup")).toBe(false);
  });

  it("does not swallow a treatment that happens to be named alongside one", () => {
    expect(isPlaceholderService("Consultation + Peel B")).toBe(false);
    expect(isPlaceholderService("BOTOX")).toBe(false);
    expect(isPlaceholderService("RF under EMLA/LA")).toBe(false);
  });

  it("treats nothing at all as nothing to print", () => {
    expect(isPlaceholderService("")).toBe(false);
    expect(isPlaceholderService(null)).toBe(false);
    expect(isPlaceholderService(undefined)).toBe(false);
  });
});
