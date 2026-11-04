import { OTHERS_VALUE } from "@/lib/othersOption";

/**
 * Which medicine id is safe to save against a prescription.
 *
 * prescriptions.product_id is a foreign key onto pharma_products. Every id the
 * doctor can pick comes from a list the browser loaded earlier, and that list
 * can be older than the catalogue it came from - the clinic keeps the
 * procedure form open all day. Pick a medicine that has since been removed or
 * replaced and the insert is rejected outright:
 *
 *   insert or update on table "prescriptions" violates foreign key constraint
 *   "prescriptions_product_id_fkey"
 *
 * which is what happened on 15 Oct. The procedure had already been written by
 * then, so the doctor was left with a saved visit, no medicines on it, and a
 * raw Postgres message. The whole prescription was lost over one stale id.
 *
 * So an id that is not in the catalogue is dropped rather than sent. That
 * costs nothing visible: medicine_name is the column the prescription PDF and
 * the invoice read, which is already how "Others" works - see othersOption.ts.
 * A medicine the catalogue has no row for could not be stock-tracked under any
 * circumstances, so nothing that was working stops working. What it buys is
 * that the prescription is saved instead of thrown away.
 */
export function productIdForSave(
  productId: string | null | undefined,
  knownIds: Set<string>,
): string | null {
  const id = (productId ?? "").trim();
  if (!id || id === OTHERS_VALUE) return null;
  return knownIds.has(id) ? id : null;
}

/** The ids of the medicines currently in the catalogue, from a loaded list. */
export function knownProductIds(products: readonly { id: string }[] | undefined | null): Set<string> {
  return new Set((products ?? []).map((p) => p.id));
}

/**
 * Whether a row's catalogue link is about to be dropped.
 *
 * Only true for a real id that is no longer in the catalogue - an empty
 * picker, or "Others", was never linked to anything and is not worth
 * mentioning to anyone.
 */
export function losesCatalogueLink(
  productId: string | null | undefined,
  knownIds: Set<string>,
): boolean {
  const id = (productId ?? "").trim();
  if (!id || id === OTHERS_VALUE) return false;
  return !knownIds.has(id);
}

/**
 * One line telling the clinic which medicines were saved as plain text.
 *
 * Said out loud rather than swallowed: the medicine still prints, but it is no
 * longer tied to the pharmacy catalogue, so it will not show up against stock.
 * Better they hear it here than find a gap in a stock report next month.
 */
export function droppedMedicineNotice(names: readonly string[]): string | null {
  const named = names.map((n) => (n ?? "").trim()).filter(Boolean);
  if (named.length === 0) return null;
  const list = named.join(", ");
  return named.length === 1
    ? `${list} is no longer in the pharmacy list, so it was saved as typed text.`
    : `These are no longer in the pharmacy list, so they were saved as typed text: ${list}.`;
}
