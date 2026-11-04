import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { patientAgeLabel, patientAgeValue, patientAgeMonths, patientIdentityLine } from "./patientIdentity";

/** Fixed, so an age never depends on the day the tests happen to run. */
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("patientAgeLabel", () => {
  it("reads as plain years", () => {
    expect(patientAgeLabel("1992-04-10")).toBe("34 yrs");
  });

  it("says one year in the singular", () => {
    expect(patientAgeLabel("2025-04-10")).toBe("1 yr");
  });

  // The clinic sees infants now, and "<1 yr" - like the "0" everywhere else -
  // does not tell a doctor what they need for a dose.
  it("does not call an infant 0 yrs", () => {
    expect(patientAgeLabel("2026-06-01")).toBe("3 months");
  });

  it("counts a baby's months", () => {
    expect(patientAgeLabel("2025-11-14")).toBe("10 months");
    expect(patientAgeLabel("2026-08-30")).toBe("1 month");
  });

  it("says one month in the singular, like one year", () => {
    expect(patientAgeLabel("2026-08-30")).toBe("1 month");
    expect(patientAgeLabel("2026-08-29")).toBe("1 month");
  });

  it("has something to say about a newborn", () => {
    expect(patientAgeLabel("2026-09-30")).toBe("<1 month");
    expect(patientAgeLabel("2026-09-15")).toBe("<1 month");
  });

  // The whole reason years are counted from the same months: a first birthday
  // must not read "12 months".
  it("turns one on the first birthday, not at twelve months", () => {
    expect(patientAgeLabel("2025-09-30")).toBe("1 yr");
    expect(patientAgeLabel("2025-10-01")).toBe("11 months");
  });

  it("is blank for a date of birth in the future", () => {
    expect(patientAgeLabel("2027-01-01")).toBe("");
  });

  it("is blank when no date of birth was recorded", () => {
    expect(patientAgeLabel(null)).toBe("");
    expect(patientAgeLabel("")).toBe("");
    expect(patientAgeLabel("not a date")).toBe("");
  });
});

describe("patientIdentityLine", () => {
  it("shows both, which is what the doctor asked for", () => {
    expect(patientIdentityLine({ date_of_birth: "1992-04-10", gender: "Female" })).toBe("34 yrs · Female");
  });

  it("shows whichever half is known", () => {
    expect(patientIdentityLine({ date_of_birth: "1992-04-10", gender: null })).toBe("34 yrs");
    expect(patientIdentityLine({ date_of_birth: null, gender: "Male" })).toBe("Male");
  });

  it("is blank rather than a row of dashes when neither is recorded", () => {
    expect(patientIdentityLine({ date_of_birth: null, gender: "  " })).toBe("");
    expect(patientIdentityLine(null)).toBe("");
    expect(patientIdentityLine({})).toBe("");
  });
});

/**
 * The same age where the screen has already written the word "Age", so those
 * headers go on reading "Age 29" for everybody over a year old and only the
 * infants change.
 */
describe("patientAgeValue", () => {
  it("is the bare number of years, with no unit", () => {
    expect(patientAgeValue("1992-04-10")).toBe("34");
    expect(patientAgeValue("2025-04-10")).toBe("1");
  });

  it("spells out an infant's months, because a bare 0 says nothing", () => {
    expect(patientAgeValue("2026-06-01")).toBe("3 months");
    expect(patientAgeValue("2026-09-30")).toBe("<1 month");
  });

  it("is blank when there is no usable date of birth", () => {
    expect(patientAgeValue(null)).toBe("");
    expect(patientAgeValue("not a date")).toBe("");
    expect(patientAgeValue("2027-01-01")).toBe("");
  });
});

describe("patientAgeMonths", () => {
  it("counts whole calendar months, not days divided by thirty", () => {
    expect(patientAgeMonths("2026-09-30")).toBe(0);
    expect(patientAgeMonths("2026-08-30")).toBe(1);
    expect(patientAgeMonths("2025-09-30")).toBe(12);
    expect(patientAgeMonths("1992-04-10")).toBe(413);
  });

  // Born on the 30th, so the 1st is not another month.
  it("waits for the day of the month to come round", () => {
    expect(patientAgeMonths("2026-08-31")).toBe(0);
    expect(patientAgeMonths("2026-09-01")).toBe(0);
  });

  it("has nothing to count without a usable date", () => {
    expect(patientAgeMonths(null)).toBeNull();
    expect(patientAgeMonths("not a date")).toBeNull();
    expect(patientAgeMonths("2027-01-01")).toBeNull();
  });
});
