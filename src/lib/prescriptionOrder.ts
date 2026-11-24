/**
 * The order a prescription's products were typed in.
 *
 * Dr Vindhya typed Triclenz, then Triflow Shampoo, and the preview showed
 * Deriva CMS first. Not alphabetical, not what she typed - no order at all.
 *
 * A save writes every product in one statement and `now()` is fixed for the
 * whole statement, so all of them land on the same `created_at`; `id` is a
 * random uuid and carries no order either. Nothing in the table recorded the
 * order, so the three readers could only guess - and a guess with a tie in it
 * changes whenever an edit moves a row.
 *
 * `procedure_services` solved this long ago with a `sort_order` written as
 * the row's index. Prescriptions now do exactly the same, through here, so
 * the rule lives in one testable place rather than three hand-written copies.
 */

/** The ordering columns, in the order they decide. */
export const PRESCRIPTION_ORDER = [
  // What the clinician typed. Null only on rows written before the column
  // existed, which is why it sorts last rather than first.
  { column: "sort_order", nullsFirst: false },
  // Same for every row of one save, so it only separates one save from
  // another.
  { column: "created_at", nullsFirst: false },
  // Never equal. Without it an older prescription reshuffles between one
  // viewing and the next, which is its own complaint waiting to happen.
  { column: "id", nullsFirst: false },
] as const;

type Positioned = { sort_order?: number | null };

/**
 * Stamp each row with its position in the list, 0-based.
 *
 * Called on the list the clinician can actually see, so a row moved up keeps
 * its new place. Rows already removed must be filtered out BEFORE this, not
 * after, or the gap they leave shifts everything below them.
 */
export function withSortOrder<T extends object>(rows: T[]): (T & { sort_order: number })[] {
  return rows.map((row, i) => ({ ...row, sort_order: i }));
}

/**
 * Compare two rows the way the database is now asked to.
 *
 * The readers order in SQL; this is for the places that already hold rows in
 * memory, and for proving the rule without a database.
 */
export function comparePrescriptions(
  a: Positioned & { created_at?: string | null; id?: string | null },
  b: Positioned & { created_at?: string | null; id?: string | null },
): number {
  const ai = a.sort_order ?? null;
  const bi = b.sort_order ?? null;
  if (ai !== bi) {
    // A row that knows its place comes before one that does not.
    if (ai === null) return 1;
    if (bi === null) return -1;
    return ai - bi;
  }
  const at = a.created_at ?? "";
  const bt = b.created_at ?? "";
  if (at !== bt) return at < bt ? -1 : 1;
  const aid = a.id ?? "";
  const bid = b.id ?? "";
  if (aid === bid) return 0;
  return aid < bid ? -1 : 1;
}

/** The same order, applied to a list already in hand. */
export function inPrescriptionOrder<
  T extends Positioned & { created_at?: string | null; id?: string | null },
>(rows: T[]): T[] {
  return [...rows].sort(comparePrescriptions);
}
