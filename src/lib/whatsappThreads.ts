/**
 * The shapes the WhatsApp conversation review reads, and the one piece of
 * decision logic between them.
 *
 * The conversation list used to be built by fetching the newest hundred
 * MESSAGES and grouping them by number in the browser, so it showed only
 * whichever numbers happened to fall inside that window - 37 of the clinic's
 * 154 - and the rest could not be reached without loading every message.
 * `whatsapp_conversation_threads` answers the list's real question instead:
 * one row per number, already carrying the last message and the count. All
 * that is left in code is turning such a row into the summary the list
 * already knows how to draw, which is what `summaryFromThread` does.
 */

export type PatientJoin = { first_name: string | null; last_name: string | null };

/** A row of whatsapp_conversations, with the patient joined on. */
export type ConversationMessage = {
  id: string;
  phone: string;
  patient_id: string | null;
  direction: string;
  content: string;
  created_at: string;
  patients: PatientJoin | PatientJoin[] | null;
};

/** A list row: the conversation's last message, plus how long it runs. */
export type ConversationSummary = ConversationMessage & {
  messageCount?: number;
  /** Carried through for the unread mark - see whatsappUnread.ts. */
  lastInboundAt?: string | null;
};

/** One row of the whatsapp_conversation_threads view. */
export type ConversationThread = {
  phone: string;
  last_at: string;
  /** When the PATIENT last wrote - what the unread mark counts from. */
  last_inbound_at: string | null;
  message_count: number;
  last_content: string | null;
  last_direction: string | null;
  patient_id: string | null;
  first_name: string | null;
  last_name: string | null;
};

/**
 * The view's row as the list already knows how to draw it.
 *
 * The phone number is the identity of a conversation, so it stands in for the
 * row id. A number the clinic has never matched to a patient keeps a null
 * patient rather than an empty name, so the list falls back to showing the
 * number itself.
 */
export function summaryFromThread(row: ConversationThread): ConversationSummary {
  return {
    id: row.phone,
    phone: row.phone,
    patient_id: row.patient_id,
    direction: row.last_direction ?? "",
    content: row.last_content ?? "",
    created_at: row.last_at,
    patients:
      row.first_name || row.last_name
        ? { first_name: row.first_name, last_name: row.last_name }
        : null,
    messageCount: row.message_count,
    lastInboundAt: row.last_inbound_at,
  };
}

/**
 * A row of whatsapp_thread_messages: everything that passed between the clinic
 * and one number, from both sides of the wire.
 *
 * whatsapp_conversations only holds what the webhook sees - the patient's reply
 * and the bot's answer to it. The message the patient actually received first,
 * the appointment confirmation or the invoice, is recorded in
 * whatsapp_delivery_log when Twilio's send history is pulled in. A thread drawn
 * from the conversation table alone therefore opens on the patient saying
 * "Confirm" with nothing to confirm. The view puts both back in one timeline.
 */
export type ThreadMessage = {
  id: string;
  phone: string;
  patient_id: string | null;
  direction: string;
  content: string;
  created_at: string;
  /** "reply" for a webhook message, "sent" for one from the delivery log. */
  source: string;
  /** Twilio's last word on a sent message; null for a webhook message. */
  status: string | null;
};

/**
 * What to say under a message the clinic sent.
 *
 * Only worth a word when the message did not simply arrive: a bubble on the
 * screen that never reached the patient's phone would be a lie. "delivered"
 * and "read" say themselves, so they say nothing.
 */
export function deliveryNote(message: Pick<ThreadMessage, "source" | "status">): string | null {
  if (message.source !== "sent") return null;
  switch (message.status) {
    case "failed":
      return "Failed";
    case "undelivered":
      return "Not delivered";
    case "queued":
    case "accepted":
      return "Queued";
    case "sent":
      return "Sent, not yet delivered";
    default:
      return null;
  }
}
