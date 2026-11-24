import { buildTokenFilters } from "@/lib/fuzzySearch";
import { phoneKey } from "@/lib/portalPhoneLogin";

/**
 * How a patient is searched for, in one place.
 *
 * ── Why this exists ──
 *
 * The clinic reported that searching by a patient's alternate number found
 * nobody. The Patients page had searched `alternate_phone` for months - but it
 * is one of FOUR places a staff member looks a patient up, and it was the only
 * one that covered it:
 *
 *   Patients page, default "All" view     covered
 *   Patients page, on any SAVED view      not covered  (fetchAllPatients)
 *   Top-bar search                        not covered  (GlobalSearch)
 *   The picker used to book and prescribe not covered  (PatientCombobox)
 *
 * Eight saved patient views are in use, so selecting one flipped the same
 * search onto the path without the column. The cause was not a hard problem,
 * it was a copy-pasted column list: the same five names appear in about ten
 * places across the app and `alternate_phone` was added to exactly one of
 * them. This module is the single list, so the next column cannot drift the
 * same way.
 */

/** Every column a patient search looks at. The one list. */
export const PATIENT_SEARCH_COLUMNS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "alternate_phone",
] as const;

/**
 * The columns a phone search matches, and why each one is there.
 *
 * `phone_last10` and `alternate_phone_last10` are generated, stored columns -
 * the digits of the number with everything else stripped, kept in step by
 * Postgres itself with no trigger and no backfill. They are what makes the
 * search immune to how a number was typed in: 15 patients have a primary
 * number stored with spaces INSIDE the digits, like " 63628 80642", and no
 * `ilike '%6362880642%'` can ever match that.
 *
 * The raw columns stay because they catch a stored number whose digits run
 * together with a country code, and both are trigram-indexed.
 *
 * The NAME columns stay because 153 patients have a phone number recorded in
 * their name field - `isPhoneLikeName` exists for them - so a digit string is
 * a plausible name search here, not only a number.
 */
const PHONE_MATCH_COLUMNS = {
  exact: ["phone_last10", "alternate_phone_last10"],
  contains: ["phone", "alternate_phone", "first_name", "last_name"],
} as const;

/**
 * The PostgREST `.or()` arguments for a patient search term.
 *
 * Each string is passed to a SEPARATE `.or()` call, which PostgREST ANDs
 * together - so every token has to appear somewhere on the record.
 *
 * ── The trap, which is the whole reason this is not a one-line fix ──
 *
 * When the term is a phone number this returns exactly ONE filter, and that
 * filter REPLACES the per-token filters rather than joining them.
 *
 * Because separate `.or()` calls are ANDed, a phone clause added BESIDE the
 * token filters would still match nobody. Typing "+91 96634 38657" tokenises
 * to "+91", "96634" and "38657"; those three ANDed filters match no record,
 * and ANDing a correct phone clause with them yields nothing. The obvious fix
 * - append the phone columns to the list - does not work, and would have
 * looked right in review.
 *
 * The digits, not the raw string, are what the `ilike`s use, so a term typed
 * with spaces or a +91 still finds a number stored without them.
 */
export function patientSearchFilters(term: string): string[] {
  const digits = phoneKey(term);

  // phoneKey returns "" for anything under ten digits. That is deliberate and
  // is a safety property, not a limitation: a partial number must never match
  // the tail of a stranger's. The database comment on portal_patients_by_phone
  // says the same thing about the same columns.
  if (digits) {
    const clauses = [
      ...PHONE_MATCH_COLUMNS.exact.map((c) => `${c}.eq.${digits}`),
      ...PHONE_MATCH_COLUMNS.contains.map((c) => `${c}.ilike.%${digits}%`),
    ];
    return [clauses.join(",")];
  }

  return buildTokenFilters(term, [...PATIENT_SEARCH_COLUMNS]);
}

/** True when this term will be searched as a phone number. */
export function isPhoneSearch(term: string): boolean {
  return phoneKey(term) !== "";
}
