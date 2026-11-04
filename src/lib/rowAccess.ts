/**
 * Telling a user that a write did not land, and why.
 *
 * Doctors run on `data_scope = 'own'`, so RLS hides rows belonging to other
 * doctors. That produces two opposite failure modes, and the app got both
 * backwards:
 *
 *   - An UPDATE or DELETE that RLS filters out is NOT an error. Postgres
 *     reports zero rows affected and PostgREST returns 204, so `error` is null
 *     and the app happily showed "Updated" for a change that never happened -
 *     in one case texting the patient about it.
 *   - An INSERT succeeds, but PostgREST runs the SELECT policy over the
 *     RETURNING clause. So creating a record for a colleague writes the row and
 *     then fails to read it back, and the raw PostgREST message ("JSON object
 *     requested, multiple (or no) rows returned") reached the clinician.
 */

/** PostgREST's code for "single row requested, none returned". */
const NO_ROW_RETURNED = "PGRST116";

export const NOT_YOURS_MESSAGE =
  "Nothing was saved. This record belongs to another doctor, or it no longer exists.";

export const SAVED_BUT_HIDDEN_MESSAGE =
  "Saved, but it belongs to another doctor so it will not appear in your lists.";

/**
 * Guard for an UPDATE/DELETE that asked for its rows back with `.select()`.
 * Throws when nothing was written, so the caller's `onError` runs instead of
 * its `onSuccess`.
 */
export function assertWrote<T>(rows: T[] | null | undefined): T[] {
  if (!rows || rows.length === 0) throw new Error(NOT_YOURS_MESSAGE);
  return rows;
}

/** True when this error is RLS hiding the row rather than a real failure. */
export function isRowHidden(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === NO_ROW_RETURNED;
}

/**
 * Plain language for an error a clinician might see. Anything we do not
 * recognise is passed through untouched rather than papered over.
 */
export function writeErrorMessage(error: unknown): string {
  if (isRowHidden(error)) return NOT_YOURS_MESSAGE;
  const message = (error as { message?: string } | null)?.message;
  return message || "Something went wrong.";
}
