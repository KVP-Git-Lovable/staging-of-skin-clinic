// Turning a failed Salesforce response into something a receptionist can read,
// kept out of index.ts so it can be unit-tested (index.ts only runs under Deno).
//
// Salesforce and the connector gateway answer an outage with an HTML page, not
// JSON. Pasted verbatim into the sync panel that produced several hundred
// characters of markup in red - twice over, once per failing patient - for what
// is really one sentence: Salesforce is down, try later.

/** How much of an unrecognised error body is worth showing. */
const MAX_DETAIL = 160;

function textFromHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A one-line description of a failed Salesforce call.
 *
 * Says plainly when Salesforce is simply unavailable, because that needs no
 * investigation and no fix - only a later retry. Anything unrecognised keeps its
 * detail, trimmed, so a real API error is still diagnosable.
 */
export function describeSfFailure(status: number, body: string): string {
  const raw = (body ?? "").trim();
  const detail = raw.startsWith("<") ? textFromHtml(raw) : raw;

  // 503/502/504 are the gateway's "not now" answers; the maintenance page can
  // also arrive with a different status, so match the wording too.
  const unavailable =
    status === 502 || status === 503 || status === 504 || /down for maintenance|be back shortly/i.test(detail);

  if (unavailable) {
    return `Salesforce is temporarily unavailable (HTTP ${status}). Nothing was imported and no patient was marked as synced - run the sync again once Salesforce is back.`;
  }

  const trimmed = detail.length > MAX_DETAIL ? `${detail.slice(0, MAX_DETAIL).trimEnd()}…` : detail;
  return `Salesforce query failed (HTTP ${status})${trimmed ? `: ${trimmed}` : ""}`;
}
