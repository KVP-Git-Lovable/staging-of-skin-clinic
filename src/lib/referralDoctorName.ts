/**
 * Matching up referring doctors who are written down differently each time.
 *
 * A patient's referring doctor is free text typed at the front desk, so one
 * doctor arrives under several spellings. In this clinic's own data:
 *
 *   "Dr Gaurav shetty"  and  "Dr. Gaurav Shetty"   - 48 patients, Rs 2.70 lakh
 *   "DR MALCOLM PINTO"  and  "Dr. Malcolm Pinto"   - 4 patients, Rs 72,618
 *
 * Each spelling became its own line in the Doctor Referrals report with part
 * of the money against it, which is why a doctor the clinic knows sends them
 * work appeared to have referred almost nobody.
 *
 * The same key is what lets a patient's typed name find the doctor's record
 * in external_doctors, and with it the phone number.
 */

/**
 * Titles that carry no information about which doctor this is.
 *
 * The title must be followed by a dot or a space, never straight by another
 * letter. Without that boundary "Drishti" loses its "Dr" and becomes
 * "ishti" - and Drishti, Draupadi and Mrinal are all names this clinic
 * actually has on file. "DR.GAURAV.SHETTY" with no space still works,
 * because the dot is boundary enough.
 */
const TITLE_WORDS = "dr|doctor|prof|professor|mr|mrs|ms|miss";
const TITLES = new RegExp(`^(?:${TITLE_WORDS})\\s*\\.\\s*|^(?:${TITLE_WORDS})\\s+`, "i");

/**
 * The key two spellings of one doctor share.
 *
 * Case, punctuation, spacing and the title are all dropped, because all four
 * vary between one receptionist and the next. What is NOT dropped is any
 * letter: "Sricharith" and "Shricharith" stay different, and deliberately so
 * - they may be two people, and silently merging two doctors is a worse
 * error than listing one twice. Fuzzy matching belongs behind a human
 * confirming it, not in a report total.
 */
export function doctorNameKey(name: string | null | undefined): string {
  const text = String(name ?? "").trim();
  if (!text) return "";
  return text.replace(TITLES, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The spelling to show for a doctor, chosen from the ones actually written.
 *
 * Rather than inventing a canonical form, this picks the tidiest spelling
 * the clinic itself used: a name carrying a title is preferred (it reads as
 * a doctor), then proper capitalisation over SHOUTING or lower case, then
 * the longest, then alphabetical so the answer never depends on row order.
 */
export function preferredDoctorSpelling(spellings: readonly string[]): string {
  const options = spellings.map((s) => String(s ?? "").trim()).filter(Boolean);
  if (options.length === 0) return "";

  const score = (s: string): number => {
    let n = 0;
    if (TITLES.test(s)) n += 4;
    // Mixed case: neither all-caps nor all-lowercase.
    if (s !== s.toUpperCase() && s !== s.toLowerCase()) n += 2;
    return n;
  };

  return [...options].sort((a, b) => {
    const d = score(b) - score(a);
    if (d !== 0) return d;
    if (b.length !== a.length) return b.length - a.length;
    return a.localeCompare(b);
  })[0];
}

/**
 * Group rows by the doctor who referred them, however the name was typed.
 *
 * Rows with no doctor recorded are returned under the empty key rather than
 * dropped: in this clinic that is 397 of 561 referrals carrying Rs 27.5 lakh,
 * and a report that quietly omits them would understate the whole picture.
 */
export function groupByDoctor<T>(
  rows: readonly T[],
  nameOf: (row: T) => string | null | undefined,
): Map<string, { key: string; display: string; rows: T[] }> {
  const buckets = new Map<string, { key: string; spellings: string[]; rows: T[] }>();

  for (const row of rows) {
    const raw = String(nameOf(row) ?? "").trim();
    const key = doctorNameKey(raw);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.rows.push(row);
      if (raw && !bucket.spellings.includes(raw)) bucket.spellings.push(raw);
    } else {
      buckets.set(key, { key, spellings: raw ? [raw] : [], rows: [row] });
    }
  }

  const out = new Map<string, { key: string; display: string; rows: T[] }>();
  for (const [key, b] of buckets) {
    out.set(key, { key, display: preferredDoctorSpelling(b.spellings), rows: b.rows });
  }
  return out;
}

/**
 * The contact details for a typed-in doctor name.
 *
 * external_doctors is the clinic's own list of referring doctors, and it is
 * keyed by name because that is all a patient record carries. Matching on the
 * normalised key rather than the literal string is what lets "Dr Gaurav
 * shetty" on a patient find "Dr. Gaurav Shetty" in the list.
 */
export interface DoctorContact {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  clinic_name?: string | null;
}

export function contactsByDoctorKey<T extends DoctorContact>(doctors: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const d of doctors) {
    const key = doctorNameKey(d?.name);
    if (!key) continue;
    const existing = map.get(key);
    // Two records for one doctor: keep whichever actually has a phone, since
    // the phone is the whole reason for the lookup.
    if (!existing || (!String(existing.phone ?? "").trim() && String(d.phone ?? "").trim())) {
      map.set(key, d);
    }
  }
  return map;
}
