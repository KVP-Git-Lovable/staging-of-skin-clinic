/**
 * The line under a patient's name while a doctor writes: age and gender.
 *
 * Doctors asked for it on the prescription form - dosage, and much of what they
 * write, depends on both, and having to leave the form to look them up is how a
 * prescription gets written from memory.
 *
 * Age is worked out from the date of birth here, and only here, so no screen
 * can disagree about how old somebody is. Nothing is stored: this is read and
 * shown.
 *
 * Note what this is NOT: `patientAge` in patientFields.ts is the age as a
 * NUMBER of years, and that one feeds list filters, sorting, chart totals and
 * the audience a WhatsApp journey is sent to. It stays a number. What changes
 * here is only how an age is written down.
 */

export interface PatientIdentity {
  date_of_birth?: string | null;
  gender?: string | null;
}

/**
 * How many whole months old, by the calendar.
 *
 * The clinic sees infants, and a baby's age in years is 0 - which told the
 * doctor nothing and read as "Age 0" on the record and on the prescription,
 * where the dose depends on it.
 *
 * Counted by calendar month rather than by dividing days, because a month is
 * not a fixed number of days and a dose is not something to be approximate
 * about. The day-of-month correction is what stops somebody born on the 30th
 * counting a month on the 1st.
 */
export function patientAgeMonths(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let months =
    (now.getFullYear() - born.getFullYear()) * 12 + (now.getMonth() - born.getMonth());
  if (now.getDate() < born.getDate()) months -= 1;
  // A date in the future is not an age.
  return months < 0 ? null : months;
}

/** Years and months from the one count, so the two can never disagree. */
const split = (dob: string | null | undefined) => {
  const months = patientAgeMonths(dob);
  if (months === null) return null;
  return { months, years: Math.floor(months / 12) };
};

/**
 * "34 yrs", "1 yr", "7 months", "1 month", "<1 month", or "" when no date of
 * birth is recorded.
 *
 * Under a year reads in months; a year and over reads in years alone, which is
 * all anybody wants by then. The years come from the same month count as the
 * months do, so a child on their first birthday reads "1 yr" and never
 * "12 months".
 */
export function patientAgeLabel(dob: string | null | undefined): string {
  const age = split(dob);
  if (!age) return "";
  if (age.years >= 1) return age.years === 1 ? "1 yr" : `${age.years} yrs`;
  if (age.months === 0) return "<1 month";
  return age.months === 1 ? "1 month" : `${age.months} months`;
}

/**
 * The same age, for the places that have already written the word "Age".
 *
 * "29" rather than "29 yrs" there, so those headers read exactly as they
 * always have for everybody over a year old - only the infants change, to
 * "Age 7 months".
 */
export function patientAgeValue(dob: string | null | undefined): string {
  const age = split(dob);
  if (!age) return "";
  return age.years >= 1 ? String(age.years) : patientAgeLabel(dob);
}

/**
 * "34 yrs · Female", or whichever half is known, or "" when neither is.
 *
 * An empty string rather than a placeholder: a line that reads "— · —" tells a
 * doctor nothing and takes up the same space.
 */
export function patientIdentityLine(patient: PatientIdentity | null | undefined): string {
  const age = patientAgeLabel(patient?.date_of_birth);
  const gender = String(patient?.gender ?? "").trim();
  return [age, gender].filter(Boolean).join(" · ");
}
