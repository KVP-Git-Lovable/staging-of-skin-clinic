import { describe, it, expect } from "vitest";
import { caseAnalysisDate } from "./caseAnalysisDate";

describe("caseAnalysisDate", () => {
  it("formats the ISO date the model echoes from the record", () => {
    // What the reported panel showed: "2026-04-06 — Initial Consultation".
    expect(caseAnalysisDate("2026-04-06")).toBe("06/04/2026");
  });

  it("formats a date the model wrote out in words", () => {
    expect(caseAnalysisDate("April 6, 2026")).toBe("06/04/2026");
    expect(caseAnalysisDate("6 April 2026")).toBe("06/04/2026");
  });

  it("formats a full timestamp down to the day", () => {
    expect(caseAnalysisDate("2026-04-06T10:30:00+05:30")).toBe("06/04/2026");
  });

  it("leaves text that is not a date alone rather than blanking it", () => {
    // A model may write a relative or vague entry; losing it would be worse
    // than showing it as written.
    expect(caseAnalysisDate("Six weeks later")).toBe("Six weeks later");
    expect(caseAnalysisDate("Ongoing")).toBe("Ongoing");
  });

  it("does not treat a bare number as a date", () => {
    // new Date("6") parses happily, which would invent a date nobody wrote.
    expect(caseAnalysisDate("6")).toBe("6");
    expect(caseAnalysisDate("Grade 3")).toBe("Grade 3");
  });

  it("keeps a year-bearing string it cannot parse, as written", () => {
    expect(caseAnalysisDate("Early 2026")).toBe("Early 2026");
    expect(caseAnalysisDate("2025-2026")).toBe("2025-2026");
  });

  it("handles nothing at all", () => {
    expect(caseAnalysisDate(null)).toBe("");
    expect(caseAnalysisDate(undefined)).toBe("");
    expect(caseAnalysisDate("   ")).toBe("");
  });
});
