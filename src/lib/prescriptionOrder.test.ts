import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  comparePrescriptions,
  inPrescriptionOrder,
  withSortOrder,
} from "@/lib/prescriptionOrder";

/**
 * The order a prescription's products were typed in.
 *
 * Dr Vindhya typed Triclenz, then Triflow Shampoo, and the preview showed
 * Deriva CMS first. Every product of one save shares a created_at - now() is
 * fixed for the statement - and id is a random uuid, so until sort_order
 * existed nothing recorded the order and the readers could only guess.
 */

const code = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const DETAIL = "src/components/procedures/ProcedureDetailSheet.tsx";
const APPT = "src/components/appointments/AppointmentDetailSheet.tsx";
const PDF = "supabase/functions/generate-prescription-pdf/index.ts";
const FORM = "src/components/procedures/ProcedureFormDialog.tsx";
const SCAN = "src/components/procedures/ScanProcedureDialog.tsx";

describe("stamping the position", () => {
  it("numbers from zero, in the order given", () => {
    const typed = [{ medicine_name: "Triclenz" }, { medicine_name: "Triflow Shampoo" }];
    expect(withSortOrder(typed)).toEqual([
      { medicine_name: "Triclenz", sort_order: 0 },
      { medicine_name: "Triflow Shampoo", sort_order: 1 },
    ]);
  });

  it("keeps every other field untouched", () => {
    const [only] = withSortOrder([{ medicine_name: "Deriva CMS", quantity: 2, dosage: "BD" }]);
    expect(only).toEqual({ medicine_name: "Deriva CMS", quantity: 2, dosage: "BD", sort_order: 0 });
  });

  it("leaves no gap when a row was removed before numbering", () => {
    // The deleted row must be filtered out FIRST. Numbering the full list and
    // dropping one afterwards leaves 0, 2 and shifts everything under it.
    const list = [
      { medicine_name: "A", _deleted: false },
      { medicine_name: "B", _deleted: true },
      { medicine_name: "C", _deleted: false },
    ];
    const kept = withSortOrder(list.filter((r) => !r._deleted));
    expect(kept.map((r) => [r.medicine_name, r.sort_order])).toEqual([
      ["A", 0],
      ["C", 1],
    ]);
  });

  it("gives a row moved up its new place, not its old one", () => {
    // The editor case: an existing saved row dragged above another.
    const moved = [{ id: "second" }, { id: "first" }];
    expect(withSortOrder(moved)).toEqual([
      { id: "second", sort_order: 0 },
      { id: "first", sort_order: 1 },
    ]);
  });

  it("numbers saved and unsaved rows on one scale", () => {
    // Numbering each group separately would give two rows sort_order 0.
    const mixed = withSortOrder([{ id: "saved" }, {}, { id: "also-saved" }]);
    expect(mixed.map((r) => r.sort_order)).toEqual([0, 1, 2]);
  });
});

describe("reading them back", () => {
  const row = (over: Record<string, unknown>) =>
    ({ sort_order: null, created_at: "2026-11-20T11:51:49.025Z", id: "x", ...over }) as never;

  it("puts a numbered row before one that was never numbered", () => {
    // Everything saved before the column existed has null, and must not
    // jump ahead of what the clinician has since put in order.
    expect(comparePrescriptions(row({ sort_order: 5 }), row({ sort_order: null }))).toBeLessThan(0);
    expect(comparePrescriptions(row({ sort_order: null }), row({ sort_order: 5 }))).toBeGreaterThan(0);
  });

  it("orders numbered rows by their number", () => {
    const ordered = inPrescriptionOrder([
      row({ sort_order: 2, id: "c" }),
      row({ sort_order: 0, id: "a" }),
      row({ sort_order: 1, id: "b" }),
    ]);
    expect(ordered.map((r: { id: string }) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("falls back to created_at, then to id", () => {
    // The old-prescription case: nine rows, one created_at between them.
    const ordered = inPrescriptionOrder([
      row({ id: "ff66bf30" }),
      row({ id: "1134ac48" }),
      row({ id: "5b0a4919" }),
    ]);
    expect(ordered.map((r: { id: string }) => r.id)).toEqual(["1134ac48", "5b0a4919", "ff66bf30"]);
  });

  it("separates one save from another by created_at", () => {
    // Two different saves, neither numbered. created_at is the only thing
    // that can tell them apart, and it must beat the id tiebreak.
    const older = row({ created_at: "2026-11-01T10:00:00.000Z", id: "zzz" });
    const newer = row({ created_at: "2026-11-20T10:00:00.000Z", id: "aaa" });
    expect(inPrescriptionOrder([newer, older]).map((r: { id: string }) => r.id)).toEqual(["zzz", "aaa"]);
  });

  it("gives the same answer every time, which is what was missing", () => {
    // Without the id tiebreak an older prescription reshuffles between one
    // viewing and the next.
    const rows = [row({ id: "b" }), row({ id: "a" }), row({ id: "c" })];
    expect(inPrescriptionOrder(rows)).toEqual(inPrescriptionOrder([...rows].reverse()));
  });

  it("does not disturb the list it was given", () => {
    const rows = [row({ sort_order: 1, id: "b" }), row({ sort_order: 0, id: "a" })];
    inPrescriptionOrder(rows);
    expect((rows[0] as { id: string }).id).toBe("b");
  });
});

describe("every place that reads a prescription asks for that order", () => {
  for (const [name, path] of [
    ["the procedure sheet", DETAIL],
    ["the appointment sheet", APPT],
    ["the PDF the clinic prints", PDF],
  ] as const) {
    it(`${name} orders by sort_order first`, () => {
      const source = code(path);
      expect(source).toContain('.order("sort_order", { nullsFirst: false })');
    });

    it(`${name} keeps created_at and id as the tiebreaks`, () => {
      const source = code(path);
      const at = source.indexOf('.order("sort_order", { nullsFirst: false })');
      expect(source.indexOf('.order("created_at")', at)).toBeGreaterThan(at);
      expect(source.indexOf('.order("id")', at)).toBeGreaterThan(at);
    });
  }

  it("no longer orders the PDF by created_at alone", () => {
    // That was the bug: every row of one save ties on it.
    expect(code(PDF)).not.toMatch(/prescriptions[\s\S]{0,200}?\.order\("created_at"\),/);
  });
});

describe("every place that writes a prescription records the position", () => {
  it("the procedure sheet numbers one list, not each group", () => {
    // Numbering existing and new rows separately gives two rows sort_order 0,
    // and a row moved above a saved one never takes its new place.
    const source = code(DETAIL);
    expect(source).toContain("const visible = withSortOrder(");
    expect(source).toContain("const existing = visible.filter(");
    expect(source).toContain("const newRx = visible.filter(");
  });

  it("the procedure sheet writes the position on BOTH halves of the save", () => {
    // Sliced, not searched from an offset: with the update's line removed,
    // a forward search simply finds the insert's and passes.
    const source = code(DETAIL);
    const updateStart = source.indexOf('.from("prescriptions").update({');
    const updateEnd = source.indexOf('.eq("id", rx.id!);', updateStart);
    const insertStart = source.indexOf('.from("prescriptions").insert(');
    const insertEnd = source.indexOf("})));", insertStart);
    expect(updateStart).toBeGreaterThan(-1);
    expect(insertStart).toBeGreaterThan(updateStart);
    expect(source.slice(updateStart, updateEnd)).toContain("sort_order: rx.sort_order");
    expect(source.slice(insertStart, insertEnd)).toContain("sort_order: rx.sort_order");
  });

  it("the new-procedure dialog numbers what was typed", () => {
    expect(code(FORM)).toMatch(/prescriptions[\s\S]{0,200}?\.map\(\(rx, i\) => \(\{[\s\S]{0,120}?sort_order: i,/);
  });

  it("the scanned procedure keeps the order read off the page", () => {
    expect(code(SCAN)).toMatch(/meds\.map\(\(m, i\) => \(\{[\s\S]{0,160}?sort_order: i,/);
  });
});

describe("what the database promises", () => {
  const sql = () =>
    readFileSync(
      "supabase/migrations/20261120140000_a_prescription_keeps_the_order_it_was_typed.sql",
      "utf8",
    ).replace(/^\s*--.*$/gm, "");

  it("adds the column without a default and without NOT NULL", () => {
    // The published build neither writes nor reads it, so it must keep
    // working untouched until the next publish.
    const s = sql();
    expect(s).toMatch(/add column if not exists sort_order integer;/);
    expect(s).not.toMatch(/sort_order[^;]*not null/i);
    expect(s).not.toMatch(/sort_order[^;]*default/i);
  });

  it("backfills nothing", () => {
    // The order of anything already saved was never recorded. A value
    // invented here would be a guess presented as the doctor's intent.
    expect(sql()).not.toMatch(/\bupdate\s+public\.prescriptions\b/i);
  });

  it("indexes the way the three readers actually read", () => {
    expect(sql()).toContain("(procedure_id, sort_order, created_at, id)");
  });
});
