import { isoToIst } from "@/lib/istTime";

/**
 * The clinic's shared notebook.
 *
 * The front desk keeps rough notes in a paper book - who is on leave, what a
 * supplier still owes, which patient to call back - and then cannot find
 * anything in it. This is that book in the app: one list everybody signed in
 * can see and add to, a date on every line, and a search box over the lot.
 *
 * Deleting is a soft delete. The clinic has said more than once that no data
 * may be lost, and the database has no delete policy on clinic_notes at all -
 * so a note can be taken out of the list and put back, and nothing in the app
 * can destroy one.
 *
 * Everything here is the part with no React and no network in it, so the
 * rules can be proved rather than only read.
 */

export interface ClinicNote {
  id: string;
  body: string;
  created_at: string;
  created_by_name: string | null;
  updated_at: string;
  updated_by_name: string | null;
  deleted_at: string | null;
  deleted_by_name: string | null;
}

/**
 * Trim the ends, and nothing else.
 *
 * A rough note keeps its own line breaks and its own spacing - it is somebody
 * jotting, not a form field.
 */
export function cleanNoteBody(raw: string): string {
  return (raw ?? "").replace(/^\s+|\s+$/g, "");
}

/** An empty note would be a blank line in the book nobody can search for. */
export function noteBodyIsEmpty(raw: string): boolean {
  return cleanNoteBody(raw) === "";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "16:12" as the clinic reads it. */
function twelveHour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** The IST day before a "YYYY-MM-DD". */
function previousDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const before = new Date(Date.UTC(y, m - 1, d - 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${before.getUTCFullYear()}-${pad(before.getUTCMonth() + 1)}-${pad(before.getUTCDate())}`;
}

/**
 * When a note was written, in Mangalore's time.
 *
 * Today and yesterday are named rather than dated, because that is how
 * somebody flicking through a notebook reads it. `now` is a parameter so the
 * boundary can be tested rather than waited for.
 */
export function noteStamp(iso: string | null | undefined, now: string = new Date().toISOString()): string {
  const at = isoToIst(iso);
  if (!at) return "—";
  const time = twelveHour(at.time);
  const today = isoToIst(now);
  if (today) {
    if (at.date === today.date) return `Today, ${time}`;
    if (at.date === previousDay(today.date)) return `Yesterday, ${time}`;
  }
  const [y, m, d] = at.date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}, ${time}`;
}

/**
 * Whether a note has actually been changed since it was written.
 *
 * updated_at is set by a trigger and starts life equal to created_at, so
 * "they differ" would mark every note edited the moment it was saved.
 */
export function noteWasEdited(note: Pick<ClinicNote, "created_at" | "updated_at">): boolean {
  const made = new Date(note.created_at).getTime();
  const changed = new Date(note.updated_at).getTime();
  if (Number.isNaN(made) || Number.isNaN(changed)) return false;
  return changed - made > 1000;
}

/**
 * Whether a note answers what was typed.
 *
 * Every word has to appear, in any order and anywhere in the note - somebody
 * looking for the Radha Medicals delivery types "radha pending", and a plain
 * substring match would find nothing. The author's name counts too, because
 * "what did Akash write" is a real way to look.
 */
export function noteMatchesSearch(note: Pick<ClinicNote, "body" | "created_by_name">, query: string): boolean {
  const terms = (query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = `${note.body ?? ""} ${note.created_by_name ?? ""}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/** The notes still in the book. */
export function liveNotes<T extends Pick<ClinicNote, "deleted_at">>(notes: readonly T[]): T[] {
  return notes.filter((n) => !n.deleted_at);
}

/** The ones taken out of it, which are still there to put back. */
export function deletedNotes<T extends Pick<ClinicNote, "deleted_at">>(notes: readonly T[]): T[] {
  return notes.filter((n) => Boolean(n.deleted_at));
}

/**
 * The first line, for the deleted drawer where there is room for one.
 *
 * Cut on a word so a half-word is never the only thing shown.
 */
export function noteSummary(body: string, max = 60): string {
  const firstLine = (body ?? "").split("\n").find((l) => l.trim() !== "")?.trim() ?? "";
  if (firstLine.length <= max) return firstLine;
  const cut = firstLine.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** What the search box says it found. */
export function noteSearchSummary(found: number, query: string): string {
  if (!query.trim()) return "";
  if (found === 0) return "No notes match that";
  return found === 1 ? "1 note" : `${found} notes`;
}
