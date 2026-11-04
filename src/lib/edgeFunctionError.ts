/**
 * Recovering what an edge function actually said.
 *
 * supabase-js reports any non-2xx from an edge function as a FunctionsHttpError
 * whose message is the generic "Edge Function returned a non-2xx status code",
 * and sets `data` to null. So the usual
 *
 *   if (error) throw error;
 *   if (data?.error) throw new Error(data.error);
 *
 * never reaches the second line, and the reason the function returned - which
 * it did send, as { error: "..." } - is thrown away. The operator gets a red
 * toast that says nothing they can act on.
 *
 * That cost real time: three doctors could not be given logins because
 * create-user-account was failing, and the only signal was that generic string.
 */

/** A FunctionsHttpError carries the original Response here. */
interface WithResponseContext {
  context?: { json?: () => Promise<unknown> };
  message?: string;
}

const GENERIC = /non-2xx status code/i;

/** Supabase rejects passwords it considers weak or found in a breach corpus. */
const WEAK_PASSWORD = /weak|easy to guess|pwned|breach/i;

export const WEAK_PASSWORD_MESSAGE =
  "That password is too common and has appeared in known data breaches. Please choose a different one.";

export const EDGE_FUNCTION_UNREACHABLE =
  "The server could not run this action. The create-user-account function may not be deployed, or its service key is missing. Ask your administrator to redeploy it.";

/**
 * The message worth showing. Prefers what the function itself returned, falls
 * back to plain language when the generic wrapper is all there is, and passes
 * an ordinary error straight through.
 */
export async function edgeFunctionErrorMessage(
  error: unknown,
  fallback = EDGE_FUNCTION_UNREACHABLE,
): Promise<string> {
  if (!error) return fallback;

  const err = error as WithResponseContext;

  // The function's own body, when there is one. Guarded: it may not be JSON,
  // may have been consumed already, or may not be a Response at all.
  try {
    const body = (await err.context?.json?.()) as { error?: string; message?: string } | undefined;
    const fromBody = body?.error || body?.message;
    if (fromBody) return explain(String(fromBody));
  } catch {
    // Not JSON, or already read. Fall through to the message.
  }

  const message = err.message;
  if (!message) return fallback;
  // The wrapper message tells the operator nothing; anything else is real.
  return GENERIC.test(message) ? fallback : explain(message);
}

/** Turn a message only a developer could love into one the operator can act on. */
function explain(message: string): string {
  return WEAK_PASSWORD.test(message) ? WEAK_PASSWORD_MESSAGE : message;
}
