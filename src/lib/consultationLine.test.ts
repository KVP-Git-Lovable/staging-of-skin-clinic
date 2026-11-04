import { describe, it, expect } from "vitest";
import { isConsultationService } from "./consultationLine";

describe("isConsultationService", () => {
  it("recognises the placeholder however it was typed", () => {
    expect(isConsultationService("Consultation")).toBe(true);
    expect(isConsultationService("consultation")).toBe(true);
    expect(isConsultationService("  CONSULTATION  ")).toBe(true);
  });

  it("leaves real services alone, including ones that mention consultation", () => {
    expect(isConsultationService("Consultation fee")).toBe(false);
    expect(isConsultationService("Cosmetic Consultation")).toBe(false);
    expect(isConsultationService("Online consultation")).toBe(false);
    expect(isConsultationService("Exion Arms (COSMETIC TREATMENT)")).toBe(false);
  });

  it("treats a missing name as not a consultation", () => {
    expect(isConsultationService("")).toBe(false);
    expect(isConsultationService(null)).toBe(false);
    expect(isConsultationService(undefined)).toBe(false);
  });
});
