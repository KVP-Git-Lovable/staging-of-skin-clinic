import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SESSION_GONE_BODY, SESSION_GONE_TITLE, isSessionGone } from "./sessionExpired";

/**
 * The form that could never work.
 *
 * Resetting a password invalidates the session that person already has open.
 * Both doctors were signed in when theirs were reset on 13 November, so their
 * tab held a dead token; "Choose your own password" rendered, Save and
 * continue called updateUser, and they got back the raw "Auth session
 * missing!" on a form that could not succeed. They guessed that signing in
 * again was the way out.
 */

describe("isSessionGone", () => {
  it("recognises what Supabase actually said", () => {
    expect(isSessionGone(new Error("Auth session missing!"))).toBe(true);
    expect(isSessionGone({ message: "Auth session missing!" })).toBe(true);
    expect(isSessionGone("Auth session missing!")).toBe(true);
  });

  it("recognises the other ways a session ends", () => {
    for (const m of [
      "Session not found",
      "session expired",
      "Invalid Refresh Token: Refresh Token Not Found",
      "JWT expired",
    ]) {
      expect(isSessionGone(new Error(m)), m).toBe(true);
    }
  });

  it("does not call a retryable failure a dead session", () => {
    // These must keep their own message: the person can fix them where they
    // stand, and telling them to sign in again would lose what they typed.
    for (const m of [
      "Password should be at least 8 characters",
      "New password should be different from the old password",
      "Failed to fetch",
      "Network request failed",
      "",
    ]) {
      expect(isSessionGone(new Error(m)), m).toBe(false);
    }
    expect(isSessionGone(null)).toBe(false);
    expect(isSessionGone(undefined)).toBe(false);
    expect(isSessionGone({})).toBe(false);
  });

  it("says what happened and what to do", () => {
    expect(SESSION_GONE_TITLE).toMatch(/session has ended/i);
    expect(SESSION_GONE_BODY).toMatch(/sign in again/i);
    expect(SESSION_GONE_BODY).toMatch(/password you were given/i);
  });
});

describe("the forced password screen", () => {
  const screen = () =>
    readFileSync("src/components/auth/ChangePasswordRequired.tsx", "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

  it("asks whether there is a session before trying to use one", () => {
    const src = screen();
    expect(src).toMatch(/await supabase\.auth\.getSession\(\)/);
    const submit = src.split("const submit")[1].split("if (sessionGone)")[0];
    expect(submit.indexOf("getSession")).toBeLessThan(submit.indexOf("updateUser"));
  });

  it("catches a session that dies mid-request too", () => {
    // The check above is not enough on its own - the token can expire between
    // the check and the call.
    const src = screen();
    expect(src).toMatch(/if \(isSessionGone\(err\)\) \{/);
  });

  it("replaces the form rather than toasting at it", () => {
    const src = screen();
    expect(src).toMatch(/data-testid="session-gone"/);
    expect(src).toMatch(/data-testid="session-gone-sign-in"/);
    expect(src).toMatch(/onClick=\{\(\) => signOut\(\)\}/);
  });

  it("still shows a real error for anything else", () => {
    // A weak password must not be reported as a dead session.
    expect(screen()).toMatch(/toast\.error\(\(err as Error\)\.message/);
  });
});

describe("the permissions migration", () => {
  const sql = () =>
    readFileSync("supabase/migrations/20261115060000_what_a_receptionist_opens.sql", "utf8")
      .replace(/^\s*--.*$/gm, "");

  it("leaves a receptionist exactly three modules", () => {
    const src = sql();
    expect(src).toMatch(/not in \('dashboard', 'attendance', 'leave'\)/);
    expect((src.match(/r\.name in \('Receptionist', 'Pharmacist'\)/g) ?? []).length).toBe(3);
  });

  it("keeps create on the two things they do themselves", () => {
    // Marking your own day and applying for your own leave are both inserts.
    const src = sql();
    expect(src).toMatch(/set can_view = true, can_create = true[\s\S]*?module_key in \('attendance', 'leave'\)/);
    expect(src).toMatch(/set can_view = true, can_create = false[\s\S]*?module_key = 'dashboard'/);
  });

  it("never grants edit or delete", () => {
    expect(sql()).not.toMatch(/can_edit = true/);
    expect(sql()).not.toMatch(/can_delete = true/);
  });

  it("switches rows off rather than deleting them", () => {
    // Roles & Permissions has to keep listing every module with a box to
    // tick back on.
    expect(sql()).not.toMatch(/delete\s+from/i);
  });

  it("leaves the other roles alone", () => {
    const src = sql();
    for (const role of ["Admin", "Doctor", "Therapist", "Nurse"]) {
      expect(src, `${role} must not be touched`).not.toMatch(new RegExp(`'${role}'`));
    }
  });
});
