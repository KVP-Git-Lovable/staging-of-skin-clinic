import { describe, it, expect } from "vitest";
import {
  GENDERS,
  normaliseDob,
  normaliseEmail,
  normaliseSex,
  normaliseSource,
} from "../../supabase/functions/sf-import-demographics/demographics";

/**
 * Prescriptions print "Sex: -" and "Email: -" because these fields were never
 * imported. Salesforce has Sex__c for 100% of patients and Email_ID__c for
 * 96.7% - but a 97% fill rate on a clinic system usually means a required box
 * somebody had to put something in, so the filler has to be caught here.
 */

describe("normaliseSex", () => {
  it("maps the spellings a clinic actually types", () => {
    expect(normaliseSex("M")).toBe("Male");
    expect(normaliseSex("male")).toBe("Male");
    expect(normaliseSex(" Female ")).toBe("Female");
    expect(normaliseSex("F")).toBe("Female");
    expect(normaliseSex("Other")).toBe("Other");
    expect(normaliseSex("Prefer not to say")).toBe("Prefer not to say");
  });

  it("only ever returns a value the gender column will accept", () => {
    for (const raw of ["m", "F", "other", "TRANS", "unspecified"]) {
      const out = normaliseSex(raw);
      expect(out === null || (GENDERS as readonly string[]).includes(out)).toBe(true);
    }
  });

  it("refuses to guess at anything it does not recognise", () => {
    // Reported by the dry run so it can be mapped deliberately, not dropped.
    expect(normaliseSex("Unknown")).toBeNull();
    expect(normaliseSex("123")).toBeNull();
    expect(normaliseSex("")).toBeNull();
    expect(normaliseSex(null)).toBeNull();
  });
});

describe("normaliseEmail", () => {
  it("accepts a real address, lower-cased", () => {
    expect(normaliseEmail("  Priya.Rao@Gmail.com ")).toBe("priya.rao@gmail.com");
  });

  it("rejects the filler that a required field collects", () => {
    for (const junk of ["na", "N/A", "-", "none", "test@test.com", "abc@abc.com", "aaa@gmail.com"]) {
      expect(normaliseEmail(junk)).toBeNull();
    }
  });

  it("rejects anything that is not shaped like an address", () => {
    expect(normaliseEmail("priya at gmail")).toBeNull();
    expect(normaliseEmail("priya@gmail")).toBeNull();
    expect(normaliseEmail("@gmail.com")).toBeNull();
    expect(normaliseEmail("a@b.com")).toBeNull();
    expect(normaliseEmail("two@at@gmail.com")).toBeNull();
    expect(normaliseEmail("")).toBeNull();
  });
});

describe("normaliseDob", () => {
  const today = new Date("2026-09-21T00:00:00Z");

  it("keeps a plausible birth date", () => {
    expect(normaliseDob("1982-07-31", today)).toBe("1982-07-31");
    expect(normaliseDob("1982-07-31T00:00:00.000+0000", today)).toBe("1982-07-31");
  });

  it("rejects a date that does not exist rather than rolling it forward", () => {
    expect(normaliseDob("2001-02-30", today)).toBeNull();
    expect(normaliseDob("1990-13-01", today)).toBeNull();
  });

  it("rejects a birth date in the future or before 1900", () => {
    expect(normaliseDob("2030-01-01", today)).toBeNull();
    expect(normaliseDob("1899-12-31", today)).toBeNull();
  });

  it("rejects anything unparseable, leaving what this database already holds", () => {
    // 7,916 patients have a birth date here and Salesforce has one for 6.7% -
    // so a bad value must never become a write.
    expect(normaliseDob("31/07/1982", today)).toBeNull();
    expect(normaliseDob("", today)).toBeNull();
    expect(normaliseDob(null, today)).toBeNull();
  });
});

describe("normaliseSource", () => {
  it("maps the choices the app's own form offers", () => {
    expect(normaliseSource("Walk-in")).toBe("Walk-in");
    expect(normaliseSource("walk in")).toBe("Walk-in");
    expect(normaliseSource("ADVERTISEMENT")).toBe("Advertisement");
    expect(normaliseSource(" Dr referral ")).toBe("Dr. referral");
    expect(normaliseSource("Referred by Patient")).toBe("Referred by Patient");
    expect(normaliseSource("campaign")).toBe("Campaign");
    expect(normaliseSource("Others")).toBe("Other");
  });

  it("keeps the spellings already in this database, rather than renaming them", () => {
    // 4,322 patients are "Social media", 195 "Reference - other patients", 84
    // "Reference - other Dr". The clinic has been reading those words for
    // months and their reports group by them.
    expect(normaliseSource("Social media")).toBe("Social media");
    expect(normaliseSource("instagram")).toBe("Social media");
    expect(normaliseSource("Reference - other patients")).toBe("Reference - other patients");
    expect(normaliseSource("reference-other dr")).toBe("Reference - other Dr");
  });

  it("reads through the case and double spacing free text arrives in", () => {
    expect(normaliseSource("Walk-In")).toBe("Walk-in");
    expect(normaliseSource("social  media")).toBe("Social media");
    // Collapsing runs of space is as far as it goes - "walk - in" is a spelling
    // nobody has used, and guessing at it is how a wrong category gets written.
    expect(normaliseSource("  walk   -   in  ")).toBeNull();
  });

  it("never returns the word this whole change exists to remove", () => {
    expect(normaliseSource("salesforce")).toBeNull();
    expect(normaliseSource("Salesforce")).toBeNull();
  });

  it("refuses filler, which means nobody recorded a source", () => {
    for (const filler of ["NA", "n/a", "nil", "none", "-", ".", "unknown", "not specified", "test"]) {
      expect(normaliseSource(filler)).toBeNull();
    }
  });

  it("refuses a value it does not recognise instead of inventing a category", () => {
    // Reported by the dry run as unmappedSource, so it is mapped deliberately.
    expect(normaliseSource("Hospital tie-up")).toBeNull();
    expect(normaliseSource("Google")).toBeNull();
    expect(normaliseSource("")).toBeNull();
    expect(normaliseSource(null)).toBeNull();
    expect(normaliseSource(undefined)).toBeNull();
  });

  it("only ever returns something the Source column already holds somewhere", () => {
    // A value off this list renders blank in the Select and reads as no source
    // at all, so an import must not create one.
    const live = new Set([
      "Walk-in", "Advertisement", "Dr. referral", "Referred by Patient", "Campaign", "Other",
      "Social media", "Reference - other patients", "Reference - other Dr", "Other Dr. referral",
    ]);
    const samples = [
      "walk-in", "walkin", "advertising", "ad", "doctor referral", "patient referral",
      "others", "facebook", "socialmedia", "reference-other patients", "other dr. referral",
    ];
    for (const raw of samples) {
      const out = normaliseSource(raw);
      expect(out).not.toBeNull();
      expect(live.has(out!)).toBe(true);
    }
  });
});
