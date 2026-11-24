import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { resolveStoredSession, SESSION_CHECK_TIMEOUT_MS } from "@/lib/authBootstrap";

/**
 * The sign-in check has to finish, whatever happens.
 *
 * `loading` starts true and App.tsx renders null while it is, so a check that
 * never completes is a white screen for ever - which is what a few staff had
 * on their home-screen app, every time they opened it.
 */

const code = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ok = <S,>(session: S | null) => () => Promise.resolve({ data: { session } });

describe("resolving the stored session", () => {
  it("gives back the session when the check works", async () => {
    const out = await resolveStoredSession(ok({ user: "u1" }));
    expect(out).toEqual({ session: { user: "u1" }, reason: "ok" });
  });

  it("is signed out, not stuck, when there is no session", async () => {
    expect(await resolveStoredSession(ok(null))).toEqual({ session: null, reason: "ok" });
  });

  it("is signed out, not stuck, when the check rejects", async () => {
    // A corrupt or unreadable stored token. This is the one that left the
    // app blank: the promise rejected, nothing caught it, loading stayed
    // true and every protected route rendered nothing.
    const out = await resolveStoredSession(() => Promise.reject(new Error("bad token")));
    expect(out).toEqual({ session: null, reason: "failed" });
  });

  it("never rejects, so the caller can always stop loading", async () => {
    await expect(resolveStoredSession(() => Promise.reject(new Error("boom")))).resolves.toBeDefined();
  });

  it("survives a check that answers with nothing at all", async () => {
    const out = await resolveStoredSession((() => Promise.resolve(undefined)) as never);
    expect(out).toEqual({ session: null, reason: "ok" });
  });

  it("gives up when the check never settles", async () => {
    // A phone waking with no usable network: the promise simply never
    // resolves, and without a timeout the app waits for ever.
    vi.useFakeTimers();
    try {
      const pending = resolveStoredSession<unknown>(() => new Promise(() => {}), 5000);
      await vi.advanceTimersByTimeAsync(5000);
      expect(await pending).toEqual({ session: null, reason: "timed_out" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("waits for a slow check rather than giving up early", async () => {
    vi.useFakeTimers();
    try {
      const slow = () =>
        new Promise<{ data: { session: string } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: "late-but-fine" } }), 3000),
        );
      const pending = resolveStoredSession(slow, 5000);
      await vi.advanceTimersByTimeAsync(3000);
      expect(await pending).toEqual({ session: "late-but-fine", reason: "ok" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears its timer, so nothing is left pending behind it", async () => {
    const clear = vi.fn();
    await resolveStoredSession(ok("s"), 5000, setTimeout, clear as unknown as typeof clearTimeout);
    expect(clear).toHaveBeenCalled();
  });

  it("allows a slow phone a real chance before giving up", () => {
    expect(SESSION_CHECK_TIMEOUT_MS).toBeGreaterThanOrEqual(5000);
  });
});

describe("the app uses it", () => {
  it("never calls getSession without a way out", () => {
    // A bare .then() is the bug: no catch, no timeout, loading stuck true.
    const source = code("src/hooks/useAuth.tsx");
    expect(source).toContain("resolveStoredSession(() => supabase.auth.getSession())");
    expect(source).not.toMatch(/supabase\.auth\.getSession\(\)\.then\(/);
  });

  it("stops loading whatever the answer was", () => {
    const source = code("src/hooks/useAuth.tsx");
    const at = source.indexOf("resolveStoredSession");
    expect(source.indexOf("syncSessionState(s)", at)).toBeGreaterThan(at);
  });
});

describe("the page says something when nothing loads", () => {
  const html = () => readFileSync("index.html", "utf8");

  it("puts markup inside #root rather than leaving it empty", () => {
    // An empty #root plus a failed module is a white screen with no message,
    // no retry and nothing anyone can report.
    const source = html();
    // Not just "something after the tag" - the shell has to be INSIDE #root,
    // or React's mount does not replace it and it lingers behind the app.
    expect(source).not.toMatch(/<div id="root">\s*<\/div>/);
    const opened = source.indexOf('<div id="root">');
    const beforeScript = source.indexOf('<script type="module"', opened);
    expect(opened).toBeGreaterThan(-1);
    expect(source.slice(opened, beforeScript)).toContain('id="boot-shell"');
  });

  it("offers a reload once it is clear the app did not start", () => {
    const source = html();
    expect(source).toContain('id="boot-retry"');
    expect(source).toContain("The app could not load");
    expect(source).toContain("window.location.reload()");
  });

  it("hides the retry until it is needed", () => {
    expect(html()).toMatch(/id="boot-retry"[\s\S]{0,200}?hidden/);
  });

  it("clears stored copies only when the app never started, at most once per session", () => {
    // The shell is the one place this may happen: no app is running there,
    // so nothing fights the update machinery in registerPwa.ts. Automatic
    // recovery is guarded by a sessionStorage flag so it can never loop.
    const source = html();
    expect(source).toMatch(/function recover\(\)[\s\S]*unregister\(/);
    expect(source).toMatch(/function recover\(\)[\s\S]*caches\.delete/);
    expect(source).toMatch(/sessionStorage\.getItem\(RECOVERY_FLAG\)\) return;\s*sessionStorage\.setItem\(RECOVERY_FLAG/);
  });

  it("still loads the app the same way", () => {
    expect(html()).toContain('<script type="module" src="/src/main.tsx"></script>');
  });
});
