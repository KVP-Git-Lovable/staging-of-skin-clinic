// Common Twilio / Meta WhatsApp error codes → human-readable explanations.
// Extend as new codes are encountered. Unknown codes fall back to the raw message.

export const TWILIO_ERROR_MESSAGES: Record<string, string> = {
  "63003": "Channel could not find the To address",
  "63005": "Channel content violation",
  "63013": "Message blocked - WhatsApp policy violation",
  "63015": "Message body is too long",
  "63016": "Outside the 24-hour customer service window - template required",
  "63017": "Channel could not find the From address",
  "63018": "Daily user-initiated message limit exceeded",
  "63021": "Message blocked - user has blocked this business",
  "63024": "Template paused - quality has dropped",
  "63031": "Account paused - re-engage Twilio support",
  "63032": "Account banned by Meta",
  "63038": "Account daily message limit reached",
  "63049": "Message blocked by Meta - recipient unreachable or opted out of marketing",
  "63051": "Channel is not authorized for sending messages",
  "21408": "Permission to send to this number not enabled",
  "21610": "Recipient has unsubscribed",
  "21612": "The 'To' phone number is not currently reachable via WhatsApp",
  "21614": "'To' number is not a valid mobile number",
  "21617": "Message body exceeds maximum length",
  "21620": "Invalid media URL",
  "30001": "Queue overflow - message dropped",
  "30003": "Unreachable destination handset",
  "30004": "Message blocked by carrier",
  "30005": "Unknown destination handset",
  "30006": "Landline or unreachable carrier",
  "30007": "Carrier violation - message filtered",
  "30008": "Unknown error from carrier",
};

export function describeTwilioError(code?: string | null, fallback?: string | null): string {
  if (!code) return fallback || "";
  const key = String(code).trim();
  const mapped = TWILIO_ERROR_MESSAGES[key];
  if (mapped) return `${key} · ${mapped}`;
  return fallback ? `${key} · ${fallback}` : key;
}