/**
 * Telling a dead session apart from a real failure.
 *
 * Resetting somebody's password invalidates the session they already have
 * open. Both doctors were signed in when theirs were reset, so their tab was
 * left holding a token the server no longer honours. The forced-password
 * screen then called supabase.auth.updateUser() and showed what came back:
 *
 *   Auth session missing!
 *
 * - on a form that could never succeed, with no hint that signing in again
 * was the way out. They worked it out; the next person might not.
 *
 * This only has to recognise the case. Everything else - a weak password, a
 * network drop - must keep its own message, because those are retryable on
 * the spot and telling somebody to sign in again would be wrong.
 */

/** Supabase's wordings for "there is no usable session here". */
const GONE = [
  "auth session missing",
  "session not found",
  "session expired",
  "invalid refresh token",
  "refresh token not found",
  "jwt expired",
];

export function isSessionGone(error: unknown): boolean {
  const message = (
    typeof error === "string" ? error : (error as { message?: string } | null)?.message ?? ""
  ).toLowerCase();
  if (!message) return false;
  return GONE.some((phrase) => message.includes(phrase));
}

export const SESSION_GONE_TITLE = "Your session has ended";

export const SESSION_GONE_BODY =
  "Sign in again with the password you were given, then choose your own. " +
  "This happens when an admin changes your password while you are signed in.";
