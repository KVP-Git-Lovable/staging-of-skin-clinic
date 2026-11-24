import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { DEFAULT_FEEDBACK_THRESHOLDS, needsRootCause } from "./feedbackThresholds";
import { RCA_ROOT_CAUSES, RCA_STATUSES, RCA_CLOSED_STATUSES, NO_PATIENT_ID } from "./feedbackRca";

const MIGRATION = "supabase/migrations/20261106090000_a_low_score_that_someone_owns.sql";
/** Where the rule lives now: one settings row, read by the gate and the trigger. */
const THRESHOLD_MIGRATION = "supabase/migrations/20261117060000_how_low_is_low_enough.sql";
const sql = () => readFileSync(MIGRATION, "utf8");
const thresholdSql = () => readFileSync(THRESHOLD_MIGRATION, "utf8");
const read = (p: string) => readFileSync(p, "utf8");
/** Comments here explain these very rules; strip them or a test passes on its own prose. */
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/^\s*--.*$/gm, "");

describe("needsRootCause, at the numbers the clinic ships with", () => {
  const at = DEFAULT_FEEDBACK_THRESHOLDS;
  it("opens on a detractor score", () => {
    expect(needsRootCause({ nps_score: 6, service_rating: 5 }, at)).toBe(true);
    expect(needsRootCause({ nps_score: 0, service_rating: 5 }, at)).toBe(true);
  });

  it("opens on a low service rating, including a merely average 3", () => {
    // Wider than this app's own "Poor", which stops at 2. A 3 out of 5 is not
    // a happy patient and the clinic set the line here deliberately.
    expect(needsRootCause({ nps_score: 10, service_rating: 3 }, at)).toBe(true);
    expect(needsRootCause({ nps_score: 10, service_rating: 1 }, at)).toBe(true);
  });

  it("catches the contradictions the live data actually contains", () => {
    // Both of these are real rows: a patient happy to recommend who rated the
    // service 1, and one who rated the service 5 but would not recommend.
    // A rule on either score alone misses one of them.
    expect(needsRootCause({ nps_score: 8, service_rating: 1 }, at)).toBe(true);
    expect(needsRootCause({ nps_score: 1, service_rating: 5 }, at)).toBe(true);
  });

  it("leaves a happy visit alone", () => {
    expect(needsRootCause({ nps_score: 10, service_rating: 5 }, at)).toBe(false);
    expect(needsRootCause({ nps_score: 9, service_rating: 4 }, at)).toBe(false);
    // A passive is not a complaint.
    expect(needsRootCause({ nps_score: 7, service_rating: 4 }, at)).toBe(false);
    expect(needsRootCause({ nps_score: 8, service_rating: 4 }, at)).toBe(false);
  });

  it("treats a missing score as nothing to chase, never as a zero", () => {
    expect(needsRootCause({ nps_score: null, service_rating: null }, at)).toBe(false);
    expect(needsRootCause({}, at)).toBe(false);
    expect(needsRootCause(null, at)).toBe(false);
    expect(needsRootCause(undefined, at)).toBe(false);
    // One score missing must not hide a bad one.
    expect(needsRootCause({ nps_score: null, service_rating: 2 }, at)).toBe(true);
  });
});

describe("the database agrees with the client", () => {
  it("reads the rule from the settings row rather than hardcoding it", () => {
    // The case is opened by a trigger, not by a screen - a patient editing
    // their score down from the portal runs no client code at all. The numbers
    // used to be written into this function; now an admin owns them, and a
    // number reappearing here would quietly overrule the screen.
    const fn = code(thresholdSql()).match(/create or replace function public\.feedback_needs_root_cause[\s\S]*?\$fn\$;/)?.[0] ?? "";
    expect(fn, "feedback_needs_root_cause not found").not.toBe("");
    expect(fn).toContain("s.nps_at_or_below");
    expect(fn).toContain("s.rating_at_or_below");
    expect(fn).toContain("from public.feedback_settings s");
    expect(fn).not.toMatch(/<=\s*\d/);
  });

  it("is stable, not immutable, now that it reads a table", () => {
    // An immutable function is one Postgres may cache the answer of, which
    // would hand back yesterday's threshold after an admin changed it.
    const fn = code(thresholdSql()).match(/create or replace function public\.feedback_needs_root_cause[\s\S]*?\$fn\$;/)?.[0] ?? "";
    expect(fn).toMatch(/\bstable\b/);
    expect(fn).not.toMatch(/\bimmutable\b/);
  });

  it("ships the numbers the clinic already had, so applying it changes nothing", () => {
    const table = code(thresholdSql()).match(/create table if not exists public\.feedback_settings[\s\S]*?\);/)?.[0] ?? "";
    expect(table, "feedback_settings not found").not.toBe("");
    expect(table).toContain(`default ${DEFAULT_FEEDBACK_THRESHOLDS.npsAtOrBelow}`);
    expect(table).toContain(`default ${DEFAULT_FEEDBACK_THRESHOLDS.ratingAtOrBelow}`);
  });

  it("labels the case from the same two numbers it opened it with", () => {
    // The classifier used to repeat the thresholds, so editing one and not the
    // other would have opened cases carrying the wrong reason.
    const trigger = code(thresholdSql()).match(/create or replace function public\.open_feedback_rca[\s\S]*?\$fn\$;/)?.[0] ?? "";
    expect(trigger, "open_feedback_rca not found").not.toBe("");
    expect(trigger).toContain("_low_nps and _low_rating then 'both'");
    expect(trigger).toContain("when _low_nps then 'nps'");
    expect(trigger).not.toMatch(/new\.nps_score\s*<=\s*\d/);
    expect(trigger).not.toMatch(/new\.service_rating\s*<=\s*\d/);
  });

  it("still opens a case on an edit, and still never closes one", () => {
    const trigger = code(thresholdSql()).match(/create or replace function public\.open_feedback_rca[\s\S]*?\$fn\$;/)?.[0] ?? "";
    // One case per feedback row, ever.
    expect(trigger).toContain("exists (select 1 from public.feedback_rca where feedback_id = new.id)");
    expect(trigger).not.toMatch(/update public\.feedback_rca/);
    expect(trigger).not.toMatch(/delete from public\.feedback_rca/);
  });

  it("keeps the settings row staff-only, and admin-only to change", () => {
    const text = code(thresholdSql());
    expect(text).toContain("revoke all on public.feedback_settings from anon");
    // AGENTS.md: a new table gets the restrictive rule AND its own staff rule.
    expect(text).toMatch(/create policy signed_in_must_be_staff on public\.feedback_settings[\s\S]*?as restrictive/);
    expect(text).toMatch(/create policy feedback_settings_edit[\s\S]*?is_admin_user\(\)/);
    expect(text).not.toMatch(/feedback_settings[\s\S]{0,400}using \(true\)/);
  });

  it("accepts exactly the statuses the client offers", () => {
    const check = code(sql()).match(/status text not null default 'open'[\s\S]*?\)\)/)?.[0] ?? "";
    expect(check, "status CHECK not found").not.toBe("");
    for (const s of RCA_STATUSES) {
      expect(check, `status '${s.value}' would be rejected by the database`).toContain(`'${s.value}'`);
    }
    for (const s of RCA_CLOSED_STATUSES) {
      expect(RCA_STATUSES.map((x) => x.value)).toContain(s);
    }
  });

  it("accepts exactly the root causes the client offers", () => {
    // A value the dropdown offers that the database rejects is a save button
    // that silently does nothing.
    const check = code(sql()).match(/root_cause text[\s\S]*?\)\)/)?.[0] ?? "";
    expect(check, "root_cause CHECK not found").not.toBe("");
    for (const c of RCA_ROOT_CAUSES) {
      expect(check, `root cause '${c.value}' would be rejected by the database`).toContain(`'${c.value}'`);
    }
  });
});

describe("a case opens by itself, and never closes by itself", () => {
  it("fires on update as well as insert, so a portal edit opens one", () => {
    expect(code(sql())).toMatch(/after insert or update on public\.patient_feedback/);
  });

  it("never deletes or closes a case from the trigger", () => {
    const fn = code(sql()).match(/function public\.open_feedback_rca[\s\S]*?\$fn\$;/)?.[0] ?? "";
    expect(fn, "open_feedback_rca not found").not.toBe("");
    expect(fn).not.toMatch(/delete\s+from\s+public\.feedback_rca/i);
    expect(fn).not.toMatch(/update\s+public\.feedback_rca/i);
  });

  it("suppresses the notification storm during the backfill", () => {
    // 24 historic cases would otherwise deliver 24 alerts at once. Both halves
    // are checked and compared: the trigger reads a setting, the backfill sets
    // one, and asserting only that the name appears somewhere passes happily
    // while the two name different settings and every alert fires.
    const text = code(sql());
    const readBy = text.match(/current_setting\('([^']+)'/)?.[1] ?? "";
    const setBy = text.match(/set_config\('([^']+)'/)?.[1] ?? "";
    expect(readBy, "the trigger reads no setting").not.toBe("");
    expect(setBy, "the backfill sets no setting").not.toBe("");
    expect(readBy, "the trigger and the backfill name different settings").toBe(setBy);
  });

  it("backfills through the trigger rather than a second copy of the rule", () => {
    const backfill = code(sql()).match(/\$bf\$[\s\S]*?\$bf\$/)?.[0] ?? "";
    expect(backfill, "backfill block not found").not.toBe("");
    expect(backfill).toContain("feedback_needs_root_cause");
    expect(backfill, "backfill inserts cases directly, bypassing the trigger")
      .not.toMatch(/insert\s+into\s+public\.feedback_rca/i);
  });
});

describe("none of this can reach a patient", () => {
  it("revokes anon on both tables", () => {
    const text = code(sql());
    expect(text).toContain("revoke all on public.feedback_rca from anon");
    expect(text).toContain("revoke all on public.feedback_rca_comments from anon");
  });

  it("gates every read behind the admin/doctor predicate", () => {
    const text = code(sql());
    // Bounded to the single statement. An unbounded [\s\S]*? runs on to the
    // NEXT policy's predicate, so dropping the gate from the read policy
    // alone would still match - which is exactly what it did.
    for (const policy of ["feedback_rca_read", "feedback_rca_comments_read"]) {
      const stmt = text.match(new RegExp(`create policy ${policy}[^;]*;`))?.[0] ?? "";
      expect(stmt, `${policy} not found`).not.toBe("");
      expect(stmt, `${policy} does not call the gate`).toContain("can_manage_feedback_rca()");
    }
  });

  it("never lets the patient portal read a case", () => {
    // The portal is the one surface a patient can reach. These are staff
    // notes about that patient's complaint, sometimes naming a colleague.
    const portal = code(read("supabase/functions/portal-data/index.ts"));
    expect(portal, "portal-data mentions feedback_rca").not.toContain("feedback_rca");
  });

  it("keeps the discussion append-only, with no edit or delete for anyone", () => {
    const text = code(sql());
    expect(text).toContain("grant select, insert on public.feedback_rca_comments to authenticated");
    expect(text).not.toMatch(/create policy[^\n]*feedback_rca_comments[^\n]*for (update|delete)/i);
  });

  it("revokes what this database's default privileges hand out anyway", () => {
    // Caught on the live database, not in review: ALTER DEFAULT PRIVILEGES
    // gives `authenticated` DELETE and TRUNCATE on every new table, so a
    // GRANT naming only select/insert adds to that set instead of being it.
    // Without these two lines the table's stated append-only property was
    // false the moment it was created.
    const text = code(sql());
    expect(text).toContain("revoke update, delete, truncate, references, trigger on public.feedback_rca_comments from authenticated");
    expect(text).toContain("revoke delete, truncate, references, trigger on public.feedback_rca from authenticated");
  });
});

describe("the embeds that would break production", () => {
  it("registers feedback_rca as reaching staff more than once", () => {
    // assigned_to, resolved_by and created_by all point at staff, so a bare
    // staff(...) embed is refused by PostgREST outright - the same failure
    // the therapist_id column caused in the live clinic.
    expect(read("src/lib/ambiguousEmbeds.test.ts")).toMatch(/feedback_rca:\s*\["staff"\]/);
  });

  it("names the constraint on every staff embed from a case", () => {
    const hook = code(read("src/hooks/useFeedbackRca.ts"));
    expect(hook).toContain("staff!feedback_rca_assigned_to_fkey");
    expect(hook).not.toMatch(/[^!]staff\(/);
  });
});

describe("the patient roll-up", () => {
  it("never looks a patient up by the no-patient sentinel", () => {
    // patient_feedback.patient_id has no foreign key and the appointment
    // Feedback tab writes a zero uuid when a visit has no patient attached.
    expect(NO_PATIENT_ID).toBe("00000000-0000-0000-0000-000000000000");
    const hook = code(read("src/hooks/usePatientFeedback.ts"));
    expect(hook).toContain("NO_PATIENT_ID");
    expect(hook).toMatch(/patientId !== NO_PATIENT_ID/);
  });

  it("reuses the shared breakdown rather than averaging again", () => {
    // A second mean here is how the same patient reads 4.8 on one screen and
    // 4.84 on another.
    const component = code(read("src/components/patients/PatientFeedback.tsx"));
    expect(component).toContain("npsBreakdown");
    expect(component, "a hand-rolled average has appeared").not.toMatch(/reduce\(\(a, b\)/);
  });

  it("embeds the visit by column, because appointment_id is ambiguous too", () => {
    // patient_feedback.appointment_id resolves to both the appointments table
    // and the visits_needing_review view.
    const hook = code(read("src/hooks/usePatientFeedback.ts"));
    expect(hook).toContain("appointment:appointment_id(");
  });
});

describe("the patient's name opens their record", () => {
  const page = () => code(read("src/pages/FeedbackRcaDetail.tsx"));

  it("puts the name inside the link", () => {
    const source = page();
    expect(source).toContain("<Link to={patientHref}");
    // Inside the heading, not beside it.
    const heading = source.slice(source.indexOf("<h1"), source.indexOf("</h1>"));
    expect(heading).toContain("patientHref ? (");
    expect(heading).toContain("{patientName}");
  });

  it("drops the separate button that used to do this", () => {
    expect(page()).not.toContain("Open patient record");
  });

  it("leaves the warning icon outside the link", () => {
    // It marks the case, not the person; an icon that navigates to somebody's
    // record reads wrong.
    const source = page();
    const heading = source.slice(source.indexOf("<h1"), source.indexOf("</h1>"));
    expect(heading.indexOf("AlertTriangle")).toBeLessThan(heading.indexOf("<Link"));
  });

  it("does not link a case with no patient", () => {
    const source = page();
    expect(source).toContain("rca.patient_id && rca.patient_id !== NO_PATIENT_ID");
    expect(source).toMatch(/: null;/);
  });

  it("knows the zero uuid is not a patient", () => {
    // The Feedback tab writes it when a visit has no patient, and it would
    // link to a patient page that does not exist.
    expect(page()).toContain("NO_PATIENT_ID");
    expect(code(read("src/lib/feedbackRca.ts"))).toContain("00000000-0000-0000-0000-000000000000");
  });

  it("still reads as a heading rather than a link", () => {
    expect(page()).toContain('className="hover:underline underline-offset-4"');
  });
});
