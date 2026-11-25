/**
 * The number a clinician types against a medicine on a prescription.
 *
 * The prescription document already numbers its medicines 1, 2, 3 by the order
 * they are saved in, and the form already saves them in the order they sit on
 * screen (see prescriptionOrder.ts). So the number a person types does not
 * need a new column or a change to the document: typing "1" against the third
 * medicine MOVES it to the top, and every medicine's number is always its
 * place in the list - no gaps, no repeats, and the same figure on the form and
 * on the printed document.
 */

/**
 * What was typed into a number box, as a whole number of at least 1, or null
 * when it is not one (empty, 0, letters, a decimal, a minus sign).
 */
export function parseMedicineNumber(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n >= 1 ? n : null;
}

/**
 * Move one row to a 1-based place in the list, shifting the others along.
 *
 * `position` is clamped to the list, so typing 9 against a list of three puts
 * the row last rather than leaving a gap. Rows for which `isListed` is false
 * (a medicine marked removed on the edit screen, still in the array until
 * save) are not counted and stay in their own slots, so they never take a
 * number or push a visible row out of place.
 *
 * Returns the same array when nothing moves.
 */
export function moveToPosition<T extends { key: string }>(
  rows: T[],
  key: string,
  position: number,
  isListed: (row: T) => boolean = () => true,
): T[] {
  const listed = rows.filter(isListed);
  const from = listed.findIndex((row) => row.key === key);
  if (from === -1) return rows;
  const to = Math.min(Math.max(Math.trunc(position), 1), listed.length) - 1;
  if (to === from) return rows;
  const reordered = [...listed];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);
  let next = 0;
  return rows.map((row) => (isListed(row) ? reordered[next++] : row));
}

/**
 * Put a dragged order back into the full list.
 *
 * Dragging reorders only the rows on screen. On the edit screen the full list
 * can also hold medicines marked removed, which stay out of sight until the
 * save deletes them; they must keep their own slots and must not be counted.
 * `listedInNewOrder` is the on-screen rows in the order they were dropped;
 * they refill the slots the on-screen rows occupied.
 *
 * If the two lists do not hold the same rows (which a drag cannot cause), the
 * list is returned unchanged rather than losing or duplicating a medicine.
 */
export function withListedOrder<T extends { key: string }>(
  rows: T[],
  listedInNewOrder: T[],
  isListed: (row: T) => boolean = () => true,
): T[] {
  const listed = rows.filter(isListed);
  const sameRows =
    listed.length === listedInNewOrder.length &&
    new Set(listed.map((r) => r.key)).size === listed.length &&
    listedInNewOrder.every((r) => listed.some((l) => l.key === r.key));
  if (!sameRows) return rows;
  let next = 0;
  return rows.map((row) => (isListed(row) ? listedInNewOrder[next++] : row));
}
