/**
 * The choices offered for a patient's Source and Gender, in one place.
 *
 * The Add Patient form and the patient Details tab each kept their own literal
 * list and they had drifted apart: the form offered six sources, Details three,
 * and they did not use the same words - the form writes "Dr. referral" while
 * Details offered "Other Dr. referral". So Source could be set on registration
 * and then not reproduced when editing the record.
 *
 * A stored value that is not on the list is worse than it sounds. A Select
 * whose options omit the current value renders blank, so the patient reads as
 * having no source at all, and saving quietly replaces it. The live data is
 * full of values from before this list existed - 4,322 patients are
 * "Social media", 9,867 "salesforce", 194 "Reference - other patients" - so
 * `optionsIncluding` keeps whatever a record already holds without offering it
 * as something new to pick.
 */

export const PATIENT_SOURCE_OPTIONS = [
  "Walk-in",
  "Advertisement",
  "Dr. referral",
  "Referred by Patient",
  "Campaign",
  "Other",
] as const;

export const PATIENT_GENDER_OPTIONS = ["Male", "Female", "Other", "Prefer not to say"] as const;

/** The list to render, with the value a record already holds kept on it. */
export function optionsIncluding(
  stored: string | null | undefined,
  canonical: readonly string[],
): string[] {
  const value = (stored ?? "").trim();
  if (!value || canonical.includes(value)) return [...canonical];
  return [...canonical, value];
}
