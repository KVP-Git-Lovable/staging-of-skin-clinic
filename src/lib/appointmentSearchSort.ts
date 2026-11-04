/**
 * What order a searched appointment list comes back in.
 *
 * The Appointments list is sorted oldest first by default, and that is right
 * for the screen it was written for: Today's Appointments is a day being
 * worked through, and the front desk reads it in clock order, morning at the
 * top.
 *
 * It is wrong the moment somebody searches. Searching "Shibani" matched 30
 * appointments going back to 2020 and put 27 November 2020 at the top, six
 * years above the one three days away that she was actually being looked up
 * for. A search is a lookup, not a day's work, and the visit meant is nearly
 * always the most recent one.
 *
 * So the default flips while a term is in the box, and only then. No date
 * filter changes, no unsearched list changes, and the day lists are left
 * exactly as they read now.
 */

export interface ListSort {
  column: string;
  direction: "asc" | "desc";
}

/** Most recent visit at the top. */
export const NEWEST_FIRST: ListSort = { column: "start_time", direction: "desc" };

/**
 * The order to actually use.
 *
 * `userChose` is what stops this being a rule about the sort's current value.
 * Written as "flip it whenever the sort still looks like the default", a
 * doctor who is searching and deliberately clicks Date & Time for oldest-first
 * would be overridden again on the next keystroke - unable to ask for the very
 * thing the list does today. A header click says so explicitly instead.
 *
 * The term is trimmed here rather than at the call, so no caller can pass a
 * box holding a space and get an order nobody asked for.
 */
export function sortForSearch(
  current: ListSort,
  searchTerm: string | null | undefined,
  userChose: boolean,
): ListSort {
  if (userChose) return current;
  if (!String(searchTerm ?? "").trim()) return current;
  return NEWEST_FIRST;
}
