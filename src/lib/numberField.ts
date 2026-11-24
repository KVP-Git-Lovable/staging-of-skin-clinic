/**
 * Typing a number into a box, without the box fighting back.
 *
 * Every numeric field here was bound straight to its number:
 *
 *   value={form.regularisation_monthly_limit}
 *   onChange={(e) => set({ ...f, regularisation_monthly_limit: Number(e.target.value) })}
 *
 * Backspace the 0 and the browser hands back "", Number("") is 0, React
 * paints the 0 straight back. The keystroke is undone before it lands, and
 * whatever is typed next goes AFTER that zero - meaning to set 3, you get 30.
 * The clinic hit it on "Corrections allowed per month".
 *
 * numberInput.ts already exists for this and 81 boxes use it, but it is only
 * a render mask: it paints 0 as an empty box and never sees the keystroke, so
 * the state still collapses. On this field the mask would be wrong anyway -
 * 0 means "no limit" here, a setting somebody chose, and it has to read as 0.
 *
 * So the answer is the round trip. While somebody is typing, what they typed
 * is TEXT, and text has states no number can hold: "", "-", "1.". Those are
 * not zero and not an error; they are halfway. Keep them, commit a number
 * when there is one, and settle an unfinished edit on blur.
 */

export interface NumberBounds {
  min?: number;
  max?: number;
}

export type DraftParse = { ok: true; value: number } | { ok: false };

/**
 * What is in the box, if it is a number yet.
 *
 * "" is somebody who has just cleared the field, "-" and "1." are somebody
 * mid-way through typing. None of them is a value, and none of them is a
 * mistake to be corrected on their behalf.
 */
export function parseDraft(raw: string | null | undefined): DraftParse {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false };
  // Reject the halfway states explicitly rather than leaning on Number(),
  // which reads "" as 0 and would put us back where we started.
  if (!/^-?\d+(\.\d+)?$/.test(text)) return { ok: false };
  const value = Number(text);
  return Number.isFinite(value) ? { ok: true, value } : { ok: false };
}

/**
 * Hold a number inside its bounds.
 *
 * min and max on an <input type="number"> are a hint to the spinner and
 * nothing more - typing or pasting past them is allowed. These bounds mirror
 * database CHECK constraints (regularisation_monthly_limit is 0..31), so a
 * figure that gets past the box still gets caught here rather than at the
 * insert.
 */
export function clampNumber(value: number, bounds: NumberBounds = {}): number {
  let out = Number(value);
  if (!Number.isFinite(out)) return bounds.min ?? 0;
  if (typeof bounds.min === "number" && out < bounds.min) out = bounds.min;
  if (typeof bounds.max === "number" && out > bounds.max) out = bounds.max;
  return out;
}

/**
 * What an unfinished edit becomes when focus leaves.
 *
 * Blur is the moment to resolve it - not every keystroke, which is the whole
 * bug. An empty box becomes emptyValue: 0 for a limit that means "no limit",
 * this year for a year, 75 for a threshold with a documented default.
 */
export function commitDraft(
  raw: string | null | undefined,
  options: NumberBounds & { emptyValue?: number } = {},
): number {
  const parsed = parseDraft(raw);
  const fallback = options.emptyValue ?? options.min ?? 0;
  return clampNumber(parsed.ok ? parsed.value : fallback, options);
}

/**
 * What the box shows.
 *
 * The draft while one is in hand - including an empty one, which is the point
 * - and otherwise the committed value. 0 renders as "0", deliberately unlike
 * numVal: on these settings it is a real answer, not a missing one.
 */
export function displayNumber(value: number | null | undefined, draft: string | null): string {
  if (draft !== null) return draft;
  if (value === null || value === undefined) return "";
  return Number.isFinite(Number(value)) ? String(value) : "";
}
