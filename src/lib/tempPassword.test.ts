import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  SIGN_IN_URL, TEMP_PASSWORD_LENGTH, credentialsMessage, generateTempPassword, tempPasswordIsValid,
} from "./tempPassword";
import { passwordProblem } from "./passwordRules";

/**
 * The password that was generated and thrown away.
 *
 * create-user-account built one server-side, handed it to Supabase, and let
 * it fall out of scope; the response carried { success, auth_user_id,
 * password_sent } and the client discarded even that. Supabase keeps only the
 * hash, so it was unrecoverable the moment the function returned. Akash
 * Macwan's login was created that way on 13 November and nobody ever knew the
 * password.
 */

describe("generateTempPassword", () => {
  it("passes the rules every human password must", () => {
    // Supabase refuses a weak password, and a refusal here is an account
    // that silently does not get created.
    for (let i = 0; i < 200; i++) {
      expect(passwordProblem(generateTempPassword())).toBeNull();
    }
  });

  it("leaves out the characters people get wrong reading them aloud", () => {
    // It goes into a WhatsApp message and gets typed on a phone. O/0 and
    // l/1/I are the pairs that cost a support call.
    for (let i = 0; i < 200; i++) {
      expect(generateTempPassword()).not.toMatch(/[O0lI1]/);
    }
  });

  it("is the length asked for, and 14 by default", () => {
    expect(TEMP_PASSWORD_LENGTH).toBe(14);
    expect(generateTempPassword()).toHaveLength(14);
    expect(generateTempPassword(20)).toHaveLength(20);
  });

  it("never goes below eight, whatever it is asked for", () => {
    // PASSWORD_MIN_LENGTH is 8 and the rules are checked above; a caller
    // passing 4 must not produce something the server will reject.
    expect(generateTempPassword(4).length).toBeGreaterThanOrEqual(8);
    expect(generateTempPassword(0).length).toBeGreaterThanOrEqual(8);
  });

  it("does not repeat itself", () => {
    // The old one was crypto.randomUUID().slice(0, 12) + "A1!" - hex, and a
    // fixed tail that told anyone who saw two of them the shape of the rest.
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateTempPassword());
    expect(seen.size).toBe(500);
  });

  it("does not always put the guaranteed four at the front", () => {
    // One of each kind is drawn first to satisfy the rules; without a
    // shuffle every password would read lower-upper-digit-symbol.
    const shapes = new Set<string>();
    for (let i = 0; i < 200; i++) {
      shapes.add(generateTempPassword().slice(0, 4).replace(/[a-z]/g, "l")
        .replace(/[A-Z]/g, "U").replace(/[0-9]/g, "d").replace(/[^lUd]/g, "s"));
    }
    expect(shapes.size).toBeGreaterThan(1);
  });

  it("agrees with its own validity check", () => {
    expect(tempPasswordIsValid(generateTempPassword())).toBe(true);
    expect(tempPasswordIsValid("short")).toBe(false);
  });
});

describe("credentialsMessage", () => {
  const msg = credentialsMessage({ name: "Akash Macwan", email: "a@b.com", password: "Xy7#qwerty" });

  it("carries everything the person receiving it needs", () => {
    // The password alone is no use - they need to know where to put it and
    // which email it belongs to.
    expect(msg).toContain("a@b.com");
    expect(msg).toContain("Xy7#qwerty");
    expect(msg).toContain(SIGN_IN_URL);
    expect(SIGN_IN_URL).toBe("https://clinic.quickapp.ai");
  });

  it("says the password is temporary, because it is", () => {
    expect(msg).toMatch(/choose your own password the first time/i);
  });

  it("greets them by name, and copes without one", () => {
    expect(msg).toMatch(/^Hello Akash Macwan,/);
    expect(credentialsMessage({ email: "a@b.com", password: "x" })).toMatch(/^Your The Skin Clinic/);
    expect(credentialsMessage({ name: "  ", email: "a@b.com", password: "x" })).toMatch(/^Your The Skin Clinic/);
  });
});

describe("the edge function", () => {
  const fn = () =>
    readFileSync("supabase/functions/create-user-account/index.ts", "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

  it("checks who is calling before it does anything", () => {
    // It had NO caller check: it built a service-role client and acted on the
    // request body. It is not an anonymous function - verify_jwt is on - but
    // that means ANY valid JWT, so every signed-in therapist could call
    // reset_password with an admin's auth_user_id and take the account over.
    const src = fn();
    expect(src).toMatch(/req\.headers\.get\("Authorization"\)/);
    expect(src).toMatch(/supabaseAdmin\.auth\.getUser\(token\)/);
    expect(src).toMatch(/403/);
  });

  it("guards every action, not just the one that creates", () => {
    // reset_password and delete_user were open the same way, so the check
    // has to come before the branch that reads `action`.
    const src = fn();
    const guard = src.indexOf("Only an admin can create or change staff logins");
    const action = src.indexOf('const { action } = body');
    expect(guard).toBeGreaterThan(-1);
    expect(action).toBeGreaterThan(guard);
  });

  it("requires an active admin, not merely a staff row", () => {
    const src = fn();
    expect(src).toMatch(/callerRole\.toLowerCase\(\) === "admin"/);
    expect(src).toMatch(/is_active.*!== false/);
  });

  it("returns a password it generated, and never one it was given", () => {
    // Echoing back a password the admin typed is free risk - they have it.
    const src = fn();
    expect((src.match(/temp_password: password \? null : \w+/g) ?? []).length).toBe(2);
  });

  it("no longer builds a password out of a UUID", () => {
    const src = fn();
    expect(src).not.toMatch(/randomUUID\(\)\.slice/);
    expect(src).toMatch(/crypto\.getRandomValues/);
    expect((src.match(/generateTempPassword\(\)/g) ?? []).length).toBe(2);
  });

  it("is written down in config.toml rather than inheriting its setting", () => {
    const toml = readFileSync("supabase/config.toml", "utf8");
    const block = toml.split("[functions.create-user-account]")[1] ?? "";
    expect(block).toMatch(/verify_jwt = true/);
  });
});
