import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { THERAPIST_FIELD_LABEL, therapistIdsOf, therapistNamesOf } from "./appointmentTherapist";
import { applyFilters, formatCell } from "./listViews/engine";
import { APPOINTMENT_VIEW_FIELDS } from "./listViews/appointmentFields";

/**
 * More than one person on an appointment.
 *
 * An appointment recorded one therapist, and in 57,969 appointments the field
 * had never once been filled in - nurses do most of the assisting and they
 * were not on the list, and more than one person assists a procedure anyway.
 * So the picker now offers therapists and nurses and takes as many as you
 * like.
 *
 * The thing these tests exist to protect is not the picker. It is the pair of
 * columns underneath it. `therapist_ids` holds everyone; `therapist_id` holds
 * the first of them and is the ONLY therapist column the published build at
 * clinic.quickapp.ai knows about. A screen that writes one without the other
 * splits the appointment in two - the list naming one person and the
 * appointment holding a different set - and nothing on screen would say so.
 */

const MIGRATION = "supabase/migrations/20261112070000_more_than_one_pair_of_hands.sql";
const sql = () => readFileSync(MIGRATION, "utf8").replace(/^\s*--.*$/gm, "");

const SHEET = "src/components/appointments/AppointmentDetailSheet.tsx";
const QUICK = "src/components/appointments/QuickAppointmentDialog.tsx";
const PAGE = "src/pages/Appointments.tsx";
/** The three screens that write a therapist onto an appointment. */
const WRITERS = [SHEET, QUICK, PAGE];

const code = (f: string) => readFileSync(f, "utf8").replace(/^\s*\/\/.*$/gm, "");

describe("therapistIdsOf", () => {
  it("reads the list when there is one", () => {
    expect(therapistIdsOf({ therapist_ids: ["a", "b"], therapist_id: "a" })).toEqual(["a", "b"]);
  });

  it("falls back to the single column, which is all the published build writes", () => {
    // An appointment saved on clinic.quickapp.ai sets therapist_id and leaves
    // therapist_ids at its '{}' default. That appointment has to open here
    // showing the person it was given, not nobody.
    expect(therapistIdsOf({ therapist_ids: [], therapist_id: "a" })).toEqual(["a"]);
    expect(therapistIdsOf({ therapist_id: "a" })).toEqual(["a"]);
  });

  it("prefers the list over the single column when they disagree", () => {
    expect(therapistIdsOf({ therapist_ids: ["b", "c"], therapist_id: "a" })).toEqual(["b", "c"]);
  });

  it("returns nobody rather than a list containing nothing", () => {
    expect(therapistIdsOf({ therapist_ids: [], therapist_id: null })).toEqual([]);
    expect(therapistIdsOf({})).toEqual([]);
    expect(therapistIdsOf(null)).toEqual([]);
    expect(therapistIdsOf(undefined)).toEqual([]);
    expect(therapistIdsOf({ therapist_id: "   " })).toEqual([]);
  });

  it("drops blanks out of the list instead of passing them on", () => {
    // A null in the array would reach StaffMultiCombobox as a selected id
    // that matches nobody, and the badge row would come up one short with no
    // way to clear the missing one.
    expect(therapistIdsOf({ therapist_ids: ["a", "", "b"] as string[] })).toEqual(["a", "b"]);
  });
});

describe("therapistNamesOf", () => {
  const names = { a: "Reena .", b: "Rita .", c: "Akash  Macwan" };

  it("names everyone, in the order they were chosen", () => {
    expect(therapistNamesOf(["b", "a"], names)).toBe("Rita ., Reena .");
  });

  it("names one person without punctuation around them", () => {
    expect(therapistNamesOf(["c"], names)).toBe("Akash  Macwan");
  });

  it("falls back to the stored name when the lookup knows nobody", () => {
    // therapist_name survives the staff record being deleted outright, so it
    // is the last thing standing between an old appointment and a blank.
    expect(therapistNamesOf(["gone"], {}, "Suchitra .")).toBe("Suchitra .");
    expect(therapistNamesOf([], {}, "Suchitra .")).toBe("Suchitra .");
  });

  it("shows whoever it can resolve rather than giving up on all of them", () => {
    expect(therapistNamesOf(["a", "gone"], names, "Ignored")).toBe("Reena .");
  });

  it("is empty when there is nobody and nothing stored", () => {
    expect(therapistNamesOf([], {})).toBe("");
    expect(therapistNamesOf([], {}, "   ")).toBe("");
    expect(therapistNamesOf(["gone"], {}, null)).toBe("");
  });
});

describe("the two columns are never written apart", () => {
  it("pairs every database write of therapist_id with therapist_ids", () => {
    // The invariant the published build depends on. Checked positionally
    // rather than by counting, so moving a write cannot hide a missing half.
    for (const file of WRITERS) {
      const src = code(file);
      const writes = [...src.matchAll(/\btherapist_id\s*[:=]/g)];
      expect(writes.length, `${file} no longer writes therapist_id at all`).toBeGreaterThan(0);
      for (const w of writes) {
        const near = src.slice(Math.max(0, w.index! - 180), w.index! + 180);
        expect(near, `${file}: a therapist_id write near index ${w.index} has no therapist_ids beside it`)
          .toContain("therapist_ids");
      }
    }
  });

  it("always puts the first of the list into the single column", () => {
    // Not an arbitrary one: the published build shows therapist_id as THE
    // therapist, so it has to be the one at the top of the badges.
    expect(code(SHEET)).toContain("therapist_id: editTherapistIds[0] || null,");
    expect(code(QUICK)).toContain("therapist_id: therapistIds[0] || null,");
    expect(code(PAGE)).toContain("therapist_id: therapistIds[0] || null,");
    expect(code(PAGE)).toContain("updates.therapist_id = editValues.therapist_ids[0] || null;");
  });
});

describe("the pickers", () => {
  it("take more than one person, on every screen that assigns them", () => {
    for (const file of WRITERS) {
      expect(code(file), `${file} still uses the single-select picker`)
        .toContain("<StaffMultiCombobox");
    }
  });

  it("leaves no single-select therapist picker behind", () => {
    // A row edited through a leftover single picker would drop everyone but
    // one, silently.
    for (const file of WRITERS) {
      const src = code(file);
      const singles = [...src.matchAll(/<StaffCombobox[\s\S]{0,400}?\/>/g)];
      for (const s of singles) {
        expect(s[0], `${file} has a single-select picker filtered to therapists`)
          .not.toContain("THERAPIST_ROLES");
      }
    }
  });

  it("says Therapist / Nurse on all four of them", () => {
    expect(THERAPIST_FIELD_LABEL).toBe("Therapist / Nurse");
    for (const file of WRITERS) {
      expect(code(file), `${file} hardcodes its own label`).toContain("THERAPIST_FIELD_LABEL");
    }
    // Two on the Appointments page: the booking form and the inline row edit.
    expect(code(PAGE).match(/THERAPIST_FIELD_LABEL/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it("clears the people when the quick dialog closes", () => {
    // They used to stick: the next walk-in opened with the last one's
    // therapist already filled in. A whole list carrying over is worse.
    expect(code(QUICK)).toContain("setTherapistIds([])");
  });
});

describe("the Notes tab names everyone", () => {
  it("shows the resolved names, not just the stored first one", () => {
    const src = code(SHEET);
    expect(src).toContain("assignedTherapistNames");
    expect(src).toMatch(/\{THERAPIST_FIELD_LABEL\}: <span/);
  });

  it("prefills the note title with all of them", () => {
    expect(code(SHEET)).toContain("therapistNoteTitle(assignedTherapistNames)");
  });

  it("looks the names up by id, so a deactivated nurse does not vanish", () => {
    // The picker lists active staff of the right role only. Reading names out
    // of that list would blank somebody who has since been deactivated or had
    // their role changed - on an appointment they really did work.
    expect(code(SHEET)).toContain("useStaffNames(assignedTherapistIds)");
    // Checked against the code, with both kinds of comment stripped: the
    // hook's own doc comment explains why it does NOT filter by is_active,
    // and a plain search would find that sentence and call it a filter.
    const hook = readFileSync("src/lib/staffNames.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(hook).toContain('.in("id", clean)');
    expect(hook, "the lookup must not filter by is_active").not.toContain("is_active");
  });
});

describe("the migration keeps the published build working", () => {
  it("adds the column with a default, so existing rows are never null", () => {
    const src = sql();
    expect(src).toMatch(/add column if not exists therapist_ids uuid\[\] not null default '\{\}'::uuid\[\]/);
  });

  it("leaves the column the published build reads exactly where it is", () => {
    // AGENTS.md: no renamed or dropped column. clinic.quickapp.ai reads
    // therapist_id and would break the instant it moved.
    const src = sql();
    expect(src).not.toMatch(/drop column/i);
    expect(src).not.toMatch(/rename/i);
    expect(src).not.toMatch(/alter column/i);
  });

  it("adds no second route from appointments to staff", () => {
    // AGENTS.md: a migration that adds another foreign key between two tables
    // has to register the pair in AMBIGUOUS_EMBEDS. This adds none, so there
    // is nothing to register - and this test is what keeps that true.
    const src = sql();
    expect(src).not.toMatch(/references/i);
    expect(src).not.toMatch(/foreign key/i);
    const embeds = readFileSync("src/lib/ambiguousEmbeds.test.ts", "utf8");
    expect(embeds).toContain("appointments");
  });

  it("carries existing therapists across without touching a chosen list", () => {
    const src = sql();
    expect(src).toMatch(/set therapist_ids = array\[therapist_id\]/);
    expect(src).toMatch(/where therapist_id is not null/);
    // The guard that makes it re-runnable: a row somebody has since given a
    // list of people must not be flattened back to one.
    expect(src).toMatch(/coalesce\(array_length\(therapist_ids, 1\), 0\) = 0/);
  });

  it("clears the stored name when the last person is removed", () => {
    // It only ever set the name before, never cleared it, so unassigning left
    // the old therapist showing in the list and the reports.
    const src = sql();
    expect(src).toMatch(/if new\.therapist_id is null then\s*\n\s*new\.therapist_name := null;/);
    expect(src).toContain("create or replace function public.set_appointment_therapist_name()");
  });
});

describe("filtering by therapist finds everyone who was on the visit", () => {
  // Rows exactly as Appointments.tsx's toRow builds them: `therapist` is the
  // first person, `therapist_ids` is everybody.
  const led = { therapist: "reena", therapist_ids: ["reena", "akash"] };
  const assisted = { therapist: "rita", therapist_ids: ["rita", "reena"] };
  const neither = { therapist: "rita", therapist_ids: ["rita"] };
  const nobody = { therapist: "", therapist_ids: [] };
  const rows = [led, assisted, neither, nobody];

  const where = (c: Record<string, unknown>) =>
    applyFilters(rows, { match: "all", conditions: [c] } as never, APPOINTMENT_VIEW_FIELDS);

  it("finds the visit she assisted on second, not only the ones she led", () => {
    // The whole point. Before this, "therapist equals Reena" returned one row.
    expect(where({ field: "therapist", operator: "equals", value: "reena" })).toEqual([led, assisted]);
  });

  it("matches any of several chosen people", () => {
    expect(where({ field: "therapist", operator: "in", value: "akash,rita" }))
      .toEqual([led, assisted, neither]);
  });

  it("excludes a visit she was on even when somebody else was too", () => {
    // A negative that only checked the first person would hand back the visit
    // she assisted on, under a filter that says she was not there.
    expect(where({ field: "therapist", operator: "not_equals", value: "reena" }))
      .toEqual([neither, nobody]);
  });

  it("knows an appointment with nobody on it", () => {
    expect(where({ field: "therapist", operator: "is_empty" })).toEqual([nobody]);
    expect(where({ field: "therapist", operator: "is_not_empty" })).toEqual([led, assisted, neither]);
  });

  it("still filters an appointment the published build saved", () => {
    // therapist_ids comes back '{}' from clinic.quickapp.ai; toRow fills it
    // from therapist_id through therapistIdsOf, so the row reaching the
    // filter always has the list.
    const fromPublished = { therapist_ids: therapistIdsOf({ therapist_id: "reena", therapist_ids: [] }) };
    expect(fromPublished.therapist_ids).toEqual(["reena"]);
    expect(applyFilters([fromPublished], { match: "all", conditions: [
      { field: "therapist", operator: "equals", value: "reena" },
    ] } as never, APPOINTMENT_VIEW_FIELDS)).toEqual([fromPublished]);
  });

  it("leaves every other field matching one value, as before", () => {
    // Only therapist carries multiKey. A doctor is one person and a filter on
    // them must not start looking at a list.
    const defs = APPOINTMENT_VIEW_FIELDS.filter((f) => f.multiKey);
    expect(defs.map((f) => f.key)).toEqual(["therapist"]);
    const docs = [{ doctor: "vindhya" }, { doctor: "punya" }];
    expect(applyFilters(docs, { match: "all", conditions: [
      { field: "doctor", operator: "equals", value: "vindhya" },
    ] } as never, APPOINTMENT_VIEW_FIELDS)).toEqual([{ doctor: "vindhya" }]);
  });

  it("leaves the column itself showing the first person", () => {
    // The clinic asked for the list column and their saved views to stay as
    // they were, so the cell reads `therapist`, never the list.
    expect(formatCell(led, "therapist", APPOINTMENT_VIEW_FIELDS)).toBe("reena");
    expect(formatCell(nobody, "therapist", APPOINTMENT_VIEW_FIELDS)).toBe("—");
  });

  it("carries the list onto the row the list view filters", () => {
    // Positional, not a plain search: the inline row editor sets an
    // identically-spelled therapist_ids elsewhere in the same file, so a
    // search would go on passing with the row builder's half deleted.
    const src = code(PAGE);
    const builder = src.indexOf('therapist: apt.therapist_id || "",');
    expect(builder, "the list row no longer carries a therapist").toBeGreaterThan(-1);
    expect(
      src.slice(builder, builder + 160),
      "the row the filter reads has no therapist_ids beside its therapist",
    ).toContain("therapist_ids: therapistIdsOf(apt)");
  });
});
