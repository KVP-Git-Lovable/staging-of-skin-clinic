/**
 * Making sure the sign-in check always finishes.
 *
 * Staff have the app installed to the phone home screen, and for a few of
 * them tapping it gave a white screen every time.
 *
 * `loading` starts true and App.tsx renders `null` while it is - so if the
 * check never completes, every protected route renders nothing, for ever.
 * The error boundary cannot help: `null` is a successful render, not a
 * failure. The old call had neither a catch nor a timeout:
 *
 *   supabase.auth.getSession().then(({ data }) => syncSessionState(data.session));
 *
 * getSession() reads the stored token and refreshes it when it has expired.
 * It can reject when that stored value is corrupt or half-written, or when
 * storage is blocked; it can hang when a phone wakes with no usable network.
 * The token persists, so the same user hit it on every open - which is why
 * this was a few people every time rather than everybody occasionally.
 *
 * The answer is not to recover the session - it is to stop waiting. A failed
 * check means signed out, which lands on the login screen, and signing in
 * writes a fresh token over the bad one.
 */

/**
 * Long enough that a slow phone on a bad connection still signs in normally,
 * short enough that nobody sits looking at nothing.
 */
export const SESSION_CHECK_TIMEOUT_MS = 8000;

export type BootstrapOutcome<S> = {
  session: S | null;
  /** How it ended, for the console line and for the tests. */
  reason: "ok" | "failed" | "timed_out";
};

/**
 * Resolve the stored session, or give up and call it signed out.
 *
 * Never rejects and never hangs: whatever happens, the caller gets an answer
 * it can stop loading on.
 */
export async function resolveStoredSession<S>(
  getSession: () => Promise<{ data: { session: S | null } }>,
  timeoutMs: number = SESSION_CHECK_TIMEOUT_MS,
  setTimeoutFn: typeof setTimeout = setTimeout,
  clearTimeoutFn: typeof clearTimeout = clearTimeout,
): Promise<BootstrapOutcome<S>> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<BootstrapOutcome<S>>((resolve) => {
    timer = setTimeoutFn(() => resolve({ session: null, reason: "timed_out" }), timeoutMs);
  });

  const attempt = (async (): Promise<BootstrapOutcome<S>> => {
    try {
      const result = await getSession();
      return { session: result?.data?.session ?? null, reason: "ok" };
    } catch {
      // A corrupt or unreadable stored token. Signed out is the honest
      // answer, and the login screen is where it can be put right.
      return { session: null, reason: "failed" };
    }
  })();

  try {
    return await Promise.race([attempt, timeout]);
  } finally {
    // Whoever won, stop the timer: a pending one keeps a test runner alive
    // and holds the closure in memory for the whole timeout.
    if (timer !== undefined) clearTimeoutFn(timer);
  }
}
