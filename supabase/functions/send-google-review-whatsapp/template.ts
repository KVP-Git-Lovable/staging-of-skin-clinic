/**
 * The approved review template's body, character for character. Must match
 * GOOGLE_REVIEW_MESSAGE in src/lib/googleReview.ts (a test holds them equal).
 */
export const REVIEW_TEXT = `It has been a great pleasure serving you. Your feedback really matter to us. Please leave us a review and share your experience about the treatment and clinic with us. 
Click on the link: https://search.google.com/local/writereview?placeid=ChIJL-NphEdaozsRyFHNoxiLDVA

The Skin Clinic
Vyasa Rao Road, Kadri Kambla Rd, Mangalore, Karnataka 575002
063607 53030`;

const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

function withPrefix(n: string): string {
  return n.startsWith("whatsapp:") ? n : `whatsapp:${n}`;
}

/** Approved review template has no substitution variables. */
export function reviewTemplateParams(phoneE164: string, from: string, contentSid: string): URLSearchParams {
  return new URLSearchParams({
    To: withPrefix(phoneE164),
    From: withPrefix(from),
    ContentSid: contentSid,
  });
}

/**
 * Plain message for a patient who wrote to the clinic in the last 24 hours.
 * Inside that window WhatsApp allows ordinary messages, and Meta's cap on
 * marketing templates (error 63049) does not apply to them.
 */
export function reviewSessionParams(phoneE164: string, from: string): URLSearchParams {
  return new URLSearchParams({
    To: withPrefix(phoneE164),
    From: withPrefix(from),
    Body: REVIEW_TEXT,
  });
}

/** True when the patient's last message to the clinic is under 24 hours old. */
export function isWithinServiceWindow(lastInboundAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!lastInboundAt) return false;
  const t = new Date(lastInboundAt).getTime();
  if (Number.isNaN(t)) return false;
  const age = now.getTime() - t;
  return age >= 0 && age < SERVICE_WINDOW_MS;
}
