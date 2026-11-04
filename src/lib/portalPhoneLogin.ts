/**
 * The decisions behind logging into the patient portal by phone.
 *
 * These live here, pure and tested, because the versions that mattered were
 * buried in three edge functions that could not be run locally - which is
 * how the portal came to tell 26,625 of 27,625 patients that their number
 * was not registered without anybody noticing.
 *
 * The edge functions mirror `phoneKey` rather than importing it: Deno
 * cannot reach the browser bundle. Keep the two in step - it decides who
 * can log in.
 */

/**
 * The ten digits a number is matched on, or "" if it is not a number.
 *
 * The clinic's phones are stored every which way - "9663438657",
 * "+91 96634 38657", "919663438657", "09663438657" - so everything that is
 * not a digit goes, and the last ten are what remain. This is the same rule
 * as the `phone_last10` column the database matches on, and the same one
 * sf-match-phones has always used.
 *
 * Fewer than ten digits returns "" rather than a short key. A partial
 * number must never match the tail of somebody else's.
 */
export function phoneKey(input: string | null | undefined): string {
  const digits = String(input ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

/** A patient reachable on a number, as the login screen needs them. */
export interface PortalCandidate {
  id: string;
  name?: string | null;
}

export type PortalStep =
  | { kind: "incomplete_number" }
  | { kind: "not_registered" }
  | { kind: "choose_patient"; patients: PortalCandidate[] }
  | { kind: "proceed"; patient: PortalCandidate };

/**
 * What the login screen should do with a number.
 *
 * Three outcomes rather than two, because a fifth of this clinic's patients
 * share a phone with somebody else - families, up to fourteen on one
 * number - and the PIN belongs to the person. Resolving a shared number to
 * a single patient is what locked everybody else on it out.
 *
 * An incomplete number is told so. It used to come back as "not
 * registered", which sent people to the clinic to check a number that was
 * only half typed.
 */
export function portalLoginStep(
  input: string | null | undefined,
  candidates: readonly PortalCandidate[],
): PortalStep {
  if (!phoneKey(input)) return { kind: "incomplete_number" };
  if (candidates.length === 0) return { kind: "not_registered" };
  if (candidates.length === 1) return { kind: "proceed", patient: candidates[0] };
  return { kind: "choose_patient", patients: [...candidates] };
}

/**
 * The patient a request may act on.
 *
 * THE SECURITY LINE. `patientId` arrives from the browser after the chooser
 * has been shown, and it is checked against the patients actually on that
 * number instead of being trusted. Without this, pairing any patient's uuid
 * with any phone number would let somebody set a PIN on a record that is
 * not theirs and read that patient's history.
 *
 * No id and exactly one candidate is the ordinary case - one person on a
 * number, nothing to choose. No id and several means the chooser has not
 * been answered yet, which is not an identification.
 */
export function resolvePortalPatient(
  candidates: readonly PortalCandidate[],
  patientId?: string | null,
): PortalCandidate | null {
  if (candidates.length === 0) return null;
  if (!patientId) return candidates.length === 1 ? candidates[0] : null;
  return candidates.find((c) => c.id === patientId) ?? null;
}
