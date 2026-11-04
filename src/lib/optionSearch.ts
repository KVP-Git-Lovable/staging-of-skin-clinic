/**
 * What counts as a match when someone types into a dropdown's search box.
 *
 * The clinic's ask, in their words: searching the last word of a medicine's
 * name has to find it, not only the first. Typing "moisturiser" must offer
 * Acnemoist Moisturiser and Ahaglow Acne Control Moisturiser.
 *
 * cmdk's own scoring ranks by subsequence - the letters of the query in order,
 * anywhere - which finds odd things and makes a later word feel unreliable.
 * This is the plainer rule a person expects from a search box: every word typed
 * has to appear somewhere in the name, in any order, and a word matched at the
 * start of a word sorts above one matched inside one.
 */

/** Lower-cased, punctuation reduced to spaces, so "Acne - UV" reads as "acne uv". */
const flatten = (value: string) =>
  (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * A score for cmdk's `filter`: 0 hides the row, higher sorts it first.
 *
 * An empty query scores everything, so the list opens complete.
 */
export function optionMatchScore(text: string, query: string): number {
  const haystack = flatten(text);
  const tokens = flatten(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return 1;
  if (!haystack) return 0;

  // Padded, so " token" tests "starts a word" with one indexOf.
  const padded = ` ${haystack} `;
  let atWordStart = 0;

  for (const token of tokens) {
    if (!haystack.includes(token)) return 0;
    if (padded.includes(` ${token}`)) atWordStart += 1;
  }

  // Between 0.5 and 1: every row that matches stays visible, and the ones whose
  // words actually begin with what was typed come first.
  return 0.5 + (0.5 * atWordStart) / tokens.length;
}
