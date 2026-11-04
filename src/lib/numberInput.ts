/**
 * Value for a controlled `<input type="number">`.
 *
 * A numeric field bound straight to its number state cannot be emptied: the
 * state is 0, React re-renders the box as "0", and backspace puts it right
 * back. Anything typed then lands after that zero. Staff hit this on the
 * invoice's Paid Amount, where clearing the field is the normal way to correct
 * a wrong figure.
 *
 * So 0 shows as an empty box, with the field's own `placeholder="0"` standing
 * in for it. Every other value renders as itself.
 *
 * Safe on strings as well as numbers: a non-empty string is returned unchanged,
 * which matters because some of these fields hold text state.
 */
export const numVal = (n: number | string | undefined | null): string =>
  n === 0 || n === "" || n === undefined || n === null ? "" : String(n);
