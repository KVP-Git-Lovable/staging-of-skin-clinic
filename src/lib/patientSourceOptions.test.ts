import { describe, it, expect } from "vitest";
import {
  PATIENT_SOURCE_OPTIONS,
  PATIENT_GENDER_OPTIONS,
  optionsIncluding,
} from "./patientSourceOptions";

describe("PATIENT_SOURCE_OPTIONS", () => {
  it("is what the Add Patient form offers", () => {
    expect([...PATIENT_SOURCE_OPTIONS]).toEqual([
      "Walk-in", "Advertisement", "Dr. referral", "Referred by Patient", "Campaign", "Other",
    ]);
  });

  it("does not carry the Details tab's old wording, which nothing ever wrote", () => {
    expect(PATIENT_SOURCE_OPTIONS).not.toContain("Other Dr. referral");
  });
});

describe("PATIENT_GENDER_OPTIONS", () => {
  it("keeps the option the Details tab had dropped", () => {
    expect(PATIENT_GENDER_OPTIONS).toContain("Prefer not to say");
  });
});

describe("optionsIncluding", () => {
  const sources = PATIENT_SOURCE_OPTIONS;

  it("keeps a value from before the list existed, so it does not render blank", () => {
    // 4,322 patients are "Social media", 84 are "Reference - other Dr".
    expect(optionsIncluding("Social media", sources)).toEqual([...sources, "Social media"]);
    expect(optionsIncluding("Reference - other Dr", sources)).toContain("Reference - other Dr");
  });

  it("does not repeat a value already on the list", () => {
    const out = optionsIncluding("Walk-in", sources);
    expect(out).toEqual([...sources]);
    expect(out.filter((o) => o === "Walk-in")).toHaveLength(1);
  });

  it("gives the plain list when nothing is stored", () => {
    for (const empty of [null, undefined, "", "   "]) {
      expect(optionsIncluding(empty, sources)).toEqual([...sources]);
    }
  });

  it("never mutates the canonical list", () => {
    optionsIncluding("Social media", sources);
    expect(PATIENT_SOURCE_OPTIONS).toHaveLength(6);
  });

  it("works the same for gender", () => {
    expect(optionsIncluding("Non-binary", PATIENT_GENDER_OPTIONS)).toContain("Non-binary");
    expect(optionsIncluding("Female", PATIENT_GENDER_OPTIONS)).toEqual([...PATIENT_GENDER_OPTIONS]);
  });
});

