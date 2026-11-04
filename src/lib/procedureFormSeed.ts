/**
 * A new procedure form opens with one empty service line. Nothing is filled in
 * for the doctor, ever.
 *
 * This has been reported four times. Each earlier fix narrowed which names were
 * allowed to pre-fill - "Consultation", then "New Consult" / "Old Consult" /
 * "consult" and their bracketed qualifiers, then an appointment's Investigation
 * text. The seed itself survived every time, so the fifth name came straight
 * through: the Service Master holds one consultation per doctor
 * ("CONSULTATION - DR P SURAKSHA" at 800, "CONSULTATION - DR PUNYA SUVARNA" at
 * 850), those are real billed services, and the filters were written to let
 * them past. Twenty-two of one doctor's appointments carry hers by name, so her
 * form opened with a consultation on it - and the auto-match then added the
 * price, the master's notes and recommendations, and every medicine and asset
 * linked to that service.
 *
 * So the question is no longer "which names may pre-fill". Nothing does. What
 * the visit was booked as is a booking, not a clinical decision, and the doctor
 * writing the procedure is the one who says what was done.
 *
 * The form takes no service from its caller at all - there is no prop to pass
 * one through, which is what stops this coming back a fifth time. Picking a
 * service from the dropdown still fills in its price, notes, medicines and
 * assets: that is a person choosing, which was never the complaint.
 */

export interface BlankServiceLine {
  key: string;
  service_id: string;
  name: string;
  procedure_notes: string;
  recommendations: string;
  material_percent: string;
  price: number;
}

/** The line every new procedure form starts with. */
export function blankServiceLine(key = `svc-${Date.now()}`): BlankServiceLine {
  return {
    key,
    service_id: "",
    name: "",
    procedure_notes: "",
    recommendations: "",
    material_percent: "",
    price: 0,
  };
}
