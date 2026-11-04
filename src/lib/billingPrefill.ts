/**
 * What a prefill payload is allowed to fill on a new bill: never a line item.
 *
 * Billing can be opened from a procedure ("Create Invoice") or an appointment
 * ("New Bill"), and those screens stash a payload in sessionStorage. It used to
 * carry the visit's services and the visit's medicines, and Billing resolved
 * each one against the masters into a priced row.
 *
 * Neither belongs there. A doctor recommending a procedure is a clinical note,
 * not a decision about what to charge, and a prescribed medicine is not a sale -
 * the patient may buy it elsewhere or not at all. Both arrived on the bill
 * looking like figures somebody had agreed, and the biller deleted them.
 *
 * So the bill opens with the patient, the doctor and the visit it belongs to,
 * and one empty line. Whoever bills types what was actually charged.
 *
 * The rule lives here rather than in the screens that write the payload, and it
 * works by naming what may pass rather than by listing what may not: a payload
 * can grow a new key, and a new route into Billing can start sending one,
 * without either becoming a line on somebody's bill.
 */

export interface BillingPrefillFields {
  patientId?: string;
  doctorId?: string;
  appointmentId?: string;
}

const id = (value: unknown): string | undefined => {
  const v = typeof value === "string" ? value.trim() : "";
  return v === "" ? undefined : v;
};

/** The three ids, and nothing else, from whatever was stashed. */
export function billingPrefillFields(payload: unknown): BillingPrefillFields {
  if (!payload || typeof payload !== "object") return {};
  const raw = payload as Record<string, unknown>;
  const out: BillingPrefillFields = {};
  const patientId = id(raw.patientId);
  const doctorId = id(raw.doctorId);
  const appointmentId = id(raw.appointmentId);
  if (patientId) out.patientId = patientId;
  if (doctorId) out.doctorId = doctorId;
  if (appointmentId) out.appointmentId = appointmentId;
  return out;
}

/** Parse the sessionStorage payload, surviving anything that is not JSON. */
export function readBillingPrefill(raw: string | null): BillingPrefillFields {
  if (!raw) return {};
  try {
    return billingPrefillFields(JSON.parse(raw));
  } catch {
    return {};
  }
}
