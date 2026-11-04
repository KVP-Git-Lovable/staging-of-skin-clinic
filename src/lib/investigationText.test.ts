import { describe, it, expect } from "vitest";
import { investigationText } from "./investigationText";

describe("investigationText", () => {
  it("prefers the investigation text over the resolved service name", () => {
    expect(
      investigationText({ reason_for_consultation: "PRP for hair fall", service: "Consultation" }),
    ).toBe("PRP for hair fall");
  });

  it("falls back to the service name when there is no investigation text", () => {
    expect(investigationText({ reason_for_consultation: null, service: "TATTOO REMOVAL" })).toBe(
      "TATTOO REMOVAL",
    );
    expect(investigationText({ reason_for_consultation: "", service: "RADIANCE A" })).toBe(
      "RADIANCE A",
    );
  });

  it("treats whitespace-only imported text as missing", () => {
    expect(investigationText({ reason_for_consultation: "   \n ", service: "SCALP BOOSTER" })).toBe(
      "SCALP BOOSTER",
    );
  });

  it("trims the text it returns", () => {
    expect(investigationText({ reason_for_consultation: "  Acne review  " })).toBe("Acne review");
  });

  it("uses the fallback when neither field has anything", () => {
    expect(investigationText({ reason_for_consultation: null, service: null }, "—")).toBe("—");
    expect(investigationText({}, "—")).toBe("—");
    expect(investigationText(null, "—")).toBe("—");
    expect(investigationText(undefined)).toBe("");
  });
});

describe("a visit this app booked", () => {
  it("shows blank when the doctor left it blank", () => {
    // 64 of the 69 visits booked from a prescription had no investigation, and
    // every one of them showed the service instead - which reads as the app
    // making one up.
    expect(investigationText({ reason_for_consultation: null, service: "Laser Toning", source: "Procedure" }, "—")).toBe("—");
    expect(investigationText({ reason_for_consultation: "   ", service: "Laser Toning", source: "Procedure" }, "—")).toBe("—");
  });

  it("does not announce 'Follow Up' for a visit nobody described", () => {
    // The booking writes "Follow Up" as the service when the prescription has
    // no service lines.
    expect(investigationText({ reason_for_consultation: null, service: "Follow Up", source: "Procedure" }, "—")).toBe("—");
  });

  it("still shows what the doctor did write", () => {
    expect(investigationText({ reason_for_consultation: "3rd of 6 sessions", service: "Follow Up", source: "Procedure" })).toBe("3rd of 6 sessions");
  });

  it("leaves imported records exactly as they were", () => {
    // 6,221 Salesforce visits have no investigation and rely on the service.
    expect(investigationText({ reason_for_consultation: null, service: "TATTOO REMOVAL", source: "salesforce" })).toBe("TATTOO REMOVAL");
    // And a row whose source was never fetched must not change either.
    expect(investigationText({ reason_for_consultation: null, service: "TATTOO REMOVAL" })).toBe("TATTOO REMOVAL");
  });
});
