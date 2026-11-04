import { describe, it, expect } from "vitest";
import * as app from "./procedureRollup";
import * as pdf from "../../supabase/functions/generate-prescription-pdf/procedureRollup.ts";

/**
 * The edge function cannot import from src/, so it carries a copy. Copies rot -
 * that is exactly how the document kept double-printing "1v2" after the screen
 * had stopped. This fails the moment the two disagree.
 */
describe("the document's copy of the roll-up rule matches the app's", () => {
  const cases: [string, app.RollUpLine[]][] = [
    ["FILLERS: 1v2", [{ service_name: "Scar Remodelling", recommendations: "" }, { service_name: "FILLERS", recommendations: "1v2" }]],
    ["Review after 6 weeks", [{ service_name: "FILLERS", recommendations: "1v2" }]],
    ["1v2", [{ service_name: "FILLERS", recommendations: "1v2" }]],
    ["", []],
    ["  FILLERS: 1v2  ", [{ service_name: "Scar Remodelling", recommendations: "" }, { service_name: "FILLERS", recommendations: "1v2" }]],
  ];

  it.each(cases)("agrees on isRollUpOf(%j)", (stored, lines) => {
    expect(pdf.isRollUpOf(stored, lines, "recommendations")).toBe(app.isRollUpOf(stored, lines, "recommendations"));
  });

  it.each(cases)("agrees on rollUpServiceField for %j", (_stored, lines) => {
    expect(pdf.rollUpServiceField(lines, "recommendations")).toBe(app.rollUpServiceField(lines, "recommendations"));
    expect(pdf.rollUpServiceField(lines, "procedure_notes")).toBe(app.rollUpServiceField(lines, "procedure_notes"));
  });
});
