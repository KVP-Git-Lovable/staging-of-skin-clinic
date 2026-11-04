/**
 * The warning shown when deleting an appointment.
 *
 * An appointment that came from Salesforce used not to stay deleted: the
 * importer worked out what it had already imported by looking for the record in
 * the app, so deleting it made the record look new again and the next sync put
 * it straight back. That is fixed in the database - a delete is now remembered
 * and the sync honours it - but it makes the delete meaningfully different from
 * the app's own records, and staff should be told which one they are doing.
 */
const BASE_NOTE =
  "Its bills and procedures are kept but will no longer be linked to it, and any notes or feedback on it are removed for good.";

const SALESFORCE_NOTE =
  "This appointment came from Salesforce. Deleting it here is permanent - the sync will not bring it back - but it still exists in Salesforce.";

export const appointmentDeleteNote = (fromSalesforce: boolean): string =>
  fromSalesforce ? `${BASE_NOTE} ${SALESFORCE_NOTE}` : BASE_NOTE;
