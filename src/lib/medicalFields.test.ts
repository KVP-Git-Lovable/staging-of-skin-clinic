import { describe, it, expect } from "vitest";
import {
  MEDICAL_FIELDS,
  ELABORATABLE_MEDICAL_FIELDS,
  PATIENT_MEDICAL_COLUMNS,
  PROCEDURE_MEDICAL_FIELDS,
  SKIN_TYPE_OPTIONS,
} from "./medicalFields";

const keys = MEDICAL_FIELDS.map(([key]) => key);
const labelFor = (key: string) => MEDICAL_FIELDS.find(([k]) => k === key)?.[1];

describe("MEDICAL_FIELDS", () => {
  it("carries the labels the clinic asked for", () => {
    // Second pass on the wording: symptoms went to "History/Examination
    // details" and came back, and that heading now sits on medical_history.
    expect(labelFor("symptoms")).toBe("Symptoms");
    expect(labelFor("medical_history")).toBe("History/Examination details");
    expect(labelFor("dietary_advice")).toBe("Dietary Advice");
  });

  it("does not head two fields the same way", () => {
    // The swap is only safe while the labels stay distinct - two boxes reading
    // "History/Examination details" would be worse than the original wording.
    const labels = MEDICAL_FIELDS.map(([, label]) => label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("no longer offers Allergies or Skin Concerns on a prescription", () => {
    // Both are still columns on `patients`; they are simply not asked for here.
    // Skin Concerns especially: it holds the imported "Aesthetic"/"Clinical"
    // category for 5,364 patients, which is not a skin concern and is certainly
    // not dietary advice.
    expect(keys).not.toContain("allergies");
    expect(keys).not.toContain("skin_concerns");
  });

  it("keeps every key a real column name", () => {
    // The key is what the row is saved under. Renaming one to change wording
    // would write to a column that does not exist.
    expect(keys).toEqual([
      "symptoms",
      "diagnosis",
      "lab_tests",
      "medical_history",
      "current_medications",
      "dietary_advice",
      "previous_treatments",
      "skin_type",
    ]);
  });

  it("names each field exactly once", () => {
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("PATIENT_MEDICAL_COLUMNS", () => {
  it("is every field that is not stored on the visit", () => {
    expect(PROCEDURE_MEDICAL_FIELDS).toEqual(["symptoms", "diagnosis", "lab_tests"]);
    expect(PATIENT_MEDICAL_COLUMNS).toEqual([
      "medical_history",
      "current_medications",
      "dietary_advice",
      "previous_treatments",
      "skin_type",
    ]);
  });

  it("never names a column the form has dropped", () => {
    // Saving lists these columns explicitly. A column left in the list but off
    // the form reads as undefined and would blank the stored value.
    expect(PATIENT_MEDICAL_COLUMNS).not.toContain("allergies");
    expect(PATIENT_MEDICAL_COLUMNS).not.toContain("skin_concerns");
  });
});

describe("ELABORATABLE_MEDICAL_FIELDS", () => {
  it("leaves out Skin Type, which has a check constraint to honour", () => {
    expect(ELABORATABLE_MEDICAL_FIELDS.map(([k]) => k)).not.toContain("skin_type");
    expect(SKIN_TYPE_OPTIONS).toContain("Combination");
  });

  it("leaves out Dietary Advice, which the AI edge function does not accept", () => {
    // That function takes a fixed set of keys and cannot be redeployed from
    // here, so sending a new one would be dropped silently - which reads as the
    // button doing nothing.
    expect(ELABORATABLE_MEDICAL_FIELDS.map(([k]) => k)).not.toContain("dietary_advice");
  });

  it("still offers everything else", () => {
    expect(ELABORATABLE_MEDICAL_FIELDS).toHaveLength(MEDICAL_FIELDS.length - 2);
  });
});
