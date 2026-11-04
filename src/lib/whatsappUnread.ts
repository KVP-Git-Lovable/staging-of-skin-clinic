/**
 * Which conversations have something the clinic has not read.
 *
 * Counted from the patient's own last message, not the thread's.
 *
 * The first version of this asked whether the thread's last message came in,
 * and could never fire: whatsapp-webhook answers every patient message
 * automatically, so all 346 threads end with the clinic's own reply. The bot
 * replying is not a person reading - and the case that matters looks exactly
 * like the one that failed, with the patient writing "I need to modify" and the
 * bot answering "please call us" while somebody still has to act on it.
 *
 * The baseline exists for the first time somebody opens the page. Without it
 * the feature arrives as a mark on every thread a patient has ever written to -
 * 178 of them - which is noise that can only be cleared by opening all 178,
 * the very thing it is meant to save.
 */

/** The read row that means "everything up to here had been seen". */
export const READ_BASELINE_PHONE = "*";

export interface UnreadThread {
  phone: string;
  /** When the patient last wrote, or null if they never have. */
  last_inbound_at?: string | null;
}

export interface ReadMarks {
  /** When this person last opened each thread. */
  byPhone: Record<string, string | undefined>;
  /** When they first used the page, for threads they have never opened. */
  baseline?: string | null;
}

export function isThreadUnread(thread: UnreadThread, reads: ReadMarks): boolean {
  const wrote = Date.parse(thread.last_inbound_at ?? "");
  // Never written in, or a date nothing can read: not a mark anyone could clear.
  if (Number.isNaN(wrote)) return false;

  const seen = reads.byPhone[thread.phone] ?? reads.baseline ?? null;
  if (!seen) return true;

  const read = Date.parse(seen);
  if (Number.isNaN(read)) return true;

  return wrote > read;
}

/** For the count beside the Conversations tab. */
export function unreadCount(threads: UnreadThread[], reads: ReadMarks): number {
  return threads.reduce((n, thread) => (isThreadUnread(thread, reads) ? n + 1 : n), 0);
}
