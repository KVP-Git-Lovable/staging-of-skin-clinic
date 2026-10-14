import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PATIENT_FIELDS } from "@/lib/patientFields";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

// The edge functions cannot import from src/, so these Deno files are copies. They must not drift.
describe("Deno copies match the frontend originals", () => {
  it("list view engine", () => {
    expect(read("supabase/functions/_shared/list-view-engine.ts")).toBe(read("src/lib/listViews/engine.ts"));
  });
  it("journey schedule math", () => {
    expect(read("supabase/functions/_shared/comms-schedule.ts")).toBe(read("src/lib/comms/schedule.ts"));
  });
  it("journey graph helpers", () => {
    expect(read("supabase/functions/_shared/comms-journey-graph.ts")).toBe(read("src/lib/comms/journeyGraph.ts"));
  });
  it("patient field keys and derived values", () => {
    const copy = read("supabase/functions/_shared/patient-view-fields.ts");
    for (const f of PATIENT_FIELDS) expect(copy).toContain(`key: "${f.key}"`);
    const count = (copy.match(/\{ key: "/g) ?? []).length;
    expect(count).toBe(PATIENT_FIELDS.length);
    expect(copy).toContain('if (key === "full_name")');
    expect(copy).toContain('if (key === "age")');
  });
});
