/**
 * What the global search box remembers.
 *
 * Front desk search a number, open the patient, move to Billing, and come back
 * to an empty box - so the number gets typed again. Two things are kept:
 *
 * - the box's own text, so a search survives moving around the app and a
 *   reload. sessionStorage, not local: a search should not still be sitting
 *   there tomorrow morning.
 * - the last few searches, so an earlier one is a click away. localStorage,
 *   because that list is worth keeping between days.
 *
 * Every read and write is guarded. This matters more than it looks: the list is
 * written in the same breath as opening a result, so in a private window an
 * unguarded throw here stopped the navigation and clicking a result did
 * nothing at all.
 */

const RECENTS_KEY = "globalSearch.recents";
const LAST_KEY = "globalSearch.last";

/** Anything shorter is a keystroke, not a search. */
const MIN_LENGTH = 2;
const MAX_RECENTS = 6;

export function readRecentSearches(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

/**
 * Record a search and return the list as it now stands.
 *
 * The same number searched twice moves to the top rather than appearing twice,
 * and case is not a difference - "Prema" and "prema" are one search.
 */
export function rememberRecentSearch(term: string): string[] {
  const clean = (term || "").trim();
  const current = readRecentSearches();
  if (clean.length < MIN_LENGTH) return current;

  const next = [clean, ...current.filter((r) => r.toLowerCase() !== clean.toLowerCase())].slice(
    0,
    MAX_RECENTS,
  );
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* private window, or site data blocked - the list simply will not persist */
  }
  return next;
}

export function readLastSearch(): string {
  try {
    return sessionStorage.getItem(LAST_KEY) || "";
  } catch {
    return "";
  }
}

export function rememberLastSearch(term: string): void {
  try {
    if ((term || "").trim()) sessionStorage.setItem(LAST_KEY, term);
    else sessionStorage.removeItem(LAST_KEY);
  } catch {
    /* as above - the box just will not refill after a reload */
  }
}

export function forgetLastSearch(): void {
  try {
    sessionStorage.removeItem(LAST_KEY);
  } catch {
    /* as above */
  }
}
