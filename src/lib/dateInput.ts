/**
 * Date of Birth is read and typed as dd/MM/yyyy on every machine.
 *
 * A native `<input type="date">` is painted by the browser in that computer's
 * own region setting, so one clinic PC shows a patient as 07/31/1982 and the
 * next shows 31/07/1982. No CSS or app code can change that, so the field is a
 * plain text box instead and these functions bridge it to the ISO yyyy-MM-dd
 * the database stores.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})/;
const DISPLAY = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/**
 * The years a clinic date can plausibly fall in.
 *
 * Four digits are four digits, so a slip of one key turns 01/02/2026 into
 * 01/02/0268 - which is a real date, and was duly saved as an appointment in
 * February of the year 268. A patient's date of birth reaches back a century
 * and a reserved appointment forward a few years; nothing the clinic records
 * lives outside this window, so a year that does is a typing mistake rather
 * than a date.
 */
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;

/** The same window, written the way a native date-and-time box wants it. */
export const MIN_DATETIME = `${MIN_YEAR}-01-01T00:00`;
export const MAX_DATETIME = `${MAX_YEAR}-12-31T23:59`;

/** Is this ISO date one the clinic could actually mean? */
export function isPlausibleIso(iso: string | null | undefined): boolean {
  const m = ISO.exec(iso ?? "");
  if (!m) return false;
  const year = Number(m[1]);
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

/** ISO (or anything unparseable, including "") -> "31/07/1982" or "". */
export function isoToDisplay(iso: string | null | undefined): string {
  const m = ISO.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** "31/07/1982" -> "1982-07-31". null when incomplete or not a real date. */
export function displayToIso(text: string | null | undefined): string | null {
  const m = DISPLAY.exec((text ?? "").trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = Number(dd), month = Number(mm), year = Number(yyyy);
  // A mistyped year is not a date. Refusing it here means every box built on
  // DateInput simply never hands one upwards, the same way it already refuses
  // 31 February, and the field snaps back to what was stored.
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  // new Date(1982, 1, 31) silently becomes 3 March, so a date only counts as
  // real if it comes back out carrying the same three parts it went in with.
  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Drops the separators in as the user types, so they enter digits only.
 * Works backwards too: deleting is just as much a smaller digit string.
 */
export function maskTyping(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * A date for reading: always dd/MM/yyyy, on every machine.
 *
 * `toLocaleDateString()` renders in the *browser's* region, so the same visit
 * showed as 19/09/2026 on one clinic PC and 9/19/2026 on the next. Staff read
 * "9/19" as the 9th of a nineteenth month, or worse, read 10/09 as the 10th of
 * September when it means the 9th of October. This is the same problem the
 * native date input had, fixed the same way: pick the format, do not inherit it.
 *
 * Accepts a Date, an ISO string or a timestamp. Returns "" for anything that is
 * not a real date, so a missing value renders as blank rather than "Invalid Date".
 */
export function displayDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}
