/**
 * The appointments list edits a date and a time as two separate boxes but
 * stores them as one "yyyy-MM-ddTHH:mm" string.
 *
 * Joining them is lossy in one direction: with either half blank there is no
 * instant to save, so the join returns "". The save path then skipped the
 * falsy value and wrote nothing while still reporting "Updated" - so a
 * receptionist who cleared the time and set a new date was told the
 * appointment had moved when it had not.
 */

/** "" when either half is missing, because half a timestamp is not a time. */
export const joinDateTime = (date: string, time: string): string =>
  date && time ? `${date}T${time}` : "";

/**
 * True when the editor holds a half-filled date/time, which must be reported
 * rather than quietly dropped.
 */
export function hasIncompleteDateTime(values: {
  start_time?: string;
  end_time?: string;
}): boolean {
  return values.start_time === "" || values.end_time === "";
}
