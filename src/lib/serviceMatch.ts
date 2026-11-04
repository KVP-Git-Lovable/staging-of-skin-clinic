import { isConsultationService } from "./consultationLine";

/**
 * Matching a service name recorded on a visit to a row in the Service Master.
 *
 * This decides what a patient is charged when an invoice is raised from a
 * visit, and it got that wrong. The master holds one consultation per doctor
 * - "CONSULTATION - DR ASHWINI ASHOKAN" at 800, "CONSULTATION - DR PUNYA
 * SUVARNA" at 850, and so on - while an imported visit records the service
 * as plain "Consultation". The old rule accepted a master entry that merely
 * STARTED WITH the name being looked up, so "consultation" matched
 * "consultation dr ashwini ashokan", and whichever doctor happened to sort
 * first was billed for every consultation in the clinic.
 *
 * The rule now runs the other way only: a master entry may be matched when
 * the name in hand is at least as specific as it is, never when the master
 * entry adds detail the name never had. Guessing which doctor was meant is
 * exactly the guess that should not be made.
 */
export interface MasterService {
  id?: string;
  name?: string | null;
  price?: number | string | null;
  hsn_code?: string | null;
  gst_percent?: number | string | null;
}

const norm = (v: unknown) =>
  String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function resolveServiceFromMaster<T extends MasterService>(
  name: string,
  master: T[],
): T | undefined {
  // A bare "Consultation" is not a service (see consultationLine.ts). It must
  // not be resolved to any doctor's consultation, and no line is billed for
  // it unless someone picks one deliberately.
  if (isConsultationService(name)) return undefined;

  const key = norm(name);
  if (!key) return undefined;

  return (
    master.find((s) => norm(s?.name) === key) ||
    // The name in hand is the more specific one: "Peel - face" may settle on
    // a master "Peel". The reverse is refused.
    master.find((s) => {
      const candidate = norm(s?.name);
      return !!candidate && key.startsWith(candidate);
    }) ||
    master.find((s) => {
      const candidate = norm(s?.name);
      return !!candidate && key.includes(candidate);
    })
  );
}
