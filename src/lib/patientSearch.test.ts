import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { PATIENT_SEARCH_COLUMNS, isPhoneSearch, patientSearchFilters } from "./patientSearch";

const read = (p: string) => readFileSync(p, "utf8");
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The four stored shapes of one real number, from portalPhoneLogin's own docs. */
const SAME_NUMBER = ["9663438657", "+91 96634 38657", "919663438657", "09663438657"];

describe("patientSearchFilters: a phone number", () => {
  it("returns exactly ONE filter, never two", () => {
    // The property the whole fix rests on. PostgREST ANDs separate .or()
    // calls, so a phone clause returned ALONGSIDE the per-token filters would
    // be ANDed with them - and "+91 96634 38657" tokenises to three tokens
    // that match nobody, so the result would still be empty. Appending the
    // phone columns to the shared list is the obvious fix and it does not work.
    for (const typed of SAME_NUMBER) {
      expect(patientSearchFilters(typed), `"${typed}" produced more than one filter`).toHaveLength(1);
    }
  });

  it("matches the normalised digits however the number was typed", () => {
    // All four forms must produce the identical filter, because they are the
    // same patient.
    const filters = SAME_NUMBER.map((t) => patientSearchFilters(t)[0]);
    expect(new Set(filters).size, "the four stored forms disagree").toBe(1);
    expect(filters[0]).toContain("phone_last10.eq.9663438657");
  });

  it("covers the alternate number, which is the bug that was reported", () => {
    const [filter] = patientSearchFilters("9663438657");
    expect(filter).toContain("alternate_phone_last10.eq.9663438657");
    expect(filter).toContain("alternate_phone.ilike.%9663438657%");
  });

  it("matches on the stored digits as well as the normalised column", () => {
    // 15 patients have a primary number stored with spaces INSIDE the digits,
    // like " 63628 80642", which no ilike can match - the last10 column is the
    // only thing that finds them. The raw ilikes stay for a number stored
    // with its country code glued on, which the last10 column also handles but
    // which the trigram index serves faster for a partial.
    const [filter] = patientSearchFilters("6362880642");
    expect(filter).toContain("phone_last10.eq.6362880642");
    expect(filter).toContain("phone.ilike.%6362880642%");
  });

  it("still searches the name columns, because 153 patients are named a number", () => {
    const [filter] = patientSearchFilters("9663438657");
    expect(filter).toContain("first_name.ilike.%9663438657%");
    expect(filter).toContain("last_name.ilike.%9663438657%");
  });

  it("uses the digits for the ilikes, not the raw typed string", () => {
    const [filter] = patientSearchFilters("+91 96634 38657");
    expect(filter).not.toContain("+91");
    expect(filter).not.toContain(" ");
  });
});

describe("patientSearchFilters: anything that is not a phone number", () => {
  it("refuses to build a phone clause from a partial number", () => {
    // A partial must never match the tail of a stranger's number. phoneKey
    // already refuses under ten digits and the database comment on
    // portal_patients_by_phone says the same of the same columns.
    for (const partial of ["966343865", "96634", "9663", "12"]) {
      expect(isPhoneSearch(partial), `"${partial}" was treated as a phone`).toBe(false);
      expect(patientSearchFilters(partial).join(","), `"${partial}" built a last10 clause`)
        .not.toContain("_last10.eq.");
    }
  });

  it("searches every column for a name, one filter per word", () => {
    const filters = patientSearchFilters("nisha rai");
    // Separate filters, because PostgREST ANDs them: the record must contain
    // both words, not either.
    expect(filters).toHaveLength(2);
    for (const col of PATIENT_SEARCH_COLUMNS) {
      expect(filters[0]).toContain(`${col}.ilike.%nisha%`);
      expect(filters[1]).toContain(`${col}.ilike.%rai%`);
    }
  });

  it("includes alternate_phone in the shared column list", () => {
    expect([...PATIENT_SEARCH_COLUMNS]).toContain("alternate_phone");
  });

  it("is safe on an empty search", () => {
    expect(patientSearchFilters("")).toEqual([]);
    expect(patientSearchFilters("   ")).toEqual([]);
  });
});

/**
 * The guard that would have caught the original bug.
 *
 * alternate_phone was added to the Patients page's column list and to none of
 * the nine other copies, so the same search worked or failed depending on
 * which screen - and which saved view - you happened to be on. Nothing failed,
 * because nothing checked that the surfaces agreed.
 */
describe("every patient search surface uses the shared rule", () => {
  const SURFACES = [
    ["Patients page (both paths)", "src/lib/patientsPage.ts"],
    ["Top-bar search", "src/components/layout/GlobalSearch.tsx"],
    ["Booking / prescription picker", "src/components/patients/PatientCombobox.tsx"],
  ] as const;

  for (const [name, path] of SURFACES) {
    it(`${name} calls patientSearchFilters`, () => {
      expect(code(read(path)), `${path} no longer uses the shared rule`).toContain("patientSearchFilters(");
    });

    it(`${name} does not build its own patient column list`, () => {
      // buildTokenFilters with a hand-written list is exactly how the lists
      // drifted apart. The shared rule calls it; the surfaces must not.
      const text = code(read(path));
      const calls = text.match(/buildTokenFilters\([^)]*\)/g) ?? [];
      expect(calls, `${path} hand-rolls a column list: ${calls.join(" ")}`).toHaveLength(0);
    });
  }

  it("the Patients page searches the same columns on a saved view as on All", () => {
    // fetchAllPatients is the path every saved view takes, and the one that
    // was missing alternate_phone. Eight saved patient views are in use.
    const text = code(read("src/lib/patientsPage.ts"));
    const fetchAll = text.match(/export const fetchAllPatients[\s\S]*?\n};/)?.[0] ?? "";
    expect(fetchAll, "fetchAllPatients not found").not.toBe("");
    expect(fetchAll, "the saved-view path has its own filter again").toContain("patientSearchFilters(term)");
  });
});
