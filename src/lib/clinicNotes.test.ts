import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cleanNoteBody,
  deletedNotes,
  liveNotes,
  noteBodyIsEmpty,
  noteMatchesSearch,
  noteSearchSummary,
  noteStamp,
  noteSummary,
  noteWasEdited,
} from "@/lib/clinicNotes";

/**
 * The clinic's shared notebook.
 *
 * It replaces the paper book on the front desk, where everything was written
 * and nothing could be found again. The search box is the point of it.
 */

const code = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const sql = () =>
  readFileSync("supabase/migrations/20261123120000_a_shared_notebook_for_the_clinic.sql", "utf8")
    .replace(/^\s*--.*$/gm, "");

const PANEL = "src/components/layout/ClinicNotes.tsx";

describe("what counts as a note", () => {
  it("trims the ends", () => {
    expect(cleanNoteBody("  Dr Vindhya on leave Thursday \n")).toBe("Dr Vindhya on leave Thursday");
  });

  it("keeps the line breaks inside, because that is how it was jotted", () => {
    expect(cleanNoteBody("Order:\n  gloves\n  gauze")).toBe("Order:\n  gloves\n  gauze");
  });

  it("refuses a blank line in the book", () => {
    expect(noteBodyIsEmpty("   \n\t ")).toBe(true);
    expect(noteBodyIsEmpty("")).toBe(true);
    expect(noteBodyIsEmpty("x")).toBe(false);
  });
});

describe("the date on every line", () => {
  // Mangalore time. 10:42 UTC is 16:12 IST.
  const NOW = "2026-11-23T12:00:00Z";

  it("names today rather than dating it", () => {
    expect(noteStamp("2026-11-23T10:42:00Z", NOW)).toBe("Today, 4:12 pm");
  });

  it("names yesterday too", () => {
    expect(noteStamp("2026-11-22T10:42:00Z", NOW)).toBe("Yesterday, 4:12 pm");
  });

  it("dates anything older", () => {
    expect(noteStamp("2026-11-20T10:42:00Z", NOW)).toBe("20 Nov 2026, 4:12 pm");
  });

  it("uses the clinic's day, not UTC's", () => {
    // 18:35 UTC on the 22nd is already five past midnight on the 23rd in
    // Mangalore. Reading this in UTC would file it under yesterday.
    expect(noteStamp("2026-11-22T18:35:00Z", NOW)).toBe("Today, 12:05 am");
  });

  it("reads midday and midnight the way a person does", () => {
    expect(noteStamp("2026-11-23T07:00:00Z", NOW)).toBe("Today, 12:30 pm");
    expect(noteStamp("2026-11-19T18:30:00Z", NOW)).toBe("20 Nov 2026, 12:00 am");
  });

  it("says nothing rather than Invalid Date", () => {
    expect(noteStamp(null, NOW)).toBe("—");
    expect(noteStamp("not a date", NOW)).toBe("—");
  });

  it("crosses the year without inventing a month", () => {
    expect(noteStamp("2025-12-31T10:00:00Z", "2026-01-02T10:00:00Z")).toBe("31 Dec 2025, 3:30 pm");
  });
});

describe("whether it was changed afterwards", () => {
  it("does not call a brand new note edited", () => {
    // updated_at is set by a trigger and starts equal to created_at, so
    // "they differ" would mark every note edited the moment it was saved.
    const at = "2026-11-23T10:42:00.000Z";
    expect(noteWasEdited({ created_at: at, updated_at: at })).toBe(false);
    expect(noteWasEdited({ created_at: at, updated_at: "2026-11-23T10:42:00.400Z" })).toBe(false);
  });

  it("says so once it really was", () => {
    expect(noteWasEdited({
      created_at: "2026-11-23T10:42:00Z",
      updated_at: "2026-11-23T11:05:00Z",
    })).toBe(true);
  });
});

describe("finding it again, which the book could not do", () => {
  const note = { body: "Radha Medicals delivery pending", created_by_name: "Akash" };

  it("matches a word in the middle", () => {
    expect(noteMatchesSearch(note, "delivery")).toBe(true);
  });

  it("matches words in any order, which a plain search would not", () => {
    // Somebody looking for this types "radha pending". As one substring that
    // finds nothing at all.
    expect(noteMatchesSearch(note, "radha pending")).toBe(true);
    expect(noteMatchesSearch(note, "pending radha")).toBe(true);
  });

  it("needs every word, not just one", () => {
    expect(noteMatchesSearch(note, "radha gloves")).toBe(false);
  });

  it("ignores the case and stray spaces", () => {
    expect(noteMatchesSearch(note, "  RADHA   Pending ")).toBe(true);
  });

  it("finds what a person wrote by their name", () => {
    expect(noteMatchesSearch(note, "akash")).toBe(true);
  });

  it("shows everything when the box is empty", () => {
    expect(noteMatchesSearch(note, "")).toBe(true);
    expect(noteMatchesSearch(note, "   ")).toBe(true);
  });

  it("survives a note with no author recorded", () => {
    expect(noteMatchesSearch({ body: "stock check", created_by_name: null }, "stock")).toBe(true);
  });

  it("says what it found", () => {
    expect(noteSearchSummary(0, "x")).toBe("No notes match that");
    expect(noteSearchSummary(1, "x")).toBe("1 note");
    expect(noteSearchSummary(4, "x")).toBe("4 notes");
    expect(noteSearchSummary(4, "  ")).toBe("");
  });
});

describe("in the book and out of it", () => {
  const rows = [
    { id: "a", deleted_at: null },
    { id: "b", deleted_at: "2026-11-22T10:00:00Z" },
    { id: "c", deleted_at: null },
  ];

  it("shows the live ones", () => {
    expect(liveNotes(rows).map((n) => n.id)).toEqual(["a", "c"]);
  });

  it("keeps the deleted ones to hand", () => {
    expect(deletedNotes(rows).map((n) => n.id)).toEqual(["b"]);
  });
});

describe("the one line shown for a deleted note", () => {
  it("takes the first line that has something on it", () => {
    expect(noteSummary("\n\n  Order gloves\nand gauze")).toBe("Order gloves");
  });

  it("cuts on a word rather than through one", () => {
    expect(noteSummary("Radha Medicals delivery pending since Monday morning", 30))
      .toBe("Radha Medicals delivery…");
  });

  it("leaves a short note alone", () => {
    expect(noteSummary("Order gloves", 30)).toBe("Order gloves");
  });

  it("survives an empty body", () => {
    expect(noteSummary("")).toBe("");
  });
});

describe("the database cannot destroy a note", () => {
  it("has no delete policy at all", () => {
    // Soft delete only: the app sets deleted_at. With no delete policy there
    // is no path from the app that can take the row away - not a mistake,
    // not a bug, not a crafted request.
    const s = sql();
    expect(s).not.toMatch(/create policy[^;]*for delete/i);
    expect(s).toMatch(/drop policy if exists "Authenticated staff can delete clinic_notes"/);
  });

  it("is staff-only, with the restrictive gate every other table carries", () => {
    const s = sql();
    expect(s).toMatch(/as restrictive for all to authenticated/i);
    expect(s).toContain("signed_in_must_be_staff");
  });

  it("asks is_active_staff in its own policies rather than USING (true)", () => {
    const s = sql();
    expect(s).not.toMatch(/using\s*\(\s*true\s*\)/i);
    // Every gate in the file is that call and nothing else: the restrictive
    // policy's two, and one each on read, insert and update's two.
    const gates = (s.match(/\b(using|with check)\s*\(/gi) ?? []).length;
    expect(gates).toBe(6);
    expect((s.match(/\(select public\.is_active_staff\(\)\)/g) ?? []).length).toBe(gates);
  });

  it("grants the anon visitor nothing", () => {
    expect(sql()).not.toMatch(/to anon/i);
  });

  it("adds a table and changes nothing that exists", () => {
    // The published build must keep working untouched; it simply never reads
    // this table.
    const s = sql();
    expect(s).toMatch(/create table if not exists public\.clinic_notes/);
    expect(s).not.toMatch(/alter table(?!\s+public\.clinic_notes)/i);
    expect(s).not.toMatch(/drop (table|column)/i);
  });
});

describe("the panel deletes by marking, never by removing", () => {
  it("never calls delete on the table", () => {
    const source = code(PANEL);
    expect(source).not.toMatch(/\.delete\(/);
  });

  it("sets deleted_at instead, and clears it to restore", () => {
    const source = code(PANEL);
    expect(source).toContain("deleted_at: new Date().toISOString()");
    expect(source).toContain("deleted_at: null");
  });

  it("records who wrote it, so the note is worth reading later", () => {
    const source = code(PANEL);
    expect(source).toContain("created_by_name: authorName");
  });
});
