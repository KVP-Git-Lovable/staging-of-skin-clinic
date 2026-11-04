import { describe, it, expect } from "vitest";
import {
  pickPickerRows,
  patientPickerColumns,
  PATIENT_PICKER_FETCH,
  PATIENT_PICKER_PAGE_SIZE,
} from "./patientPickerList";

const row = (id: string, first_name: string, last_name = "") => ({ id, first_name, last_name });

/** The shape of the live data: 153 phone-named records sort ahead of the names. */
const phoneNamed = Array.from({ length: 153 }, (_, i) => row(`p${i}`, `62822${String(i).padStart(5, "0")}`));
const named = Array.from({ length: 347 }, (_, i) => row(`n${i}`, "Patient", `Number ${i}`));

describe("pickPickerRows", () => {
  it("keeps everything when asked for nothing", () => {
    expect(pickPickerRows([row("a", "Prema", "Shetty")])).toHaveLength(1);
    expect(pickPickerRows(null)).toEqual([]);
    expect(pickPickerRows(undefined)).toEqual([]);
  });

  // The reported fault: the dropdown opened on "Unnamed - 6282285155" because
  // the 153 records that hold a phone number in the name column sort first.
  it("drops the records that carry a phone number instead of a name", () => {
    const out = pickPickerRows([...phoneNamed, ...named], { requireName: true });
    expect(out).toHaveLength(347);
    expect(out.every((r) => r.first_name === "Patient")).toBe(true);
  });

  it("keeps a name that merely contains a digit", () => {
    const out = pickPickerRows([row("a", "Dr K2"), row("b", "9876543210")], { requireName: true });
    expect(out.map((r) => r.first_name)).toEqual(["Dr K2"]);
  });

  // Nobody refers themselves. The hand-rolled picker this replaces filtered the
  // patient being edited out of their own referrer list, and that has to survive.
  it("drops the excluded patient", () => {
    const out = pickPickerRows([row("a", "Asha"), row("b", "Bala")], { excludeId: "a" });
    expect(out.map((r) => r.id)).toEqual(["b"]);
  });

  it("ignores an absent exclusion rather than dropping anyone", () => {
    const rows = [row("a", "Asha"), row("b", "Bala")];
    expect(pickPickerRows(rows, { excludeId: null })).toHaveLength(2);
    expect(pickPickerRows(rows, { excludeId: "" })).toHaveLength(2);
  });

  it("stops at the limit", () => {
    expect(pickPickerRows(named, { limit: 50 })).toHaveLength(50);
    expect(pickPickerRows(named)).toHaveLength(347);
  });

  it("filters before it slices, so a page is 50 names and not 50 rows", () => {
    const out = pickPickerRows([...phoneNamed, ...named], {
      requireName: true,
      limit: PATIENT_PICKER_PAGE_SIZE,
    });
    expect(out).toHaveLength(50);
    expect(out.every((r) => r.first_name === "Patient")).toBe(true);
  });

  // If a future import ever pushed the phone-named count past what one fetch
  // carries, the list comes back SHORT rather than wrong - the caller shows its
  // "type to search" line, and nobody sees "Unnamed" again.
  it("returns nothing rather than phone numbers when no fetched row has a name", () => {
    expect(pickPickerRows(phoneNamed, { requireName: true, limit: 50 })).toEqual([]);
  });
});

describe("patientPickerColumns", () => {
  it("asks for the source columns only when the screen needs them", () => {
    expect(patientPickerColumns(false)).not.toContain("source");
    expect(patientPickerColumns(true)).toContain("source_referral_doctor");
    for (const withSource of [true, false]) {
      expect(patientPickerColumns(withSource)).toContain("first_name");
      expect(patientPickerColumns(withSource)).toContain("phone");
    }
  });
});

describe("the fetch depth", () => {
  it("reaches past the block of phone-named records", () => {
    // 153 live records, and a page shows 50. Anything at or under 153 would put
    // the wall straight back on screen.
    expect(PATIENT_PICKER_FETCH).toBeGreaterThan(153 + PATIENT_PICKER_PAGE_SIZE);
  });
});
