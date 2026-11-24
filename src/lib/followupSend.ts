// whatsappShareUrl lives beside the Google review message because that is where
// this problem was solved first, and it stays the single authority on how a
// staff WhatsApp link is built - web.whatsapp.com rather than wa.me, for
// reasons its own comment sets out at length. Two copies of that decision is
// how one of the two buttons ends up blocked again.
import { whatsappShareUrl } from "@/lib/googleReview";
import { patientGreeting, type NamedPatient } from "@/lib/patientName";
import { contactNotice } from "@/lib/contactNotice";

/**
 * The 24-hour and 1-week post-treatment follow-ups.
 *
 * ── Why these open WhatsApp instead of sending ──
 *
 * They were built to send themselves, through send-followup-whatsapp and two
 * approved Meta templates. The clinic deleted those templates on 10 Nov 2026,
 * so there is nothing left for that sender to send: outside WhatsApp's
 * 24-hour service window only an approved template is deliverable at all, and
 * there is no longer one.
 *
 * So these follow the Google review button instead. The button opens WhatsApp
 * Web with the patient's number and the message already typed, and a staff
 * member presses send. The wording is then the clinic's own and can be edited
 * here, in code, with no approval and no waiting.
 *
 * send-followup-whatsapp and supabase/functions/send-followup-whatsapp are
 * LEFT IN PLACE, switched off from here rather than deleted - exactly as
 * send-google-review-whatsapp was. If the clinic ever gets templates approved
 * again, pointing TWILIO_FOLLOWUP_24H_TEMPLATE_SID and its sibling at the new
 * SIDs is all that is needed to go back to sending.
 *
 * ── The name ──
 *
 * A Meta template takes variables; a typed WhatsApp message takes whatever we
 * write. So the patient's name goes in automatically now, which it could not
 * before without another approval round. 161 patients have no usable name -
 * 153 hold a phone number where the name should be, 8 have a single character
 * - and those simply get "Hello," with no name, instead of the button being
 * disabled as it used to be. A greeting that degrades is better than a button
 * that refuses.
 */

export type FollowupKind = "24h" | "1week";

export const FOLLOWUP_KINDS = [
  { kind: "24h", label: "24-hour follow-up", short: "24h follow-up" },
  { kind: "1week", label: "1-week follow-up", short: "1 week follow-up" },
] as const;

/**
 * The clinic's wording, as they wrote it on 10 Nov 2026.
 *
 * {greeting} is replaced by "Hello Ms. Surekha," or, when there is no usable
 * name, by a plain "Hello,". It is the whole line including the comma, so the
 * no-name case does not leave a space before it.
 *
 * Edit these freely - nothing here is approved by anyone. What they must NOT
 * do is drift from the one message already sent through the old template
 * sender, which isFollowupMessage below still has to recognise.
 */
export const FOLLOWUP_BODIES: Record<FollowupKind, string> = {
  "24h":
    "{greeting}\n" +
    "This is a quick follow-up regarding your treatment done. We wanted to check how are you doing after the treatment.\n" +
    "\n" +
    "Please continue the prescribed medications and aftercare as advised by the doctor.\n" +
    "We are always here to help you.\n" +
    "Looking forward to your feedback.\n" +
    "\n" +
    "Warm regards,\n" +
    "The Skin Clinic",
  "1week":
    "{greeting}\n" +
    "This is a one week follow up. How are you after the treatment?\n" +
    "Kindly reply regarding the same.\n" +
    "Thanks and regards\n" +
    "The Skin Clinic Team",
};

/** "Hello Ms. Surekha," when the name can be used, otherwise "Hello,". */
export function followupGreeting(patient: NamedPatient | null | undefined): string {
  const name = patientGreeting(patient);
  return name ? `Hello ${name},` : "Hello,";
}

/** The exact words that will be typed into WhatsApp. */
export function followupMessage(kind: FollowupKind, patient: NamedPatient | null | undefined): string {
  return FOLLOWUP_BODIES[kind].replace("{greeting}", followupGreeting(patient));
}

export interface FollowupShareState {
  enabled: boolean;
  /** Where the button goes. null when there is nowhere to send it. */
  url: string | null;
  /** Shown under a disabled button, so it is clear why. Empty when enabled. */
  reason: string;
}

/**
 * What a follow-up button should do, decided here rather than in the component.
 *
 * The same shape reviewRequestState uses, and for the same reason: the
 * appointment sheet would need the whole of Supabase, React Query and the
 * router mocked to assert one button, so the decision is made where a test can
 * reach it and the component only renders it.
 *
 * The ONLY thing that disables a button now is a phone number WhatsApp cannot
 * open a chat on. The name no longer gates anything.
 */
export function followupShareState(
  phone: string | null | undefined,
  patient: NamedPatient | null | undefined,
  kind: FollowupKind,
): FollowupShareState {
  const url = whatsappShareUrl(phone, followupMessage(kind, patient));
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
 * Is this recorded outbound message one of these follow-ups?
 *
 * Still needed even though nothing sends through the app any more: one
 * 24-hour follow-up DID go out through the old template sender, on
 * 10 Nov 2026, before the templates were deleted. That patient must not be
 * messaged again as though they had never been contacted.
 *
 * Matched on wording rather than on a template name, because Twilio returned
 * no body for a template send and the sender wrote its own fallback text in
 * that case - so both spellings have to be recognised.
 */
export function isFollowupMessage(kind: FollowupKind, content: string | null | undefined): boolean {
  const text = String(content ?? "").toLowerCase();
  if (!text.trim()) return false;
  if (kind === "1week") {
    return text.includes("one week follow up") || text.includes("1-week follow-up");
  }
  return text.includes("follow-up regarding your treatment") || text.includes("24-hour follow-up");
}

/**
 * When this patient was last sent, or last shown, this follow-up.
 *
 * Two sources, because there are two kinds of mark and they mean different
 * things - contactNotice.ts explains which. One 24-hour follow-up really was
 * SENT through the old template sender before the templates were deleted, so
 * both have to be read or that patient reads as never contacted.
 */
export function followupContactNotice(
  lastSentAt: string | Date | null | undefined,
  lastOpenedAt: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  return contactNotice(lastSentAt, lastOpenedAt, "Follow-up opened", now);
}
