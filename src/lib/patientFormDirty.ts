/**
 * Has anything actually been typed into the patient form?
 *
 * Needed because closing the Add Patient dialog - Escape, a click on the
 * overlay, the X - threw a half-finished registration away without a word.
 * There is no unsaved-changes guard anywhere else in this app either; a
 * repo-wide search for `beforeunload` finds nothing.
 *
 * ── Why it compares against a SNAPSHOT, not against blank ──
 *
 * `emptyForm` in PatientFormSheet is not empty: it ships `status: "Active"`,
 * `source: "Walk-in"` and two `false` booleans. Comparing against `{}` would
 * call a freshly opened form dirty and prompt on every close.
 *
 * Taking the snapshot the dialog opened with also makes two other cases right
 * without special-casing either: editing an existing patient compares against
 * that patient's saved values, and a lead conversion - which pre-fills name,
 * phone and email - does not count the clinic's own pre-fill as something the
 * user typed.
 */

/** Null, undefined and "" all mean the same thing in this form. */
const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const same = (a: unknown, b: unknown): boolean => {
  if (blank(a) && blank(b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  // Loose on purpose: a number input hands back "30" where the row holds 30,
  // and that is not an edit.
  return String(a ?? "") === String(b ?? "");
};

export function patientFormDirty(
  current: Record<string, unknown> | null | undefined,
  initial: Record<string, unknown> | null | undefined,
  /** Family rows or consultation reasons added since opening - typed work that is not on `form`. */
  alsoTyped = false,
): boolean {
  if (alsoTyped) return true;
  if (!current || !initial) return false;

  // Every key on either side: a field cleared to null is as much an edit as a
  // field filled in, and checking only `current`'s keys would miss it.
  for (const key of new Set([...Object.keys(current), ...Object.keys(initial)])) {
    if (!same(current[key], initial[key])) return true;
  }
  return false;
}
