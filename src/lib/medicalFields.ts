/**
 * The Medical Information fields on a prescription, in the order they are shown.
 *
 * One table, imported by both the create form (ProcedureFormDialog) and the
 * edit sheet (ProcedureDetailSheet). They each held their own literal copy, so
 * a field added or renamed in one appeared in only half the app.
 *
 * The key is a live database column name - three of these are saved on the
 * `procedures` row and the rest on `patients` - so a key may never be edited to
 * change wording. Only the label is free.
 */
export type MedicalField = readonly [key: string, label: string];

export const MEDICAL_FIELDS: MedicalField[] = [
  // These two carry the clinic's second pass at the wording: symptoms went to
  // "History/Examination details" and has come back to "Symptoms", and the
  // History/Examination heading now sits on medical_history instead.
  //
  // Labels only - no data moves. What is already in medical_history on 5,365
  // patients now reads under the new heading, which is the point: it is the
  // history taken, and that is where doctors want to find it.
  ["symptoms", "Symptoms"],
  ["diagnosis", "Diagnosis"],
  ["lab_tests", "Lab Tests"],
  ["medical_history", "History/Examination details"],
  ["current_medications", "Current Medications"],
  // Took the slot Allergies used to hold. Deliberately a new column rather than
  // a rename of skin_concerns: that column is not free text, it holds the
  // Salesforce consultation category - "Aesthetic" on 3,958 patients,
  // "Clinical" on 1,203 - and relabelling it would have printed "Aesthetic" as
  // those patients' dietary advice. Their values stay in the database, just not
  // on this form.
  ["dietary_advice", "Dietary Advice"],
  ["previous_treatments", "Previous Treatments"],
  ["skin_type", "Skin Type"],
];

/** Saved on the procedure itself; everything else belongs to the patient record. */
export const PROCEDURE_MEDICAL_FIELDS = ["symptoms", "diagnosis", "lab_tests"];

/**
 * patients.skin_type has a check constraint restricting it to these exact
 * values - it must stay a dropdown, not free text, or saving fails.
 */
export const SKIN_TYPE_OPTIONS = ["Normal", "Dry", "Oily", "Combination", "Sensitive"];

/**
 * What "AI Elaborate" may rewrite.
 *
 * Skin Type is excluded because elaboration would turn it into a sentence and
 * break the check constraint. Dietary Advice is excluded because the edge
 * function takes a fixed set of keys it does not include, and edge functions
 * cannot be deployed from here - sending it would be silently dropped, which
 * looks like the button doing nothing.
 */
export const ELABORATABLE_MEDICAL_FIELDS = MEDICAL_FIELDS.filter(
  ([field]) => field !== "skin_type" && field !== "dietary_advice",
);

/** The patient-record columns this form loads and saves back. */
export const PATIENT_MEDICAL_COLUMNS = MEDICAL_FIELDS
  .map(([key]) => key)
  .filter((key) => !PROCEDURE_MEDICAL_FIELDS.includes(key));
