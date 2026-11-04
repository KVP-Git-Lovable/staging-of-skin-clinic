import { format } from "date-fns";

/**
 * Showing a visit's date when the visit's date is not actually known.
 *
 * 15,836 visits were imported on 23 April 2026 through the spreadsheet
 * importer with no date column mapped. That importer stamps every row with a
 * single "Default procedure date", so the clinic's whole history collapsed onto
 * that one day - and doctors opening a patient saw a consultation on a day the
 * patient had not attended, on 7,744 patients. Salesforce had no such visit,
 * because there was none.
 *
 * The records themselves are real: 13,717 diagnoses, and not one of the rows is
 * empty. So they are kept and the date is disowned instead. Each carries
 * `date_not_recorded`, and their `procedure_date` is moved to 1900-01-01 - far
 * outside the real range, which starts in 2020 - so that no screen or query
 * lists them under 23 April, including the ones nobody remembered to change.
 *
 * This is what turns that sentinel back into something a doctor can read.
 */

export const DATE_NOT_RECORDED = "Date not recorded";

/** A procedure as far as its date is concerned. */
export interface DatedProcedure {
  procedure_date?: string | number | Date | null;
  date_not_recorded?: boolean | null;
}

/**
 * The visit's date for display, or "Date not recorded" when it was never
 * captured.
 *
 * `pattern` is a date-fns pattern, so each screen keeps the shape it already
 * used. An unparseable or missing date reads the same as an unknown one rather
 * than throwing - `format()` raises a RangeError on an invalid Date, which is
 * how one bad row could take a whole patient's history off the screen.
 */
export function procedureDateLabel(
  procedure: DatedProcedure | null | undefined,
  pattern = "dd/MM/yyyy",
): string {
  if (!procedure || procedure.date_not_recorded) return DATE_NOT_RECORDED;
  const value = procedure.procedure_date;
  if (value === null || value === undefined || value === "") return DATE_NOT_RECORDED;
  const when = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(when.getTime())) return DATE_NOT_RECORDED;
  return format(when, pattern);
}

/** True when this visit should be read as history rather than as a dated visit. */
export function isUndatedVisit(procedure: DatedProcedure | null | undefined): boolean {
  return !!procedure?.date_not_recorded;
}
