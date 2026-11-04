/**
 * Keeping the WhatsApp page current without anyone pressing a button.
 *
 * Two different problems wore the same "Refresh status" button, and only one
 * of them was ever about Twilio.
 *
 * A patient's message reaches whatsapp_conversations the moment they send it -
 * whatsapp-webhook writes it and answers it - so the conversation screen only
 * ever needed to look at the database again. Delivery states are the opposite:
 * nothing tells us a message was read, so the only way to learn it is to ask
 * Twilio. Asking is the slow part, and it was asking for six months of history
 * every time, to find out whether this morning's confirmation arrived.
 *
 * The numbers live here rather than scattered through two components, so the
 * cost of leaving this page open all day can be read in one place.
 */

/** Re-read the conversations from the database. Cheap: two indexed reads. */
export const CONVERSATION_POLL_MS = 20_000;

/** Ask Twilio what became of recent messages. Not cheap, so not often. */
export const STATUS_SYNC_MS = 120_000;

/**
 * How far back an automatic sync looks.
 *
 * A status moves within minutes of sending and then never again, so two days
 * covers everything that can still change, with a night's margin for a message
 * sent just before closing. The manual button keeps its six months for when
 * somebody wants the history re-read.
 */
export const AUTO_SYNC_DAYS = 2;

/** Nothing automatic within this of the last sync, whoever started it. */
const QUIET_PERIOD_MS = 60_000;

/**
 * Is it worth asking Twilio again?
 *
 * Guards two cases that would otherwise waste a call: the timer firing just
 * after somebody pressed Refresh themselves, and the front desk having the
 * page open on two machines at once.
 */
export function shouldAutoSync(lastSyncedAt: number | null, now: number = Date.now()): boolean {
  if (lastSyncedAt === null) return true;
  return now - lastSyncedAt >= QUIET_PERIOD_MS;
}

/**
 * Said beside the button, so it is clear the page is already current.
 *
 * Without it an automatic refresh is invisible, and the clinic goes on
 * pressing the button exactly as they did before.
 */
export function lastUpdatedLabel(at: number | null, now: number = Date.now()): string {
  if (at === null) return "";
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return "Updated just now";
  if (minutes === 1) return "Updated 1 min ago";
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "Updated 1 hour ago" : `Updated ${hours} hours ago`;
}
