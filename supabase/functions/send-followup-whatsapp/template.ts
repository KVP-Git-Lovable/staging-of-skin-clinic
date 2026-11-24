/**
 * The two post-treatment follow-ups, and how each is sent.
 *
 * ── The 24-hour rule, which is the whole reason this file has two shapes ──
 *
 * WhatsApp only lets a business send free text within 24 hours of the
 * patient's own last message. Outside that window the only thing it will
 * deliver is a template Meta has approved, word for word, identified by a
 * Content SID. So each follow-up exists twice here: as an approved template
 * for the normal case, and as the identical words sent as ordinary text when
 * the patient happens to have written recently - which is cheaper and avoids
 * Meta's template caps entirely.
 *
 * This is lifted from send-google-review-whatsapp/template.ts, which solved
 * the same problem first.
 *
 * ── Why the greeting is ONE variable ──
 *
 * `Hello {{1}},` rather than `Hello Miss {{1}},`. The title is then decided in
 * _shared/patient-greeting.ts, so changing "Ms." to "Miss" or dropping it is a
 * code change. Baking the title into the approved body would make it a new
 * template and another wait for Meta every time.
 *
 * The bodies below must stay character-identical to what was submitted for
 * approval. followupTemplate.test.ts holds them still.
 */

export type FollowupKind = "24h" | "1week";

const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Approved template bodies, with {{1}} where the greeting goes. */
export const FOLLOWUP_BODIES: Record<FollowupKind, string> = {
  "24h":
    "Hello {{1}},\n" +
    "This is a quick follow-up regarding your treatment done. We wanted to check how are you doing after the treatment.\n" +
    "\n" +
    "Please continue the prescribed medications and aftercare as advised by the doctor.\n" +
    "We are always here to help you.\n" +
    "Looking forward to your feedback.\n" +
    "\n" +
    "Warm regards,\n" +
    "The Skin Clinic",
  "1week":
    "Hello {{1}},\n" +
    "This is a one week follow up. How are you after the treatment?\n" +
    "Kindly reply regarding the same.\n" +
    "Thanks and regards\n" +
    "The Skin Clinic Team",
};

/** The template name as created in Twilio, and the secret holding its SID. */
export const FOLLOWUP_TEMPLATES: Record<FollowupKind, { name: string; secret: string; label: string }> = {
  "24h": {
    name: "skin_followup_24h",
    secret: "TWILIO_FOLLOWUP_24H_TEMPLATE_SID",
    label: "24-hour follow-up",
  },
  "1week": {
    name: "skin_followup_1week",
    secret: "TWILIO_FOLLOWUP_1WEEK_TEMPLATE_SID",
    label: "1-week follow-up",
  },
};

function withPrefix(n: string): string {
  return n.startsWith("whatsapp:") ? n : `whatsapp:${n}`;
}

/** The exact words sent, with the greeting filled in. */
export function followupText(kind: FollowupKind, greeting: string): string {
  return FOLLOWUP_BODIES[kind].replace("{{1}}", greeting);
}

/**
 * Outside the 24-hour window: the approved template, by SID.
 *
 * ContentVariables is a JSON STRING keyed by the variable number, which is the
 * shape Twilio's Messages API takes - not an object, and not positional.
 */
export function followupTemplateParams(
  phoneE164: string,
  from: string,
  contentSid: string,
  greeting: string,
): URLSearchParams {
  return new URLSearchParams({
    To: withPrefix(phoneE164),
    From: withPrefix(from),
    ContentSid: contentSid,
    ContentVariables: JSON.stringify({ "1": greeting }),
  });
}

/** Inside the window: the same words, as an ordinary message. */
export function followupSessionParams(
  phoneE164: string,
  from: string,
  kind: FollowupKind,
  greeting: string,
): URLSearchParams {
  return new URLSearchParams({
    To: withPrefix(phoneE164),
    From: withPrefix(from),
    Body: followupText(kind, greeting),
  });
}

/** True when the patient's last message to the clinic is under 24 hours old. */
export function isWithinServiceWindow(lastInboundAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!lastInboundAt) return false;
  const t = new Date(lastInboundAt).getTime();
  if (Number.isNaN(t)) return false;
  const age = now.getTime() - t;
  // Exactly 24 hours is outside: WhatsApp counts the window as under 24 hours.
  return age >= 0 && age < SERVICE_WINDOW_MS;
}

/**
 * Did Twilio refuse because the approved template is gone?
 *
 * Twilio answers a ContentSid that no longer exists with error 20404 and the
 * bare string "Content was not found". The clinic deleted both follow-up
 * templates on 10 Nov 2026, and relaying those four words put a message that
 * names nothing and suggests nothing in front of the front desk.
 *
 * Lives here rather than in index.ts because index.ts needs Deno to run and
 * this needs to be provable: a check written inline there could be turned into
 * `if (false)` and no test would notice.
 */
export function isDeletedTemplateError(code: unknown, message: unknown): boolean {
  if (Number(code) === 20404) return true;
  return /content was not found/i.test(String(message ?? ""));
}
