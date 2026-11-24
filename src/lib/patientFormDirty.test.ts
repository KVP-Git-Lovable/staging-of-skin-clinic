import { describe, it, expect } from "vitest";
import { patientFormDirty } from "./patientFormDirty";

/** What PatientFormSheet's emptyForm actually looks like - not blank. */
const EMPTY = {
  first_name: "",
  last_name: "",
  phone: null,
  alternate_phone: null,
  email: null,
  status: "Active",
  source: "Walk-in",
  follows_facebook: false,
  follows_instagram: false,
};

describe("patientFormDirty", () => {
  it("a freshly opened form is not dirty", () => {
    // The trap this helper exists to avoid: emptyForm carries "Active",
    // "Walk-in" and two false booleans, so comparing against a blank object
    // would prompt to discard on every single close.
    expect(patientFormDirty({ ...EMPTY }, EMPTY)).toBe(false);
  });

  it("one typed character is dirty", () => {
    expect(patientFormDirty({ ...EMPTY, first_name: "A" }, EMPTY)).toBe(true);
    expect(patientFormDirty({ ...EMPTY, phone: "9" }, EMPTY)).toBe(true);
  });

  it("notices a field that was cleared, not only one that was filled", () => {
    const loaded = { ...EMPTY, first_name: "Nisha", phone: "9663438657" };
    expect(patientFormDirty({ ...loaded, phone: null }, loaded)).toBe(true);
  });

  it("notices a field that is missing entirely, not just set to null", () => {
    // Setting a key to null leaves it a key, so checking only the current
    // object's keys would still catch that. A key DROPPED from the object -
    // which a destructure does - is only caught by comparing the union of
    // both sides' keys.
    const loaded = { first_name: "Nisha", phone: "9663438657" };
    expect(patientFormDirty({ first_name: "Nisha" }, loaded)).toBe(true);
  });

  it("treats null, undefined and empty string as the same nothing", () => {
    // Clicking into a field and back out must not count as an edit.
    expect(patientFormDirty({ ...EMPTY, email: "" }, { ...EMPTY, email: null })).toBe(false);
    expect(patientFormDirty({ ...EMPTY, email: null }, { ...EMPTY, email: undefined })).toBe(false);
    expect(patientFormDirty({ ...EMPTY, first_name: "  " }, EMPTY)).toBe(false);
  });

  it("compares an edit against the saved patient, not against blank", () => {
    const saved = { first_name: "Nisha", last_name: "Rai", phone: "9663438657", status: "Active" };
    expect(patientFormDirty({ ...saved }, saved), "opening a patient to edit is not an edit").toBe(false);
    expect(patientFormDirty({ ...saved, last_name: "Raikar" }, saved)).toBe(true);
  });

  it("does not count a lead conversion's own pre-fill as typed", () => {
    // Leads.tsx opens the form with the lead's name, phone and email already
    // in it. The clinic did not type those, so closing straight away must not
    // prompt.
    const prefilled = { ...EMPTY, first_name: "Asha", last_name: "Shenoy", phone: "9900112233" };
    expect(patientFormDirty({ ...prefilled }, prefilled)).toBe(false);
    expect(patientFormDirty({ ...prefilled, city: "Mangalore" }, prefilled)).toBe(true);
  });

  it("counts family rows and consultation reasons, which are not on the form object", () => {
    expect(patientFormDirty({ ...EMPTY }, EMPTY, true)).toBe(true);
  });

  it("saved consultation reasons and family rows in the snapshot are not edits", () => {
    // Editing a patient who already has reasons and family members, then
    // closing without touching anything, must not prompt.
    const saved = {
      ...EMPTY,
      first_name: "Nisha",
      __reasons: ["Acne"],
      __family: [{ id: "f1", name: "Ravi", relationship: "Father", phone: "", is_primary_contact: false, linked: false }],
    };
    expect(patientFormDirty(structuredClone(saved), saved)).toBe(false);
    expect(patientFormDirty({ ...saved, __reasons: ["Acne", "Scars"] }, saved)).toBe(true);
    expect(patientFormDirty({ ...saved, __family: [] }, saved)).toBe(true);
  });

  it("does not trip on a number arriving back as a string", () => {
    expect(patientFormDirty({ age: "30" }, { age: 30 })).toBe(false);
  });

  it("compares arrays by value", () => {
    expect(patientFormDirty({ r: ["acne"] }, { r: ["acne"] })).toBe(false);
    expect(patientFormDirty({ r: ["acne", "scars"] }, { r: ["acne"] })).toBe(true);
  });

  it("is safe before the snapshot has been taken", () => {
    // The ref is null on the very first render, and a prompt there would be
    // worse than none.
    expect(patientFormDirty({ ...EMPTY, first_name: "A" }, null)).toBe(false);
    expect(patientFormDirty(null, EMPTY)).toBe(false);
  });
});
