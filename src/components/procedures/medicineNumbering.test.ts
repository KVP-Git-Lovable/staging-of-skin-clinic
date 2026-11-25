import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * One number per medicine, everywhere it appears.
 *
 * The doctor types the number into a box on each medicine (MedicineNumberInput).
 * The prescription document numbers its rows by the saved order, which is the
 * on-screen order, so the two agree. These hold that together: if a form went
 * back to printing its own "Medicine 1" caption there would be two numbers on
 * screen, and if the document stopped numbering by saved order the number she
 * typed would not be the number printed.
 */
describe("medicine numbering", () => {
  const forms = [
    "src/components/procedures/ProcedureFormDialog.tsx",
    "src/components/procedures/ProcedureDetailSheet.tsx",
  ];

  for (const file of forms) {
    it(`${file.split("/").pop()} uses the number box and prints no second number`, () => {
      const source = read(file);
      expect(source).toContain("<MedicineNumberInput");
      expect(source).not.toMatch(/Medicine \{(i|idx) \+ 1\}/);
    });
  }

  it("the prescription document still numbers medicines by their saved order", () => {
    const pdf = read("supabase/functions/generate-prescription-pdf/index.ts");
    // The serial column is the row's place in the list read ordered by sort_order.
    expect(pdf).toContain('.order("sort_order", { nullsFirst: false })');
    expect(pdf).toContain("serial: String(index + 1)");
  });
});
