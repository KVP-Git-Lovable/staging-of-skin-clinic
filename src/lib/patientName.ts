/**
 * Does this patient have a name, or only a phone number where a name should be?
 *
 * Every patient dropdown in the app opened on a wall of "Unnamed — 6282285155".
 * Not because the names are blank - no patient's name is blank - but because
 * 153 imported records hold the phone number in the name column, first_name
 * equal to phone exactly. Digits sort before letters, so those rows sat at the
 * front of the first page and filled it.
 *
 * The rule lives here, rather than inside the dropdown, so the label that reads
 * "Unnamed" and the list that decides whom to show cannot start disagreeing
 * about who that is.
 */

/** Digits, spaces and the punctuation a phone number is written with - nothing else. */
const PHONE_LIKE_NAME = /^[+\d\s()-]{7,}$/;

export interface NamedPatient {
  first_name?: string | null;
  last_name?: string | null;
}

/** The name as stored, both parts, tidied of double spaces. */
export function rawPatientName(patient: NamedPatient | null | undefined): string {
  return `${patient?.first_name || ""} ${patient?.last_name || ""}`.replace(/\s+/g, " ").trim();
}

export function isPhoneLikeName(name: string | null | undefined): boolean {
  const value = (name || "").trim();
  return !!value && PHONE_LIKE_NAME.test(value);
}

/**
 * True when there is something to read. A name carrying a digit - "Dr K2" - is
 * still a name; only one made entirely of phone characters is not.
 */
export function hasRealName(patient: NamedPatient | null | undefined): boolean {
  const name = rawPatientName(patient);
  return !!name && !isPhoneLikeName(name);
}
