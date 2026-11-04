import { normalizePhone } from "@/lib/audienceImport";

/**
 * Asking a patient for a Google review.
 *
 * The Feedback tab shows what somebody thought of their visit and then stops.
 * When the comment reads "Dr. Ashwini explained me the procedures and i was
 * happy", that is the moment to ask for a public review, and there was nothing
 * on the screen to do it with.
 *
 * The wording below is the clinic's own, kept exactly as they wrote it - the
 * link, the address and the number included. It is also the body of the
 * `google_review_request` template in Communications Centre, so the two say
 * the same thing: today staff send it from their own WhatsApp, and once Meta
 * approves the template the app will send it itself. If one is ever edited,
 * the other has to be edited with it.
 *
 * No name placeholder, deliberately. The clinic wrote it without one, and a
 * body with no variables is also the easiest kind for Meta to approve.
 *
 * Meta approves a BODY, not a template name, so this text and the approved
 * template have to say the same thing - the test below holds them together.
 *
 * The link changed on 28 Oct 2026. Patients were being asked to sign in to
 * Google when they tapped the old one, and most then gave up; the clinic
 * tested this one on a phone and it opens already signed in, on the review box
 * itself rather than the clinic's listing.
 *
 * That means a NEW template: until Meta approves it and
 * TWILIO_GOOGLE_REVIEW_TEMPLATE_SID is pointed at the new SID, a patient
 * outside the 24-hour window still receives the old link, because that body
 * lives at Meta and not here. A patient inside the window gets this one. The
 * mismatch is expected and temporary - it is not a bug to be "fixed" by
 * putting the old link back.
 *
 * Submitted as MARKETING, deliberately, and asked about twice now.
 *
 * Utility is the category the clinic wants, because Meta's per-user cap on
 * marketing messages (error 63049) is what makes a review request silently
 * fail to arrive - and when nothing arrives the natural thing is to press send
 * again, which is why reviewAlreadySentNotice and isReviewRequestMessage below
 * exist at all. But Utility will not stick here:
 *
 *   - Since 9 April 2025 Meta re-categorises on its own. A template submitted
 *     as Utility that Meta reads as marketing is approved AS marketing and
 *     charged at marketing rates, so choosing Utility buys a notice, not an
 *     exemption.
 *   - A feedback request counts as Utility only when it is about a SPECIFIC
 *     order or interaction. This body is generic on purpose - no visit date,
 *     no service, no variable - so it reads as a general ask.
 *
 * The honest route to Utility is to tie the message to the visit: "…for
 * visiting on {{1}}", with the sender passing the date. That would escape the
 * cap. It also means new wording and variables to get approved - three of the
 * earlier rejections were about variable examples - and the clinic chose to
 * get this one approved first.
 */
export const GOOGLE_REVIEW_MESSAGE = `It has been a great pleasure serving you. Your feedback really matter to us. Please leave us a review and share your experience about the treatment and clinic with us. 
Click on the link: https://search.google.com/local/writereview?placeid=ChIJL-NphEdaozsRyFHNoxiLDVA

The Skin Clinic
Vyasa Rao Road, Kadri Kambla Rd, Mangalore, Karnataka 575002
063607 53030`;

/** Where the review actually goes, pulled out so a test can hold it still. */
export const GOOGLE_REVIEW_LINK = "https://search.google.com/local/writereview?placeid=ChIJL-NphEdaozsRyFHNoxiLDVA";

/**
 * The link this message carried until 28 Oct 2026.
 *
 * Kept because nine requests have already gone out with it, and the "already
 * sent" notice finds a previous send by looking for the link in the message.
 * Drop this and those nine patients read as never asked - and the notice
 * exists precisely because people were receiving this message twice.
 */
export const GOOGLE_REVIEW_LINK_LEGACY = "https://g.co/kgs/6Zy6nc";

/**
 * A WhatsApp link that opens a chat with this patient, message already typed.
 *
 * web.whatsapp.com/send and NOT wa.me, which is what this used to be.
 *
 * wa.me is a redirector, not WhatsApp: it forwards to api.whatsapp.com/send,
 * which shows a "Continue to chat" page before handing over. That cost staff
 * an extra click on every single request, and api.whatsapp.com is the host
 * that produced "api.whatsapp.com is blocked / ERR_BLOCKED_BY_RESPONSE" when
 * the button was pressed from inside the Lovable preview - Chrome's wording
 * for a page refusing to be framed. Going straight to web.whatsapp.com opens
 * the chat itself: no redirect, no interstitial, and the blocked host is
 * never involved.
 *
 * This is the STAFF link. The patient-facing pages (clinic Landing, patient
 * portal) keep wa.me deliberately - a patient on a phone should land in the
 * WhatsApp app, which is exactly what wa.me is for. Front desk are at a
 * computer with WhatsApp Web already signed in.
 *
 * null when the number cannot be made into a real one, so the caller can
 * disable the button and say why rather than opening WhatsApp on nothing.
 *
 * normalizePhone rather than another phone parser: it already strips
 * punctuation, drops leading zeros and puts the country code on a bare
 * ten-digit Indian mobile, which is how the clinic's numbers are stored.
 */
export function whatsappShareUrl(
  phone: string | null | undefined,
  message: string = GOOGLE_REVIEW_MESSAGE,
): string | null {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  // encodeURIComponent, not encodeURI: the message holds newlines, a colon and
  // a slash-heavy URL, and only the former escapes all of them.
  return `https://web.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(message)}`;
}

/**
 * What the Feedback tab's review button should do, decided here rather than in
 * the component.
 *
 * The component then renders a decision instead of making one, which is the
 * only way this is testable - the appointment sheet it lives in would need the
 * whole of Supabase, React Query and the router mocked to assert one button.
 */
export interface ReviewRequestState {
  enabled: boolean;
  /** Where the button goes. null when there is nowhere to send it. */
  url: string | null;
  /** Shown under a disabled button, so it is clear why. Empty when enabled. */
  reason: string;
}

export function reviewRequestState(phone: string | null | undefined): ReviewRequestState {
  const url = whatsappShareUrl(phone);
  if (!url) {
    return {
      enabled: false,
      url: null,
      reason: "This patient has no usable phone number on their record.",
    };
  }
  return { enabled: true, url, reason: "" };
}

/**
 * What the sender records when Twilio returns no body for a template send.
 *
 * send-google-review-whatsapp writes result.body into whatsapp_conversations,
 * and for a template message Twilio often returns none - so this fallback is
 * the common case, not the rare one. Recognising a previous send has to match
 * both it and the real body.
 */
export const REVIEW_SENT_FALLBACK_TEXT = "Google review request";

/**
 * Is this recorded outbound message one of these review requests?
 *
 * Used to notice that a patient has already had one. A patient received the
 * same message twice a minute apart because nothing in the app knew the first
 * had gone: Meta's marketing cap is intermittent, so when nothing arrives the
 * natural thing is to press again, and when the cap lifts every queued copy
 * lands at once.
 */
export function isReviewRequestMessage(content: string | null | undefined): boolean {
  const text = String(content ?? "");
  if (!text.trim()) return false;
  return (
    text.includes(GOOGLE_REVIEW_LINK) ||
    text.includes(GOOGLE_REVIEW_LINK_LEGACY) ||
    text.includes(REVIEW_SENT_FALLBACK_TEXT)
  );
}

/** A timestamp from the database, or nothing usable. */
function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const when = value instanceof Date ? value : new Date(value);
  return Number.isNaN(when.getTime()) ? null : when;
}

/** "today at 3:42 PM", or "on 2 Nov 2026 at 3:42 PM". */
function whenWords(when: Date, now: Date): string {
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
 * When the last one went, in words - so a second send is a decision rather
 * than a reflex. Empty when none has been sent.
 */
export function reviewAlreadySentNotice(
  lastSentAt: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  const when = toDate(lastSentAt);
  if (!when) return "";
  return `Already sent ${whenWords(when, now)}`;
}

/**
 * Has this patient been asked already, by either route?
 *
 * There are now two ways a patient gets asked and they leave different marks:
 *
 *  - The app sent it through send-google-review-whatsapp, which wrote a row
 *    into whatsapp_conversations. Eleven of those exist. That route is
 *    switched off for now, but the history stays true.
 *  - A staff member opened WhatsApp with the message ready and pressed send
 *    themselves, which is what the button does today. The app records that it
 *    opened the link, in google_review_opens.
 *
 * The two say different things and the wording has to be honest about which.
 * A send through the app is a message Twilio accepted. An open is a staff
 * member having the message in front of them - we cannot see whether they
 * pressed send, let alone whether it arrived. So "Already sent" for the
 * first, "Review link opened" for the second.
 *
 * The LATER of the two wins, because the only question being answered is "has
 * this patient been bothered recently". A tie goes to the confirmed send: if
 * both happened in the same second, the one we actually know about is the
 * stronger claim.
 */
export function reviewContactNotice(
  lastSentAt: string | Date | null | undefined,
  lastOpenedAt: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  const sent = toDate(lastSentAt);
  const opened = toDate(lastOpenedAt);
  if (!sent && !opened) return "";
  // >= rather than >: the tie goes to the send.
  if (sent && (!opened || sent.getTime() >= opened.getTime())) {
    return `Already sent ${whenWords(sent, now)}`;
  }
  return `Review link opened ${whenWords(opened as Date, now)}`;
}
