import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  isPureConsultation,
  cleanInvestigationText,
  billLineName,
} from "../../supabase/functions/sf-import-clinical/consultation";

/**
 * This rule decides whether GST is charged, so it is tested against the clinic's
 * own exported invoices rather than invented strings.
 *
 * The amount is NOT a usable signal and these rows are why: "Old Consult" was
 * billed at 500 against an 850 consultation fee, while "New consult + RF +
 * Excision" was billed at exactly the 800 fee. Only the text works.
 */
const rows = fs
  .readFileSync("src/test/fixtures/clinic-consultation-invoices.csv", "utf8")
  .trim().split("\n").slice(1)
  .map((line) => {
    const c = line.split(";");
    return { investigation: c[3], invoice: c[4], total: Number(c[9]) };
  });

describe("isPureConsultation, over the clinic's real invoices", () => {
  it("reads all 60 exported rows", () => {
    expect(rows).toHaveLength(60);
  });

  it("finds exactly the 32 consultation-only visits", () => {
    expect(rows.filter((r) => isPureConsultation(r.investigation))).toHaveLength(32);
  });

  it("never calls a visit a consultation when a procedure shares the bill", () => {
    // Every one of these charged for something else too, so GST stays.
    for (const r of rows.filter((r) => /\+/.test(cleanInvestigationText(r.investigation)))) {
      expect(isPureConsultation(r.investigation), r.invoice).toBe(false);
    }
  });

  it("is not fooled by the amount, in either direction", () => {
    const byInvoice = (n: string) => rows.find((r) => r.invoice === n)!;
    // Billed at 500 against an 850 fee - still just a consultation.
    expect(isPureConsultation(byInvoice("B-48754").investigation)).toBe(true);
    // Billed at exactly the 800 consultation fee - but RF and Excision were done.
    expect(isPureConsultation(byInvoice("B-48746").investigation)).toBe(false);
  });

  it("sees through a parenthetical note to the consultation underneath", () => {
    // "New Consult (After a month Review - Rs 850 charges - Abroad)"
    const r = rows.find((r) => r.invoice === "B-48726")!;
    expect(isPureConsultation(r.investigation)).toBe(true);
  });

  it("ignores the repeat-treatment trailer when naming the service", () => {
    const r = rows.find((r) => r.invoice === "B-48742")!;
    expect(cleanInvestigationText(r.investigation)).toBe("3rx Laser toning C");
  });
});

describe("isPureConsultation, edge cases", () => {
  it("accepts the wordings the clinic actually uses", () => {
    for (const t of ["New consult", "Old Consult", "Review", "Consultation", "new consultation", "Re consult"]) {
      expect(isPureConsultation(t), t).toBe(true);
    }
  });

  it("rejects anything that names a procedure", () => {
    for (const t of ["1rx Hydra Peel", "Review + 2rx Injection", "New consult+ILS Injection", "Excision"]) {
      expect(isPureConsultation(t), t).toBe(false);
    }
  });

  it("treats no text as not-a-consultation, so tax is never removed on a guess", () => {
    expect(isPureConsultation(null)).toBe(false);
    expect(isPureConsultation("")).toBe(false);
    expect(isPureConsultation("   ")).toBe(false);
    expect(isPureConsultation("(Dr. Dr PUNYA SUVARNA)")).toBe(false);
  });
});

describe("billLineName", () => {
  it("names a consultation-only visit Consultation", () => {
    expect(billLineName("Old consult (Dr. Dr PUNYA SUVARNA)")).toBe("Consultation");
  });

  it("names everything else by what was done, which is the point of the change", () => {
    expect(billLineName("1rx Hydra Peel (Dr. Dr PUNYA SUVARNA)")).toBe("1rx Hydra Peel");
    expect(billLineName("New consult + RF (Dr. Dr. P. Suraksha)")).toBe("New consult + RF");
  });

  it("keeps the placeholder when Salesforce recorded nothing", () => {
    expect(billLineName(null)).toBe("Service");
    expect(billLineName("(Dr. Dr PUNYA SUVARNA)")).toBe("Service");
  });

  it("produces something short enough for a bill line", () => {
    const longest = Math.max(...rows.map((r) => billLineName(r.investigation).length));
    expect(longest).toBeLessThan(60);
  });
});
