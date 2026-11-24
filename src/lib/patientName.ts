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
  /**
   * Only read when a message is being addressed to this patient. Optional, so
   * every existing caller that passes a name-only object still type-checks.
   */
  gender?: string | null;
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

/**
 * Is this name usable inside a WhatsApp message?
 *
 * Stricter than hasRealName, and deliberately so. hasRealName answers "is
 * there something to show in a list", where a single letter is at least
 * truthful. A message is different: "Hello Ms. A," reads as a bug to the person
 * receiving it. 241 patients have a single-letter FIRST name, and almost all of
 * them carry a surname too, so they stay sendable as "A Kumar"; 8 have nothing
 * beyond that single letter and are the ones this refuses.
 *
 * This MUST stay in step with isSendableName in
 * supabase/functions/_shared/patient-greeting.ts, which is the rule the server
 * actually enforces. Deno cannot import from the browser bundle, so the two are
 * restated - and followupSend.test.ts holds them against each other case by
 * case, because a client that enables a button the server then refuses is
 * worse than no button.
 */
export function isSendableName(name: string | null | undefined): boolean {
  const text = String(name ?? "").trim();
  if (text.length < 2) return false;
  // Must contain a Latin letter. That one line is what refuses the 153 records
  // holding a phone number in the name column, because "9663438657" and
  // "+91 96634 38657" contain no letter at all - checked against live data: the
  // 153 phone-shaped names and the 153 letterless names are the same 153 rows.
  // An earlier version also tested the name against a phone-number shape; that
  // test could never fire, since a string of digits and brackets has no letter
  // either, and a check no input can reach is a check no test can hold.
  //
  // 0 patients have a name written in a non-Latin script, so nobody is refused
  // on that account today. If Kannada or Devanagari names are ever imported,
  // this is the line that has to widen.
  return /[a-z]/i.test(text);
}

/**
 * Mr. / Ms. from a gender, or "" when there is nothing to go on.
 *
 * "Ms." rather than "Miss" on purpose: it carries no claim about whether
 * somebody is married, and 18,867 of this clinic's patients are female, so
 * the wrong guess is not a rare event. 30 patients have no gender recorded
 * and correctly get no title at all.
 *
 * Restated from supabase/functions/_shared/patient-greeting.ts rather than
 * imported, because Deno cannot import from the browser bundle. The two are
 * held against each other case by case in followupSend.test.ts: the WhatsApp
 * follow-ups are addressed from here and the appointment confirmations from
 * there, and the same patient must not be "Ms." in one and something else in
 * the other.
 */
export function titleFromGender(gender?: string | null): string {
  if (!gender) return "";
  const g = gender.toLowerCase();
  if (g.startsWith("m")) return "Mr.";
  if (g.startsWith("f")) return "Ms.";
  return "";
}

/**
 * How the clinic addresses this patient - "Ms. Surekha", "Dr. Krithi", or ""
 * when the record holds nothing usable.
 *
 * Returns "" rather than guessing, so a caller can fall back to a bare
 * "Hello,". 161 patients land there.
 */
export function patientGreeting(patient: NamedPatient | null | undefined): string {
  const name = rawPatientName(patient);
  if (!isSendableName(name)) return "";
  // 642 patients already carry a title, 633 of them a "Dr"/"Dr." - so adding
  // another would produce "Ms. Dr. Krithi".
  if (/^(dr|mr|mrs|ms|miss|prof)\.?\s/i.test(name)) return name;
  const title = titleFromGender(patient?.gender);
  return title ? `${title} ${name}` : name;
}
