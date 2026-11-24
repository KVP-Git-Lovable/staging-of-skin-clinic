import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HISTORY_OBJECTS, MAX_TRACKED_FIELDS, fieldsForObject } from "./history";

/**
 * Staff records are tracked now.
 *
 * On 11 Nov a staff record was renamed and its role changed, and another was
 * deleted. The app recorded neither; it had to be reconstructed from the Trash
 * row and a snapshot that happened to exist.
 *
 * Nothing new was built for this. public.log_field_history() was already an
 * AFTER UPDATE trigger on public.staff - it looks up history_tracking_config
 * by table name and returns at once when there is no row for it. There was no
 * row for staff, so it fired and did nothing, every time.
 *
 * These tests hold the two things that silence could come back through: a
 * tracked field that is not really a column (the trigger reads
 * to_jsonb(NEW) ->> field, so a typo records nothing at all, silently), and a
 * tracked field the admin page cannot show (which is how a stored config
 * drifts away from what is actually being recorded).
 */

const MIGRATION = "supabase/migrations/20261112060000_who_changed_this_staff_record.sql";

/**
 * The migration with -- comments stripped. It explains its nine fields in
 * prose, naming every one of them, so a plain search of the file would find
 * those names whether or not the SQL still tracks them.
 */
const code = () => readFileSync(MIGRATION, "utf8").replace(/^\s*--.*$/gm, "");

/** The fields the migration actually stores, read out of its array[...]. */
function trackedFields(): string[] {
  const block = /array\[([^\]]+)\]/.exec(code());
  expect(block, "the migration no longer stores an array of fields").not.toBeNull();
  return Array.from(block![1].matchAll(/'([a-z_]+)'/g)).map((m) => m[1]);
}

/** Every column on public.staff, from the generated database types. */
function staffColumns(): string[] {
  const src = readFileSync("src/integrations/supabase/types.ts", "utf8");
  const start = src.indexOf("      staff: {\n        Row: {\n");
  expect(start, "staff is missing from the generated types").toBeGreaterThan(-1);
  const body = src.slice(start, src.indexOf("\n        }", start));
  return Array.from(body.matchAll(/^\s{10}([a-z_]+):/gm)).map((m) => m[1]);
}

describe("the database records changes to staff records", () => {
  it("switches tracking on, rather than only listing fields", () => {
    // A row with is_enabled false is exactly the state the clinic was already
    // in: the trigger reads the row and returns.
    const src = code();
    expect(src).toMatch(/insert into public\.history_tracking_config/);
    expect(src).toMatch(/values\s*\(\s*'staff',\s*true,/);
  });

  it("tracks only real columns of public.staff", () => {
    // The trigger does to_jsonb(NEW) ->> field. A misspelling yields NULL on
    // both sides, is never DISTINCT FROM itself, and records nothing - with no
    // error anywhere to say so.
    const columns = staffColumns();
    expect(columns.length).toBeGreaterThan(15);
    for (const f of trackedFields()) {
      expect(columns, `"${f}" is not a column on public.staff`).toContain(f);
    }
  });

  it("covers the changes that went unrecorded on 11 Nov", () => {
    const fields = trackedFields();
    expect(fields).toContain("first_name"); // the rename
    expect(fields).toContain("role"); // the role change the screens show
    expect(fields).toContain("role_id"); // the column that grants permissions
    expect(fields).toContain("is_active"); // how a login is switched off
    expect(fields).toContain("auth_user_id"); // re-pointing it at another login
  });

  it("names each field once and stays inside the app's own limit", () => {
    const fields = trackedFields();
    expect(fields.length).toBeGreaterThanOrEqual(9);
    expect(new Set(fields).size).toBe(fields.length);
    // useSaveHistoryConfig slices to this, so a longer list would be silently
    // truncated the first time an admin pressed Save.
    expect(fields.length).toBeLessThanOrEqual(MAX_TRACKED_FIELDS);
  });

  it("can be applied twice without fighting an admin's own edit", () => {
    expect(code()).toMatch(/on conflict \(object_key\) do update/);
  });
});

describe("staff.updated_at stops reporting May for a record changed yesterday", () => {
  it("adds the trigger the rest of the schema already uses", () => {
    const src = code();
    expect(src).toContain("before update on public.staff");
    expect(src).toContain("public.update_updated_at_column()");
  });

  it("fires before the write, not after it", () => {
    // After the row is written there is no NEW left to stamp.
    expect(code()).not.toMatch(/after update on public\.staff/);
  });

  it("is re-runnable", () => {
    const src = code();
    const drop = src.indexOf("drop trigger if exists update_staff_updated_at");
    const create = src.indexOf("create trigger update_staff_updated_at");
    expect(drop).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(drop);
  });
});

describe("nothing here can break the currently published build", () => {
  it("changes no column and no table shape", () => {
    // AGENTS.md: a schema change must keep the published build working with no
    // deploy. This is one data row and one trigger.
    const src = code();
    expect(src).not.toMatch(/alter table/i);
    expect(src).not.toMatch(/drop column/i);
    expect(src).not.toMatch(/add column/i);
    expect(src).not.toMatch(/create table/i);
  });
});

describe("the admin page can show what is being recorded", () => {
  it("offers a checkbox for every field the migration tracks", () => {
    // /admin/history-tracking can only tick what fieldsForObject returns. A
    // tracked field missing from it is recorded but invisible there, and the
    // next person to open the page has no way to see it.
    const offered = fieldsForObject("staff").map((f) => f.key);
    for (const f of trackedFields()) {
      expect(offered, `/admin/history-tracking cannot show "${f}"`).toContain(f);
    }
  });

  it("still lists Staff as a trackable object", () => {
    expect(HISTORY_OBJECTS.map((o) => o.key)).toContain("staff");
  });
});

describe("the record is readable on the staff page", () => {
  const page = () => readFileSync("src/pages/StaffDetail.tsx", "utf8");

  it("renders the same shared card the other five records use", () => {
    expect(page()).toContain('<FieldHistorySection objectType="staff" recordId={id} />');
  });

  it("gives it a tab of its own", () => {
    // A tab with no content and content with no tab are each silently useless,
    // so both halves are checked.
    expect(page()).toMatch(/<TabsTrigger value="history">/);
    expect(page()).toMatch(/<TabsContent value="history">/);
  });

  it("leaves the eight tabs that were already there", () => {
    const src = page();
    for (const tab of [
      "performance",
      "appointments",
      "invoices",
      "procedures",
      "education",
      "experience",
      "aspirations",
      "requests",
    ]) {
      expect(src, `the ${tab} tab is gone`).toContain(`<TabsContent value="${tab}">`);
    }
  });

  it("adds the card rather than moving it off another record", () => {
    for (const [file, objectType] of [
      ["src/pages/PatientDetail.tsx", "patients"],
      ["src/pages/Billing.tsx", "invoices"],
      ["src/components/procedures/ProcedureDetailSheet.tsx", "procedures"],
      ["src/components/appointments/AppointmentDetailSheet.tsx", "appointments"],
      ["src/components/services/ServiceDetailSheet.tsx", "services"],
    ]) {
      expect(readFileSync(file, "utf8"), `${file} lost its history card`).toContain(
        `<FieldHistorySection objectType="${objectType}"`,
      );
    }
  });
});
