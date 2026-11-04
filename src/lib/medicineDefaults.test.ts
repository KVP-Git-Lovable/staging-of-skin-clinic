import { describe, it, expect } from "vitest";
import { applyMedicineDefaults, PHARMA_LOOKUP_COLUMNS } from "./medicineDefaults";

/** As the pharmacy set them, from the products master. */
const ACNEMOIST = {
  default_frequency: "Apply moisturiser twice daily on clean and damp skin to lock in hydration.",
  default_duration: null,
  default_instructions: "Apply moisturiser twice daily on clean and damp skin to lock in hydration.",
};
const NMFE_UREA = {
  default_frequency: "Twice daily for body/hands and feet  for 2 months",
  default_duration: "2 months",
  default_instructions: "Twice daily for body/hands and feet  for 2 months",
};
const BLANK = { frequency: "", duration: "", instructions: "" };

describe("applyMedicineDefaults", () => {
  it("fills an empty row from the medicine the pharmacy set up", () => {
    expect(applyMedicineDefaults(BLANK, ACNEMOIST)).toEqual({
      frequency: ACNEMOIST.default_frequency,
      duration: "",
      instructions: ACNEMOIST.default_instructions,
    });
  });

  it("keeps what the doctor typed", () => {
    const typed = { frequency: "Once at night", duration: "10 days", instructions: "Only on the cheeks" };
    expect(applyMedicineDefaults(typed, ACNEMOIST)).toEqual(typed);
  });

  it("swaps one medicine's defaults for the next one's", () => {
    const filled = applyMedicineDefaults(BLANK, ACNEMOIST);
    expect(applyMedicineDefaults(filled, NMFE_UREA, ACNEMOIST)).toEqual({
      frequency: NMFE_UREA.default_frequency,
      duration: NMFE_UREA.default_duration,
      instructions: NMFE_UREA.default_instructions,
    });
  });

  it("keeps a typed value when the medicine is changed", () => {
    const edited = { ...applyMedicineDefaults(BLANK, ACNEMOIST), frequency: "Once daily, mornings only" };
    expect(applyMedicineDefaults(edited, NMFE_UREA, ACNEMOIST).frequency).toBe("Once daily, mornings only");
    // The boxes the doctor left as they were still follow the new medicine.
    expect(applyMedicineDefaults(edited, NMFE_UREA, ACNEMOIST).duration).toBe("2 months");
  });

  it("clears the old medicine's defaults when the next one has none", () => {
    const filled = applyMedicineDefaults(BLANK, ACNEMOIST);
    expect(applyMedicineDefaults(filled, {}, ACNEMOIST)).toEqual(BLANK);
  });

  it("leaves a row alone when there is no medicine to read", () => {
    expect(applyMedicineDefaults(BLANK, null)).toEqual(BLANK);
    expect(applyMedicineDefaults(BLANK, undefined)).toEqual(BLANK);
  });

  it("does not treat whitespace as something the doctor typed", () => {
    expect(applyMedicineDefaults({ frequency: "   ", duration: "", instructions: "" }, ACNEMOIST).frequency).toBe(
      ACNEMOIST.default_frequency,
    );
  });
});

describe("PHARMA_LOOKUP_COLUMNS", () => {
  // The whole fault was one screen asking for fewer columns than another under
  // the same cache key. If a column goes missing from here, it goes missing
  // from every screen at once - which is the point.
  it("asks for the defaults, not only the name", () => {
    for (const column of ["id", "name", "default_frequency", "default_duration", "default_instructions"]) {
      expect(PHARMA_LOOKUP_COLUMNS).toContain(column);
    }
  });
});

describe("a saved row loaded from the database", () => {
  // Frequency, duration and instructions are all nullable columns, and a row
  // saved years ago in Salesforce often has all three empty.
  it("is filled from the medicine rather than crashing on a null", () => {
    expect(applyMedicineDefaults({ frequency: null, duration: null, instructions: undefined }, ACNEMOIST)).toEqual({
      frequency: ACNEMOIST.default_frequency,
      duration: "",
      instructions: ACNEMOIST.default_instructions,
    });
  });
});
