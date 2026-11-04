import { describe, it, expect } from "vitest";
import {
  displayToIso,
  isoToDisplay,
  maskTyping,
  displayDate,
  isPlausibleIso,
  MAX_DATETIME,
  MIN_DATETIME,
} from "./dateInput";

describe("isoToDisplay", () => {
  it("turns a stored date into dd/MM/yyyy", () => {
    expect(isoToDisplay("1982-07-31")).toBe("31/07/1982");
  });

  it("ignores a trailing timestamp", () => {
    expect(isoToDisplay("1982-07-31T00:00:00Z")).toBe("31/07/1982");
  });

  it("gives an empty box for anything it cannot read", () => {
    expect(isoToDisplay("")).toBe("");
    expect(isoToDisplay(null)).toBe("");
    expect(isoToDisplay(undefined)).toBe("");
    expect(isoToDisplay("31/07/1982")).toBe("");
  });
});

describe("displayToIso", () => {
  it("turns a typed date into the stored form", () => {
    expect(displayToIso("31/07/1982")).toBe("1982-07-31");
    expect(displayToIso("01/01/2000")).toBe("2000-01-01");
  });

  it("accepts 29 February in a leap year and rejects it otherwise", () => {
    expect(displayToIso("29/02/2024")).toBe("2024-02-29");
    expect(displayToIso("29/02/2023")).toBeNull();
  });

  it("rejects a day that does not exist rather than rolling it forward", () => {
    // The trap: new Date(1982, 1, 31) is 3 March, so a naive parse would store
    // a date the user never typed.
    expect(displayToIso("31/02/1982")).toBeNull();
    expect(displayToIso("31/04/1982")).toBeNull();
    expect(displayToIso("00/01/1982")).toBeNull();
    expect(displayToIso("01/13/1982")).toBeNull();
  });

  it("leaves half-typed input unparsed instead of guessing", () => {
    expect(displayToIso("")).toBeNull();
    expect(displayToIso("31")).toBeNull();
    expect(displayToIso("31/0")).toBeNull();
    expect(displayToIso("31/07/19")).toBeNull();
    expect(displayToIso("1/1/82")).toBeNull();
  });

  it("round-trips with isoToDisplay", () => {
    expect(displayToIso(isoToDisplay("1975-12-09"))).toBe("1975-12-09");
  });
});

describe("maskTyping", () => {
  it("adds the separators as digits arrive", () => {
    expect(maskTyping("3")).toBe("3");
    expect(maskTyping("31")).toBe("31");
    expect(maskTyping("310")).toBe("31/0");
    expect(maskTyping("3107")).toBe("31/07");
    expect(maskTyping("31071982")).toBe("31/07/1982");
  });

  it("keeps already-separated text stable, so re-rendering never fights typing", () => {
    expect(maskTyping("31/07/1982")).toBe("31/07/1982");
  });

  it("shrinks as the user deletes", () => {
    expect(maskTyping("31/07/198")).toBe("31/07/198");
    expect(maskTyping("31/07/")).toBe("31/07");
    expect(maskTyping("31")).toBe("31");
    expect(maskTyping("")).toBe("");
  });

  it("drops stray characters and never exceeds a full date", () => {
    expect(maskTyping("31-07-1982")).toBe("31/07/1982");
    expect(maskTyping("31/07/19825555")).toBe("31/07/1982");
    expect(maskTyping("abc")).toBe("");
  });
});

describe("displayDate", () => {
  it("is dd/MM/yyyy whatever the machine's region", () => {
    expect(displayDate("2026-09-19T17:30:00")).toBe("19/09/2026");
    // The case that reads as a different date entirely in US order.
    expect(displayDate("2026-10-09T12:00:00")).toBe("09/10/2026");
  });

  it("pads single digits, so columns line up and nothing is ambiguous", () => {
    expect(displayDate("2026-01-05T00:00:00")).toBe("05/01/2026");
  });

  it("takes a Date or a timestamp as well as a string", () => {
    expect(displayDate(new Date(2026, 8, 19))).toBe("19/09/2026");
    expect(displayDate(new Date(2026, 8, 19).getTime())).toBe("19/09/2026");
  });

  it("renders blank rather than 'Invalid Date' for a missing or broken value", () => {
    expect(displayDate(null)).toBe("");
    expect(displayDate(undefined)).toBe("");
    expect(displayDate("")).toBe("");
    expect(displayDate("not a date")).toBe("");
  });
});

describe("a year that cannot be right", () => {
  it("refuses the mistyped year that reserved an appointment in 0268", () => {
    expect(displayToIso("01/02/0268")).toBeNull();
  });

  it("refuses a date of birth no patient could have", () => {
    expect(displayToIso("10/08/1789")).toBeNull();
    expect(displayToIso("09/12/0196")).toBeNull();
  });

  it("refuses a year too far ahead to mean anything", () => {
    expect(displayToIso("01/02/2268")).toBeNull();
  });

  it("still takes the whole range a clinic actually uses", () => {
    expect(displayToIso("01/01/1900")).toBe("1900-01-01");
    expect(displayToIso("31/12/2100")).toBe("2100-12-31");
    expect(displayToIso("19/09/2026")).toBe("2026-09-19");
    expect(displayToIso("31/07/1982")).toBe("1982-07-31");
  });

  it("agrees with itself about what is plausible", () => {
    expect(isPlausibleIso("2026-09-19")).toBe(true);
    expect(isPlausibleIso("1900-01-01")).toBe(true);
    expect(isPlausibleIso("2100-12-31")).toBe(true);
    expect(isPlausibleIso("0268-02-01")).toBe(false);
    expect(isPlausibleIso("2268-02-01")).toBe(false);
  });

  it("reads a date-and-time value by its date part, as the follow-up boxes hand it over", () => {
    expect(isPlausibleIso("0268-02-01T09:36")).toBe(false);
    expect(isPlausibleIso("2027-02-01T09:36")).toBe(true);
  });

  it("says nothing plausible about a missing or broken value", () => {
    expect(isPlausibleIso(null)).toBe(false);
    expect(isPlausibleIso(undefined)).toBe(false);
    expect(isPlausibleIso("")).toBe(false);
    expect(isPlausibleIso("not a date")).toBe(false);
  });

  it("bounds the native date-and-time boxes to the same window", () => {
    expect(MIN_DATETIME).toBe("1900-01-01T00:00");
    expect(MAX_DATETIME).toBe("2100-12-31T23:59");
    expect(isPlausibleIso(MIN_DATETIME)).toBe(true);
    expect(isPlausibleIso(MAX_DATETIME)).toBe(true);
  });
});
