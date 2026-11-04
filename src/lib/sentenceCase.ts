/**
 * The first letter of what a doctor types, capitalised for them.
 *
 * Doctors type at the speed of the consultation and in lower case, so a
 * prescription read "acne vulgaris", "twice a day", "apply after cleansing" -
 * on the screen and on the document the patient takes home.
 *
 * Only the first letter changes. Nothing else is touched: not a word in the
 * middle of a sentence, not a name already in capitals, not a dose. Fixing
 * more than was asked for is how a tool starts arguing with the person using
 * it.
 */

/**
 * The words the clinic writes in lower case on purpose.
 *
 * "pH balanced cleanser" is not a sentence that forgot its capital, and nor is
 * "c/o itching" or "mm lesion" - capitalising those would be a mistake the
 * doctor then has to undo on every note. Compared in lower case, so however
 * the term is typed it is recognised; a term not on this list is treated as an
 * ordinary word.
 */
const LOWERCASE_TERMS = new Set([
  // Measures and units, which carry their case as part of their meaning.
  "ph", "mm", "cm", "mg", "ml", "mcg", "mmhg", "mmol", "meq", "dl", "kg",
  // The shorthand a history is written in: complains of, known case of,
  // history of, follow up, bilateral, status post, as needed.
  "c/o", "k/c/o", "h/o", "f/u", "b/l", "s/p", "prn",
  // How a dose is written: intravenous, by mouth, once a day, twice a day,
  // three times a day, four times a day, at bedtime.
  "i.v.", "p.o.", "o.d.", "b.d.", "t.d.s.", "q.i.d.", "h/s",
]);

const LETTER = /[a-z]/i;

/**
 * The text with its first word capitalised, unless that word is a clinical one.
 *
 * The first letter is found rather than assumed at position zero, so a note
 * that begins with a space, a new line or a number ("1. tab calpol") is still
 * handled. The word it begins is read to the next space, which is what decides
 * whether this is an ordinary word or one of the terms above.
 */
export function capitaliseFirstWord(text: string, caret?: number | null): string {
  if (!text) return text;

  let index = 0;
  while (index < text.length && !LETTER.test(text[index])) index += 1;
  if (index >= text.length) return text;

  // The word as typed, to the next space or line break.
  const rest = text.slice(index);
  const rawWord = rest.split(/\s/, 1)[0] ?? "";
  const word = rawWord.toLowerCase();

  // Changing the first letter makes React rewrite the field's value, which
  // throws the caret to the end. That is harmless while the caret is already
  // at the end (fresh typing, pasting) or on the first letter itself; it
  // garbles the note only when the caret sits further into existing text, so
  // only then is the text left exactly as typed.
  if (caret != null && caret > index + 1 && caret < text.length) return text;
  if (LOWERCASE_TERMS.has(word)) return text;
  // A word still being typed waits. Capitalising the "p" of "pH" the moment it
  // is typed would make "PH" however carefully the doctor continues, so while
  // what has been typed could still become one of these terms, nothing is
  // changed. One keystroke later the word has either become the term or
  // ceased to look like it - "pa" is not the start of any of them, so
  // "Patient" is capitalised at its second letter and nobody notices.
  for (const term of LOWERCASE_TERMS) {
    if (term.startsWith(word)) return text;
  }

  const letter = text[index];
  const capital = letter.toUpperCase();
  if (capital === letter) return text;
  return text.slice(0, index) + capital + text.slice(index + 1);
}
