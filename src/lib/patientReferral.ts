/**
 * Who referred this patient - and so which picker the form should show.
 *
 * Three screens decided this three different ways and disagreed:
 *
 *   Add form, doctor picker     source.toLowerCase().includes("referral")
 *   Add form, patient picker    source === "Referred by Patient"
 *   Patient Details tab         source is "Dr. referral" or "Referred by Patient"
 *
 * None of the three matched the sources most of the clinic's referral patients
 * actually carry. The Salesforce import wrote "Reference - other Dr" on 152
 * patients and "Reference - other patients" on 394, and on all 546 of them no
 * screen offered any box at all - so who referred them could never be recorded,
 * and the field simply was not there.
 *
 * One function now, matching on what the words mean rather than on an exact
 * spelling, so a source written before this app existed is still understood.
 */

export type ReferralKind = "doctor" | "patient" | "none";

// "referral", "referred" and "reference" all contain it, which is the point:
// the clinic's live data uses all three spellings.
const MENTIONS_REFERRAL = /refer/i;
const MENTIONS_PATIENT = /\bpatients?\b/i;
const MENTIONS_DOCTOR = /\b(dr|drs|doctor|doctors)\b/i;

/**
 * Which kind of referrer this source implies.
 *
 * A patient beats a doctor because "Referred by Patient" names no doctor, while
 * "Reference - other Dr" names no patient. A source that talks about a referral
 * but says neither falls to "doctor", which is what the Add form has always
 * done with a bare "referral".
 */
export function referralKind(source: string | null | undefined): ReferralKind {
  const value = (source ?? "").trim();
  if (!value || !MENTIONS_REFERRAL.test(value)) return "none";
  if (MENTIONS_PATIENT.test(value)) return "patient";
  if (MENTIONS_DOCTOR.test(value)) return "doctor";
  return "doctor";
}

/**
 * Does changing the source to this invalidate the referrer already stored?
 *
 * The column holds a doctor's NAME for a doctor referral and the referring
 * patient's ID for a patient one. Switching between the two kinds without
 * clearing it leaves a name where an id is expected - the lookup then finds
 * nobody and the Details tab prints the raw text as if it were a patient.
 */
export function referrerStillApplies(
  previousSource: string | null | undefined,
  nextSource: string | null | undefined,
): boolean {
  const next = referralKind(nextSource);
  return next !== "none" && next === referralKind(previousSource);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The stored referrer, when it is actually a patient id.
 *
 * `source_referral_doctor` holds a doctor's NAME for a doctor referral and the
 * referring patient's ID for a patient one, so a value read as an id may well
 * be "Dr. Mariappa" - on any record written before the two were kept apart.
 * Handing that to a patient picker makes it query `.eq("id", "Dr. Mariappa")`,
 * which Postgres rejects outright (22P02), so the guard belongs here with the
 * rule that creates the ambiguity rather than copied into each screen.
 */
export function referringPatientId(value: string | null | undefined): string {
  const candidate = String(value ?? "").trim();
  return UUID.test(candidate) ? candidate : "";
}

/**
 * The referring doctor's name, when the stored value actually is one.
 *
 * Same ambiguity as above, read the other way round: `source_referral_doctor`
 * holds a doctor's NAME for a doctor referral and a patient's ID for a patient
 * one, and older rows mixed the two. A report that printed the raw column
 * would show a bare UUID in a column headed "Referring doctor", which reads as
 * data corruption rather than as the blank it really is.
 *
 * Empty string, not null, so a table cell and a CSV both come out blank.
 */
export function referringDoctorName(value: string | null | undefined): string {
  const candidate = String(value ?? "").trim();
  if (!candidate || UUID.test(candidate)) return "";
  return candidate;
}
