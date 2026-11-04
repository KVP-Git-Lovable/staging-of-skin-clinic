/**
 * Making a failed sync readable.
 *
 * When Salesforce is down it answers with an HTML maintenance page rather than
 * JSON. That markup used to reach the sync panel verbatim - several hundred
 * characters of `<table bgcolor="white" cellpadding="0">` in red, repeated once
 * per failing patient - to say one thing: Salesforce is unavailable, try later.
 *
 * This runs on whatever the edge functions send back, so the photo and document
 * syncs are covered too, including versions deployed before they knew to
 * summarise it themselves.
 */

/** How much of an unrecognised message to keep. */
const MAX_LENGTH = 200;

const MAINTENANCE = /down for maintenance|be back shortly|service unavailable|temporarily unavailable/i;

// Matched only where a status code actually looks like one - "[503]" as the
// edge functions format it, or "HTTP 503". A bare \b50[234]\b would turn
// "503 rows rejected" into a phantom Salesforce outage.
const UNAVAILABLE_STATUS = /\[(?:50[234])\]|\bHTTP\s*50[234]\b/i;

function stripMarkup(text: string): string {
  if (!text.includes("<")) return text;
  return text
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * One readable line for a sync failure.
 *
 * A Salesforce outage is named as such, because it needs no investigation and
 * no fix - only a later retry - and because the sync marks no patient as done
 * when it fails, so nothing is half-imported. Anything else keeps its detail,
 * trimmed, so a real error stays diagnosable.
 */
export function syncErrorMessage(raw: string | null | undefined): string {
  const text = stripMarkup(String(raw ?? "").trim());
  if (!text) return "Sync failed for an unknown reason.";

  if (MAINTENANCE.test(text) || UNAVAILABLE_STATUS.test(text)) {
    return "Salesforce is temporarily unavailable (maintenance). Nothing was imported and no patient was marked as synced — run the sync again once Salesforce is back.";
  }

  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH).trimEnd()}…` : text;
}

/**
 * The same, for a list of per-patient errors.
 *
 * Identical messages collapse to one: when Salesforce is down every patient
 * fails the same way, and saying so twice made the panel twice as alarming
 * without adding anything.
 */
export function summariseSyncErrors(errors: Array<string | null | undefined>): string {
  const seen: string[] = [];
  for (const e of errors) {
    const message = syncErrorMessage(e);
    if (e && !seen.includes(message)) seen.push(message);
  }
  return seen.slice(0, 2).join(" ");
}
