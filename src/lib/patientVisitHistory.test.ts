import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canOpenVisit, showsBilledState, visitNotes, visitRows, visitStaffName, type VisitRow,
} from "./patientVisitHistory";

/**
 * The visits before this one.
 *
 * What has to keep holding: a therapist sees the patient's history, she
 * cannot walk from it to a patient she has nothing to do with, and no
 * billing state reaches a role whose billing is switched off.
 */

const row = (over: Partial<VisitRow> = {}): VisitRow => ({
  id: over.id ?? "v1", start_time: "2026-11-01T06:00:00Z", end_time: null,
  status: "Completed", visit_status: null, service: "Laser", appointment_type: null,
  consultation_type: null, consultation_reasons: null, reason_for_consultation: null,
  source: null, doctor_name: null, therapist_name: null,
  staff_first_name: "Punya", staff_last_name: "Suvarna", can_open: false, ...over,
});

describe("reading the history back", () => {
  it("drops a malformed row rather than the whole history", () => {
    // A clinician is standing in front of this screen. One bad row must not
    // blank a patient's past.
    expect(visitRows([row({ id: "a" }), null, { nope: 1 }, row({ id: "b" })]).map((v) => v.id))
      .toEqual(["a", "b"]);
  });

  it("gives nothing for a non-list", () => {
    for (const v of [null, undefined, {}, "x"]) expect(visitRows(v)).toEqual([]);
    for (const v of [null, undefined, {}, "x"]) expect(visitNotes(v)).toEqual([]);
  });

  it("keeps the order the database sent", () => {
    // The function orders newest first; re-sorting here would fight it.
    const list = visitRows([row({ id: "newer" }), row({ id: "older" })]);
    expect(list.map((v) => v.id)).toEqual(["newer", "older"]);
  });

  it("reads a note even when it has no title", () => {
    const notes = visitNotes([
      { id: "n1", title: null, content: "Patch test negative", created_at: "2026-11-01T06:00:00Z",
        author_first_name: "Reena", author_last_name: null },
    ]);
    expect(notes).toHaveLength(1);
    expect(notes[0].content).toBe("Patch test negative");
  });
});

describe("whether a row opens", () => {
  it("navigates only when the full sheet would actually load", () => {
    // maybeSingle() returns null for a row the policy hides, so a row opened
    // without this check would render a blank page.
    expect(canOpenVisit(row({ can_open: true }))).toBe(true);
    expect(canOpenVisit(row({ can_open: false }))).toBe(false);
  });

  it("treats a missing flag as not openable", () => {
    const [parsed] = visitRows([{ ...row(), can_open: undefined }]);
    expect(canOpenVisit(parsed)).toBe(false);
  });
});

describe("who did the visit", () => {
  it("prefers the staff row", () => {
    expect(visitStaffName(row())).toBe("Punya Suvarna");
  });

  it("falls back to the recorded name when there is no staff row", () => {
    // Imported visits carry the name as text and no staff link.
    expect(visitStaffName(row({ staff_first_name: null, staff_last_name: null, doctor_name: "Dr Shetty" })))
      .toBe("Dr Shetty");
    expect(visitStaffName(row({ staff_first_name: null, staff_last_name: null, therapist_name: "Reena" })))
      .toBe("Reena");
  });

  it("gives an empty string rather than 'null null'", () => {
    expect(visitStaffName(row({ staff_first_name: null, staff_last_name: null }))).toBe("");
  });
});

describe("billing stays out of it", () => {
  it("withholds that a visit was billed from a role that may not see billing", () => {
    // The clinic's instruction: no billing data for these roles. Whether a
    // visit was billed is billing data.
    expect(showsBilledState({ canSeeBilling: false, billed: true })).toBe(false);
  });

  it("changes nothing for a role that may see billing", () => {
    expect(showsBilledState({ canSeeBilling: true, billed: true })).toBe(true);
    expect(showsBilledState({ canSeeBilling: true, billed: false })).toBe(false);
  });
});

describe("what the database promises", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  const MIGRATION = "supabase/migrations/20261117150000_the_visits_before_this_one.sql";

  it("re-checks the anchor against the policy's own four branches", () => {
    // This is the entire guard. Lose a branch and it either locks out people
    // who should see the history, or lets somebody walk into a patient they
    // have nothing to do with.
    const sql = read(MIGRATION);
    const anchorGuard = sql.slice(sql.indexOf("where anchor.id = p_appointment_id"));
    for (const branch of [
      "public.sees_all_appointments()",
      "anchor.staff_id = public.current_staff_id()",
      "anchor.therapist_id = public.current_staff_id()",
      "public.current_staff_id() = any(anchor.therapist_ids)",
    ]) {
      expect(anchorGuard).toContain(branch);
    }
  });

  it("asks for an active staff account as well", () => {
    expect(read(MIGRATION)).toContain("public.is_active_staff()");
  });

  it("gates the notes through the history, not a second copy of the rule", () => {
    // Two copies of a security predicate drift. One does not.
    const sql = read(MIGRATION);
    const notesFn = sql.slice(sql.indexOf("function public.patient_visit_notes"));
    expect(notesFn).toContain("from public.patient_visit_history(p_appointment_id) h");
    expect(notesFn).toContain("where h.id = p_visit_id");
  });

  it("runs as definer with search_path pinned", () => {
    // Definer is the point - it steps past the policy - so the path it
    // resolves names on must not be the caller's to choose.
    const sql = read(MIGRATION);
    expect(sql.match(/security definer/g) ?? []).toHaveLength(2);
    expect(sql.match(/set search_path to 'public'/g) ?? []).toHaveLength(2);
    expect(sql.match(/^stable$/gm) ?? []).toHaveLength(2);
  });

  it("is reachable by a signed-in account and nobody else", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("revoke all on function public.patient_visit_history(uuid) from public, anon");
    expect(sql).toContain("revoke all on function public.patient_visit_notes(uuid, uuid) from public, anon");
    expect(sql).toContain("grant execute on function public.patient_visit_history(uuid) to authenticated, service_role");
  });

  it("never reaches the money", () => {
    // appointments has no amount columns; invoices is where they live, and
    // neither function body goes near it. Checked against the bodies rather
    // than the file, so the prose explaining this cannot satisfy the test.
    const sql = read(MIGRATION);
    const bodies = sql.match(/\$fn\$([\s\S]*?)\$fn\$/g) ?? [];
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(body).not.toMatch(/\binvoices\b/i);
      expect(body).not.toMatch(/\b(amount|total_amount|paid|balance|discount)\b/i);
    }
  });

  it("excludes the visit being looked at, so the screen does not filter", () => {
    expect(read(MIGRATION)).toContain("a.id <> anchor.id");
  });

  it("changes no table, column or policy, so the published build keeps working", () => {
    // AGENTS.md: a schema change must keep clinic.quickapp.ai working with no
    // deploy. Two new functions do; an altered policy would not.
    const sql = read(MIGRATION).replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/alter table/i);
    expect(sql).not.toMatch(/create policy|drop policy/i);
    expect(sql).not.toMatch(/drop column|rename/i);
  });
});

describe("the tab", () => {
  const sheet = () => readFileSync("src/components/appointments/AppointmentDetailSheet.tsx", "utf8");

  it("asks the function, not the table", () => {
    // Reading the table directly is what returned nothing for a therapist.
    const source = sheet();
    expect(source).toContain('supabase.rpc("patient_visit_history"');
    expect(source).not.toContain('.select("*, staff:staff!appointments_staff_id_fkey(first_name, last_name)")');
  });

  it("opens the read-only sheet for a visit it cannot open properly", () => {
    const source = sheet();
    expect(source).toContain("if (canOpenVisit(apt)) navigate(`/appointments/${apt.id}`);");
    expect(source).toContain("else setPastVisit(apt);");
  });

  it("puts the Billed badge behind the billing permission", () => {
    // Both the colour and the label read the billed state, so checking that
    // the guard appears is not enough - either one left bare leaks it.
    const badge = sheet().split("\n").find((l) => l.includes("appointmentStatusLabel(apt.status")) ?? "";
    expect(badge).toContain("showsBilledState");
    const unguarded = badge
      .split("showsBilledState({ canSeeBilling, billed: billsByAppointment.has(apt.id) })")
      .join("");
    expect(unguarded).not.toContain("billsByAppointment");
  });

  it("leaves the Appointments list page alone", () => {
    // The 20261113 scoping of that page is what the clinic asked for; this
    // change is one tab, not a widening.
    const list = readFileSync("src/pages/Appointments.tsx", "utf8");
    expect(list).not.toContain("patient_visit_history");
  });
});
