import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/**
 * The patient-facing feedback path.
 *
 * The portal is not a Supabase-auth app, so a patient reading or editing
 * their own feedback can only go through the portal-data edge function, which
 * resolves the login token server-side and queries with the service role.
 * That function runs on Deno and the trigger that protects the old answers
 * lives in Postgres, so reading them as text is the check available here.
 */
const fn = () => readFileSync("supabase/functions/portal-data/index.ts", "utf8");
const migration = () =>
  readFileSync(
    "supabase/migrations/20261105110000_feedback_the_patient_can_correct.sql",
    "utf8",
  );

/** The body of one `case "x": { ... }` arm, up to the next case. */
function action(name: string): string {
  const source = fn();
  const at = source.indexOf(`case "${name}":`);
  expect(at, `portal-data has no "${name}" action`).toBeGreaterThan(-1);
  const next = source.indexOf('      case "', at + 10);
  return source.slice(at, next === -1 ? source.indexOf("      default:", at) : next);
}

describe("portal-data serves a patient only their own feedback", () => {
  it("scopes the read to the session's patient", () => {
    const read = action("feedback");
    expect(read).toMatch(/patient_feedback\?[^`]*patient_id=eq\.\$\{pid\}/);
  });

  it("scopes the write to the session's patient as well as the row id", () => {
    // Without patient_id=eq.${pid} a patient who knew another row's uuid
    // could rewrite somebody else's feedback.
    const write = action("update_feedback");
    expect(write).toMatch(/patient_feedback\?id=eq\.\$\{id\}&patient_id=eq\.\$\{pid\}/);
  });

  it("takes the patient from the token, never from the request body", () => {
    // The invariant the whole gateway rests on: `pid` is assigned once, from
    // the resolved session, and no action reads a patient id out of payload.
    const source = fn();
    expect(source).toMatch(/const pid = session\.patientId;/);
    expect(source, "an action reads a patient id from the payload").not.toMatch(
      /p\.patient_?Id/i,
    );
  });

  it("reports a row that is not theirs as missing, rather than succeeding quietly", () => {
    const write = action("update_feedback");
    expect(write).toMatch(/if \(!updated\) return json\(\{ error: "Feedback not found" \}, 404\)/);
  });

  it("does not let the portal create feedback, only change it", () => {
    // patient_feedback carries UNIQUE (appointment_id); the clinic records
    // the row at the visit. A portal insert would collide or invent a visit.
    const source = fn();
    const inserts = source.match(/sb\(`patient_feedback`/g) ?? [];
    expect(inserts, "the portal can now insert feedback").toEqual([]);
    expect(action("update_feedback")).toContain('method: "PATCH"');
  });
});

describe("the admin switch really switches it off", () => {
  it("both actions refuse when Feedback is disabled", () => {
    for (const name of ["feedback", "update_feedback"]) {
      expect(
        action(name),
        `the "${name}" action does not check whether Feedback is enabled`,
      ).toMatch(/if \(!\(await feedbackEnabled\(\)\)\) return json\(/);
    }
  });

  it("checks it before touching any data", () => {
    // A check after the query would still have leaked the feedback.
    for (const name of ["feedback", "update_feedback"]) {
      const body = action(name);
      expect(body.indexOf("feedbackEnabled()")).toBeLessThan(body.indexOf("patient_feedback?"));
    }
  });

  it("treats an absent or null flag as off, like the client does", () => {
    const source = fn();
    expect(source).toMatch(/row\?\.feedback_enabled === true/);
    expect(source, "the server defaults Feedback on when the flag is missing").not.toMatch(
      /feedback_enabled !== false/,
    );
  });
});

describe("a correction cannot carry a nonsense score", () => {
  it("bounds NPS to a whole 0-10 and the rating to a whole 1-5", () => {
    // patient_feedback has no CHECK constraint on either column, so this is
    // the only thing between a crafted request and an NPS of 400 in the
    // clinic's reports.
    const write = action("update_feedback");
    expect(write).toMatch(/Number\.isInteger\(nps\)/);
    expect(write).toMatch(/nps < 0 \|\| nps > 10/);
    expect(write).toMatch(/Number\.isInteger\(rating\)/);
    expect(write).toMatch(/rating < 1 \|\| rating > 5/);
  });

  it("caps the comment, and the editor agrees with the server", () => {
    expect(action("update_feedback")).toMatch(/length > 2000/);
    // The cap moved when the form became configurable: the editor is now the
    // shared AnswerControl, which takes its limit from questionMaxLength. The
    // number still has to be the same one the server enforces.
    expect(readFileSync("src/components/feedback/AnswerControl.tsx", "utf8")).toContain(
      "maxLength={questionMaxLength(question)}",
    );
    expect(readFileSync("src/lib/feedbackQuestions.ts", "utf8")).toMatch(
      /questionMaxLength[\s\S]*?max > 0 \? max : 2000/,
    );
  });

  it("marks the edit as the patient's", () => {
    expect(action("update_feedback")).toMatch(/last_edited_by: "patient"/);
  });
});

/**
 * The clinic's standing rule is that old data matters. NPS 1 is clinically
 * interesting even after the patient says they meant 9.
 */
describe("an edit never loses the original answer", () => {
  it("snapshots the old row BEFORE the update lands", () => {
    const sql = migration();
    expect(sql).toMatch(/before update on public\.patient_feedback/);
    expect(sql).toMatch(/insert into public\.patient_feedback_revisions/);
  });

  it("keeps all three answers, not just the score", () => {
    const sql = migration();
    const body = sql.slice(sql.indexOf("insert into public.patient_feedback_revisions"));
    for (const col of ["old.nps_score", "old.service_rating", "old.comments"]) {
      expect(body, `${col} is not snapshotted`).toContain(col);
    }
  });

  it("only writes a revision when an answer actually changed", () => {
    expect(migration()).toMatch(
      /new\.nps_score is distinct from old\.nps_score[\s\S]{0,200}new\.comments is distinct from old\.comments/,
    );
  });

  it("is a trigger, so no edit path can skip it", () => {
    // The portal is not the only possible editor - RLS already lets any
    // signed-in staff user update this table. A snapshot written by whichever
    // screen happens to be editing would be bypassed by the next one.
    const sql = migration();
    const trig = sql.indexOf("create trigger patient_feedback_snapshot");
    expect(trig).toBeGreaterThan(-1);
    // Comments are stripped rather than matched around: the function's own
    // comment explains that the trigger does this, and naming the table there
    // is not the same as writing to it.
    const code = fn()
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(
      code,
      "the edge function writes the revision itself instead of relying on the trigger",
    ).not.toContain("patient_feedback_revisions");
  });

  it("nothing but the trigger may write the history", () => {
    const sql = migration();
    expect(sql).toMatch(/grant select on public\.patient_feedback_revisions to authenticated/);
    expect(sql).toMatch(/revoke all on public\.patient_feedback_revisions from anon/);
    expect(sql, "an update or delete policy on the history").not.toMatch(
      /policy[^\n]*patient_feedback_revisions[^\n]*for (update|delete)/i,
    );
  });
});

/**
 * The clinic runs the PUBLISHED build at clinic.quickapp.ai, which does not
 * change until somebody publishes, while a migration reaches the same database
 * at once. So this migration has to leave that build working.
 */
describe("the migration keeps the published build working", () => {
  const sql = () => migration();

  it("leaves anon able to READ portal_settings", () => {
    // The published portal decides which tabs to show by reading this table
    // with the anonymous key. Revoking select would blank the live portal.
    expect(sql()).not.toMatch(/revoke[^;]*\bselect\b[^;]*on public\.portal_settings from anon/i);
    expect(sql()).not.toMatch(
      /drop policy[^\n]*"Allow public read portal_settings"/i,
    );
  });

  it("takes away only the anonymous WRITE", () => {
    const text = sql();
    expect(text).toMatch(/drop policy if exists "Allow public insert portal_settings"/);
    expect(text).toMatch(/drop policy if exists "Allow public update portal_settings"/);
    expect(text).toMatch(/revoke insert, update, delete, truncate, references on public\.portal_settings from anon/);
  });

  it("leaves the staff editor's own policies alone", () => {
    // Pharma.tsx saves this row as `authenticated`; those policies are named
    // "Auth insert/update portal_settings" and must survive.
    expect(sql()).not.toMatch(/drop policy[^\n]*"Auth (insert|update|read) portal_settings"/i);
  });

  it("adds columns with defaults and renames nothing", () => {
    const text = sql();
    expect(text).toMatch(/add column if not exists feedback_enabled boolean not null default false/);
    // A NOT NULL without a default, a rename or a drop would break the
    // published build's inserts the moment it was applied.
    expect(text).not.toMatch(/rename column/i);
    expect(text).not.toMatch(/drop column/i);
    expect(text).not.toMatch(/add column[^;]*not null(?![^;]*default)/i);
  });

  it("adds no second foreign key between tables that are already embedded", () => {
    // Adding therapist_id to appointments gave that table a second route to
    // staff and broke every implicit embed in the live clinic. The new table
    // references patient_feedback and nothing else.
    const refs = sql().match(/references public\.(\w+)/g) ?? [];
    expect(refs).toEqual(["references public.patient_feedback"]);
  });
});

/**
 * Removing feedback entered while testing.
 *
 * patient_feedback has no Trash, so a delete is final. The repo's rule, set by
 * 20261029100000_feedback_given_by_mistake.sql, is that nothing is deleted
 * until a copy is demonstrably in place.
 *
 * Run over EVERY cleanup migration rather than the newest one. There are two
 * now and there will be more - the clinic tests on real screens - and a rule
 * re-stated by hand each time is a rule that holds until somebody is in a
 * hurry. These guard the shape of the files, not their effect: both have
 * already run against the clinic's database.
 */
const FEEDBACK_CLEANUPS = [
  { date: "20261105", file: "supabase/migrations/20261105130000_feedback_entered_while_testing.sql" },
  { date: "20261110", file: "supabase/migrations/20261110130000_feedback_testing_the_follow_up_buttons.sql" },
];

describe.each(FEEDBACK_CLEANUPS)("the $date test-feedback cleanup", ({ date, file }) => {
  const cleanup = () => readFileSync(file, "utf8");

  it("copies the row before it deletes it", () => {
    const sql = cleanup();
    const copied = sql.indexOf(`insert into public.patient_feedback_backup_${date}`);
    const deleted = sql.indexOf("delete from public.patient_feedback");
    expect(copied, "nothing is copied").toBeGreaterThan(-1);
    expect(deleted, "nothing is deleted").toBeGreaterThan(-1);
    expect(copied, "the delete comes before the backup").toBeLessThan(deleted);
  });

  it("copies the edit snapshots before the row that would cascade them away", () => {
    // They carry `on delete cascade`, so copying them after the parent goes
    // would be copying nothing.
    const sql = cleanup();
    const snapshots = sql.indexOf(`insert into public.patient_feedback_revisions_backup_${date}`);
    const parent = sql.indexOf(`insert into public.patient_feedback_backup_${date}`);
    expect(snapshots, "the snapshots are never copied").toBeGreaterThan(-1);
    expect(snapshots, "the snapshots are copied after the parent, i.e. too late")
      .toBeLessThan(parent);
  });

  it("refuses to delete unless the copy verified", () => {
    const sql = cleanup();
    const guard = sql.indexOf("was not backed up");
    const deleted = sql.indexOf("delete from public.patient_feedback");
    expect(guard, "there is no backup guard").toBeGreaterThan(-1);
    expect(guard, "the guard runs after the delete").toBeLessThan(deleted);
    expect(sql).toMatch(/if v_rev_saved <> v_revisions then[\s\S]{0,200}raise exception/);
  });

  it("keys on the id, never the comment text", () => {
    // Three rows in the table read "All good" and "Testing" is a word a real
    // patient could write.
    const sql = cleanup();
    const stmt = sql.slice(
      sql.indexOf("delete from public.patient_feedback"),
      sql.indexOf("get diagnostics v_removed"),
    );
    expect(stmt).toMatch(/where id = v_feedback and appointment_id = v_appt/);
    expect(stmt, "the delete matches on comment text").not.toMatch(/comments/);
  });

  it("proves only one row went, by difference rather than an expected total", () => {
    // The clinic records real feedback all day - three rows arrived while the
    // 10 Nov removal was being written - so a hard-coded total would be wrong
    // by the time it ran.
    expect(cleanup()).toMatch(/if v_before - v_after <> 1 then[\s\S]{0,160}raise exception/);
  });

  it("does nothing on a second run", () => {
    expect(cleanup()).toMatch(/is already gone - nothing to remove[\s\S]{0,80}return;/);
  });

  it("locks its backup tables down, unlike the 29 Oct one", () => {
    // `create table ... (like ...)` copies neither RLS nor grants, which is
    // how patient_feedback_backup_20261029 ended up readable by anon while
    // patient_feedback itself is closed to it.
    const sql = cleanup();
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/revoke all on public\.%I from anon/);
    expect(sql).toMatch(/grant select on public\.%I to authenticated/);
  });
});

describe("backup tables created since clinic data went staff-only", () => {
  // AGENTS.md: every RLS-enabled public table carries the RESTRICTIVE policy
  // signed_in_must_be_staff. A permissive `using (true)` alone is not enough -
  // patients hold logins too, for the portal, and these tables hold the very
  // feedback a patient was looking at.
  it("the 10 Nov backups are staff-only, not merely signed-in-only", () => {
    const sql = readFileSync(FEEDBACK_CLEANUPS[1].file, "utf8");
    expect(sql).toContain("signed_in_must_be_staff");
    expect(sql).toMatch(/as restrictive[\s\S]{0,120}is_active_staff/);
  });
});
