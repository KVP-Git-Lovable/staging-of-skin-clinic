import { describe, it, expect } from "vitest";
import {
  referralKind,
  referrerStillApplies,
  referringPatientId,
  referringDoctorName,
} from "./patientReferral";
import { PATIENT_SOURCE_OPTIONS } from "./patientSourceOptions";

describe("referralKind", () => {
  it("reads the two sources the Add form offers", () => {
    expect(referralKind("Dr. referral")).toBe("doctor");
    expect(referralKind("Referred by Patient")).toBe("patient");
  });

  // The whole reason this exists. Every one of these is a real source on live
  // patients, and the old checks matched none of them, so 546 patients had no
  // referrer field on any screen.
  it("reads the Salesforce-era sources no screen used to recognise", () => {
    expect(referralKind("Reference - other Dr")).toBe("doctor");
    expect(referralKind("Reference - other patients")).toBe("patient");
    expect(referralKind("Other Dr. referral")).toBe("doctor");
  });

  it("is not thrown by case or stray spacing", () => {
    expect(referralKind("  reference - OTHER DR  ")).toBe("doctor");
    expect(referralKind("REFERRED BY PATIENT")).toBe("patient");
  });

  it("treats a bare referral as a doctor, as the form always has", () => {
    expect(referralKind("Referral")).toBe("doctor");
  });

  it("says none for the sources that are not referrals", () => {
    for (const s of ["Walk-in", "Advertisement", "Campaign", "Other", "Social media", "salesforce"]) {
      expect(referralKind(s)).toBe("none");
    }
    expect(referralKind(null)).toBe("none");
    expect(referralKind(undefined)).toBe("none");
    expect(referralKind("   ")).toBe("none");
  });

  it("covers every source the app offers without a surprise", () => {
    for (const s of PATIENT_SOURCE_OPTIONS) {
      expect(["doctor", "patient", "none"]).toContain(referralKind(s));
    }
  });
});

describe("referrerStillApplies", () => {
  it("keeps the referrer while the kind is unchanged", () => {
    expect(referrerStillApplies("Dr. referral", "Reference - other Dr")).toBe(true);
    expect(referrerStillApplies("Referred by Patient", "Reference - other patients")).toBe(true);
  });

  // A doctor's name left behind in a column that is now read as a patient id is
  // how a referrer turns into an unresolvable uuid lookup on the Details tab.
  it("drops it when the kind changes", () => {
    expect(referrerStillApplies("Dr. referral", "Referred by Patient")).toBe(false);
    expect(referrerStillApplies("Referred by Patient", "Dr. referral")).toBe(false);
  });

  it("drops it when the new source is not a referral at all", () => {
    expect(referrerStillApplies("Dr. referral", "Walk-in")).toBe(false);
    expect(referrerStillApplies("Referred by Patient", "Advertisement")).toBe(false);
  });

  it("does not resurrect one when neither source is a referral", () => {
    expect(referrerStillApplies("Walk-in", "Advertisement")).toBe(false);
  });
});

describe("referringPatientId", () => {
  const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

  it("passes a real id through", () => {
    expect(referringPatientId(id)).toBe(id);
    expect(referringPatientId(id.toUpperCase())).toBe(id.toUpperCase());
    expect(referringPatientId(` ${id} `)).toBe(id);
  });

  // The column holds a doctor's name for the other kind of referral, and a
  // patient picker handed that would query .eq("id", "Dr. Mariappa") - which
  // Postgres rejects as invalid uuid syntax.
  it("refuses a doctor's name, which is what the column holds for the other kind", () => {
    expect(referringPatientId("Dr. Mariappa")).toBe("");
    expect(referringPatientId("Mariappa")).toBe("");
  });

  it("refuses an empty or missing value", () => {
    expect(referringPatientId(null)).toBe("");
    expect(referringPatientId(undefined)).toBe("");
    expect(referringPatientId("   ")).toBe("");
  });

  it("refuses something that merely looks id-ish", () => {
    expect(referringPatientId("3f2504e0-4f89-41d3-9a0c")).toBe("");
    expect(referringPatientId("zzzzzzzz-4f89-41d3-9a0c-0305e82c3301")).toBe("");
  });
});

describe("referringDoctorName", () => {
  it("gives the doctor's name back", () => {
    expect(referringDoctorName("Dr. Gaurav Shetty")).toBe("Dr. Gaurav Shetty");
    expect(referringDoctorName("  Dr.Jyothi  ")).toBe("Dr.Jyothi");
  });

  it("gives nothing for a patient id stored in the same column", () => {
    // Two live rows hold a UUID here: a patient referral written into the
    // column a doctor name also uses. A report must not print it as a doctor.
    expect(referringDoctorName("750735a9-e3e5-4064-ae0e-a7b7274b8402")).toBe("");
  });

  it("gives nothing when nothing was recorded", () => {
    // 153 of the 160 doctor-referred patients, the Salesforce ones included.
    expect(referringDoctorName("")).toBe("");
    expect(referringDoctorName(null)).toBe("");
    expect(referringDoctorName(undefined)).toBe("");
  });
});
