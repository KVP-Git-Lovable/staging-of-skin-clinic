import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The staff app's front door, after the 7 Nov sign-up.
 *
 * An outside account created itself through the open sign-up and logged in.
 * Sign-up was closed on 10 Nov and the database was shut to anyone without a
 * staff record. These hold the remaining edges of that: the sign-in page no
 * longer hands visitors onward into the patient portal or the shop, and the
 * backup tables the restrictive policy could not reach are locked.
 */

const LOGIN = "src/pages/auth/Login.tsx";
const MIGRATION = "supabase/migrations/20261111080000_backups_the_restrictive_policy_never_reached.sql";

describe("the staff sign-in page", () => {
  const login = () => readFileSync(LOGIN, "utf8");

  it("offers nothing below the Sign In button", () => {
    // The clinic asked for both links gone: this page is for staff, and a
    // visitor being walked into the portal or the shop from it is the kind of
    // open door that the 7 Nov sign-up walked through.
    const src = login();
    expect(src).not.toContain("open the patient portal");
    expect(src).not.toContain("Continue browsing as guest");
    expect(src).not.toMatch(/to="\/portal"/);
    expect(src).not.toMatch(/to="\/shop"/);
  });

  it("still signs staff in", () => {
    // The removal was two <p> blocks. If the form went with them, the page is
    // useless and this file would otherwise be happy about it.
    const src = login();
    expect(src).toContain("supabase.auth.signInWithPassword");
    expect(src).toContain("Sign In");
  });

  it("leaves no import behind that nothing uses", () => {
    const src = login();
    if (!src.includes("<Link")) {
      expect(src, "Link is imported but no longer used").not.toMatch(/import \{[^}]*\bLink\b/);
    }
  });
});

describe("a patient who signs in can still find the portal", () => {
  it("the not-staff screen points them there", () => {
    // Taking the link off the sign-in page must not strand a patient who
    // already has an account - this screen is what they now see, and it is the
    // right place for that link.
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain("This app is for clinic staff only");
    expect(app).toMatch(/href="\/portal"/);
  });

  it("public sign-up is still closed", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toMatch(/path="\/signup"[\s\S]{0,80}Navigate to="\/login"/);
  });
});

describe("the backup tables the restrictive policy never reached", () => {
  const sql = () => readFileSync(MIGRATION, "utf8");

  it("names every table rather than looping over 'RLS is off'", () => {
    // A loop over relrowsecurity = false would also swallow any table added
    // later that genuinely needs anon - the shop and the public catalogue both
    // rely on anon policies.
    const src = sql();
    expect(src).not.toMatch(/relrowsecurity\s*=\s*false/i);
    expect(src).not.toMatch(/not c\.relrowsecurity/i);
    const names = src.match(/'[a-z_]+_(backup_\d+|corrections|20260926)'/g) ?? [];
    expect(new Set(names).size).toBe(18);
  });

  it("switches row-level security on, not just the grants", () => {
    // Revoking alone would still leave the table open to anything granted
    // later; RLS off means Postgres consults no policy at all.
    const src = sql();
    expect(src).toContain("enable row level security");
    expect(src).toContain("revoke all on public.%I from anon");
    expect(src).toContain("revoke all on public.%I from authenticated");
  });

  it("keeps the service role, which the two sf-* functions run as", () => {
    expect(sql()).toContain("grant all on public.%I to service_role");
  });

  it("carries the staff guard, so the AGENTS.md invariant stays true", () => {
    expect(sql()).toMatch(/create policy signed_in_must_be_staff[\s\S]{0,160}is_active_staff/);
  });

  it("proves the revoke worked instead of assuming it", () => {
    const src = sql();
    expect(src).toMatch(/still hold privileges on[\s\S]{0,40}raise exception|raise exception[\s\S]{0,80}still hold privileges/);
  });

  it("survives a table that has already been dropped", () => {
    expect(sql()).toMatch(/v_missing[\s\S]{0,120}continue;/);
  });
});

describe("removing the account that signed itself up", () => {
  const sql = () => readFileSync(MIGRATION, "utf8");

  it("keys on the id AND the email, never on one alone", () => {
    expect(sql()).toMatch(/delete from auth\.users\s*where id = v_user and email = v_email/);
  });

  it("refuses if that id has since become a staff member", () => {
    expect(sql()).toMatch(/staff where auth_user_id = v_user[\s\S]{0,140}raise exception/);
  });

  it("proves exactly one account went, by difference", () => {
    expect(sql()).toMatch(/if v_before - v_after <> 1 then[\s\S]{0,160}raise exception/);
  });

  it("does nothing on a second run", () => {
    expect(sql()).toMatch(/is already gone - nothing to remove[\s\S]{0,60}return;/);
  });

  it("leaves the four test accounts alone", () => {
    // The clinic chose to keep them; only the outsider was asked for.
    //
    // Checked against the CODE, with -- comments stripped: the file names all
    // four in a comment explaining that they stay, and a plain search finds
    // that sentence and reports it as a deletion.
    const code = sql().replace(/^\s*--.*$/gm, "");
    expect(code).toContain("analarajesh2769@gmail.com");
    for (const kept of ["test123@", "test54@", "testing@", "test-exists@"]) {
      expect(code, `${kept} must not appear in the executable SQL`).not.toContain(kept);
    }
    // And exactly one account is ever deleted.
    expect(code.match(/delete from auth\.users/g) ?? []).toHaveLength(1);
  });
});
