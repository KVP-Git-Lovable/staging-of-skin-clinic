// Edge gateways intentionally serve HTML as plain text. Render OAuth results on
// the app origin instead (the /oauth/result route reads the fragment).
import { DEFAULT_ORIGIN, isAllowedOrigin } from "./meta-oauth-state.ts";

export interface ClosingPageOptions {
  ok: boolean;
  error?: string;
  source: string;
  payload?: Record<string, unknown>;
  /** Origin taken from a verified state; anything not on the allow-list falls back to the default. */
  origin?: string;
}

export function closingPage(opts: ClosingPageOptions): Response {
  const origin = isAllowedOrigin(opts.origin) ? opts.origin : DEFAULT_ORIGIN;
  const message = { ...opts.payload, source: opts.source, ok: opts.ok, error: opts.error };
  const destination = new URL("/oauth/result", origin);
  // No access tokens or authorization codes: the fragment is not sent to the server.
  destination.hash = new URLSearchParams({ result: JSON.stringify(message) }).toString();
  return new Response(null, {
    status: 303,
    headers: { Location: destination.toString(), "Cache-Control": "no-store" },
  });
}
