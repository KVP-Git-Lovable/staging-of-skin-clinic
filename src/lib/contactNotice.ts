/**
 * "Already sent today at 3:42 PM" — when a patient was last bothered.
 *
 * Pulled out of googleReview.ts when the follow-up buttons needed the same
 * thing. Both sit on the same awkward truth, which is the only reason this is
 * worth its own file:
 *
 * There are two ways a patient gets messaged and they leave different marks.
 * The app sending it through Twilio wrote a row into whatsapp_conversations -
 * that is a message Twilio accepted. A staff member opening WhatsApp with the
 * message ready writes a row into google_review_opens or followup_opens - and
 * that is only somebody having the message in front of them. We cannot see
 * whether they pressed send, let alone whether it arrived.
 *
 * So the wording has to be honest about which: "Already sent" for the first,
 * "<something> link opened" for the second. Flatten the two into one phrase
 * and the notice starts claiming things the app does not know.
 */

/** A timestamp from the database, or nothing usable. */
export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const when = value instanceof Date ? value : new Date(value);
  return Number.isNaN(when.getTime()) ? null : when;
}

/** "today at 3:42 PM", or "on 2 Nov 2026 at 3:42 PM". */
export function whenWords(when: Date, now: Date): string {
  const time = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameDay =
    when.getFullYear() === now.getFullYear() &&
    when.getMonth() === now.getMonth() &&
    when.getDate() === now.getDate();
  if (sameDay) return `today at ${time}`;
  const date = when.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return `on ${date} at ${time}`;
}

/**
 * The later of the two marks, worded for what it actually is.
 *
 * The only question being answered is "has this patient been bothered
 * recently", so the LATER mark wins. A tie goes to the confirmed send: if both
 * happened in the same second, the one we actually know about is the stronger
 * claim.
 */
export function contactNotice(
  lastSentAt: string | Date | null | undefined,
  lastOpenedAt: string | Date | null | undefined,
  openedLabel: string,
  now: Date = new Date(),
): string {
  const sent = toDate(lastSentAt);
  const opened = toDate(lastOpenedAt);
  if (!sent && !opened) return "";
  // >= rather than >: the tie goes to the send.
  if (sent && (!opened || sent.getTime() >= opened.getTime())) {
    return `Already sent ${whenWords(sent, now)}`;
  }
  return `${openedLabel} ${whenWords(opened as Date, now)}`;
}
