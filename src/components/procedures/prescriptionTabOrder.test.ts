import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/**
 * The order of the tabs on a prescription, pinned.
 *
 * The clinic takes the history before recording what was done, so Medical
 * Information comes first and is the tab the screen opens on. That has been
 * reordered away three times:
 *
 *   d980c5d  moved Procedure to the front while adding the Knowledge Article tab
 *   8c3aaf6  put Medical Information back
 *   2436bcf  moved Procedure to the front again
 *
 * Nothing failed on any of those, because no test looked at it - the clinic
 * found it each time. This is that test.
 *
 * Asserted against the source rather than a render: the dialog is ~2,000
 * lines with Supabase, router and query dependencies, and mounting all of it
 * to read four strings would be slow and brittle in a way that invites
 * deletion. The order of TabsTrigger values IS the rendered order, so the
 * source is the honest thing to read.
 */
const TABS = [
  ["New Prescription", "src/components/procedures/ProcedureFormDialog.tsx", ["medical", "procedure", "surveys", "knowledge"]],
  ["Prescription detail", "src/components/procedures/ProcedureDetailSheet.tsx", ["medical", "procedure", "surveys", "notes"]],
] as const;

describe("prescription tab order", () => {
  for (const [screen, path, expected] of TABS) {
    const source = () => readFileSync(path, "utf8");

    it(`${screen}: shows Medical Information first`, () => {
      const list = source().match(/<TabsList[\s\S]*?<\/TabsList>/)?.[0] ?? "";
      expect(list, `no TabsList found in ${path}`).not.toBe("");
      const order = [...list.matchAll(/<TabsTrigger\s+value="([a-z]+)"/g)].map((m) => m[1]);
      expect(order).toEqual([...expected]);
    });

    it(`${screen}: opens on Medical Information, not Procedure`, () => {
      // The trigger order and the opening tab have to move together: first
      // tab Medical with Procedure selected is how this last looked wrong.
      expect(source()).toMatch(/<Tabs\s+defaultValue="medical"/);
    });
  }

  it("the prescription PDF cannot be affected by any of this", () => {
    // Stated as a test because it is the clinic's standing worry whenever
    // these tabs move. The PDF is built server-side by an edge function from
    // the procedure id alone - it never sees the form, the tabs or the DOM,
    // so reordering the tabs cannot reach it.
    const hook = readFileSync("src/hooks/usePrescriptionPreview.ts", "utf8");
    expect(hook).toContain('supabase.functions.invoke("generate-prescription-pdf"');
    expect(hook).toContain("body: { procedureId }");
    for (const forbidden of ["TabsTrigger", "defaultValue", "querySelector", "getElementById", "innerHTML"]) {
      expect(hook, `the PDF hook reads ${forbidden}, so the form could affect it`).not.toContain(forbidden);
    }
  });
});
