import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Trash delete/restore and past-visit notes run with the owner's access, so
 * what they run must not be shaped by the caller or by a Trash row.
 */
const MIGRATION = "drizzle/migrations/0035_trash_and_visit_notes_no_caller_built_sql.sql";
const sql = readFileSync(MIGRATION, "utf8");

const body = (name: string) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const open = sql.indexOf("$function$", start);
  const close = sql.indexOf("$function$", open + 1);
  return sql.slice(open, close);
};

const ALLOWED = [
  "patients", "appointments", "procedures", "invoices", "pharma_products", "pharma_bills",
  "expenses", "assets", "vendors", "services", "doctors", "staff", "campaigns", "portal_orders",
  "survey_templates", "survey_responses", "patient_photos", "prescriptions", "list_views",
  "problem_areas", "tax_master", "hsn_tax_master", "category_master", "unit_master", "saved_reports",
];

describe("move_to_trash", () => {
  it("runs no SQL built at run time", () => {
    expect(body("move_to_trash")).not.toMatch(/\bexecute\b/i);
  });

  it("has a fixed read and delete for every record type Trash allows", () => {
    const b = body("move_to_trash");
    for (const t of ALLOWED) {
      expect(b).toContain(`when '${t}' then select to_jsonb(t) into row_json from public.${t} t`);
      expect(b).toContain(`when '${t}' then delete from public.${t} where id = _record_id;`);
    }
  });

  it("still requires active staff and the caller's own record", () => {
    const b = body("move_to_trash");
    expect(b).toContain("public.is_active_staff()");
    expect(b).toContain("public.can_trash_record(_object_type, _record_id)");
  });
});

describe("restore_from_trash", () => {
  it("runs no SQL built at run time", () => {
    expect(body("restore_from_trash")).not.toMatch(/\bexecute\b/i);
  });

  it("re-inserts through a helper app users cannot call", () => {
    expect(body("restore_from_trash")).toContain("public.trash_reinsert_record(item.object_type, item.record_id, item.record_data)");
    expect(sql).toContain("revoke all on function public.trash_reinsert_record(text, uuid, jsonb) from public, anon, authenticated;");
    expect(body("trash_reinsert_record")).not.toMatch(/security definer/i);
  });

  it("helper re-checks the record type and the saved id itself", () => {
    const b = body("trash_reinsert_record");
    expect(b).toContain("public.trash_allowed_object(_object_type)");
    expect(b).toContain("_data->>'id' is distinct from _record_id::text");
  });
});

describe("patient_visit_notes", () => {
  it("answers nobody who is not signed-in active staff", () => {
    const b = body("patient_visit_notes");
    expect(b).toContain("auth.uid() is null");
    expect(b).toContain("not public.is_active_staff()");
  });

  it("still gates through the visit history rather than a second copy of the rule", () => {
    expect(body("patient_visit_notes")).toContain("from public.patient_visit_history(p_appointment_id) h");
  });

  it("is not open to visitors", () => {
    expect(sql).toContain("revoke all on function public.patient_visit_notes(uuid, uuid) from public, anon;");
  });
});
