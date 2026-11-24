import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canActOnModule, canViewModule } from "./staffAccess";

/**
 * What a therapist may do on the Appointments page, and see from it.
 *
 * Impersonated into that page they were shown "All Appointments - 58,001
 * items": every patient the clinic has ever seen, with phone numbers, and a
 * New Appt button, a status dropdown and a delete icon on each row.
 *
 * Two separate failures met there. can_create, can_edit and can_delete had
 * been stored on every role since the permission table was built and were
 * read by NOTHING - useCanEdit and its siblings had not one call site. And
 * appointments has carried `FOR SELECT USING (true)` for every signed-in
 * account since 20260818103000, so hiding the rows in the client would have
 * been a curtain rather than a wall.
 */

const PAGE = () => readFileSync("src/pages/Appointments.tsx", "utf8").replace(/^\s*\/\/.*$/gm, "");
const MIGRATION = "supabase/migrations/20261113210000_only_the_visits_they_were_put_on.sql";
const sql = () => readFileSync(MIGRATION, "utf8").replace(/^\s*--.*$/gm, "");

describe("canActOnModule", () => {
  const ro = { appointments: { can_view: true, can_create: false, can_edit: false, can_delete: false } };

  it("refuses create, edit and delete to a view-only role", () => {
    for (const action of ["can_create", "can_edit", "can_delete"] as const) {
      expect(canActOnModule({ isAdmin: false, permissions: ro, moduleKey: "appointments", action })).toBe(false);
    }
    expect(canViewModule({ isAdmin: false, permissions: ro, moduleKey: "appointments" })).toBe(true);
  });

  it("lets an admin do everything WITHOUT consulting the map", () => {
    // useAuth hands an admin an empty map, so an admin would scrape through
    // on the empty-map rule even with the isAdmin line gone. A populated map
    // is what tells the two apart.
    expect(canActOnModule({
      isAdmin: true, permissions: ro, moduleKey: "appointments", action: "can_delete",
    })).toBe(true);
  });

  it("keeps a role nobody has configured able to work", () => {
    // The old useCanEdit read `?? false` here, which would have taken every
    // button away from exactly the people whose role was never set up.
    for (const action of ["can_create", "can_edit", "can_delete"] as const) {
      expect(canActOnModule({ isAdmin: false, permissions: {}, moduleKey: "appointments", action })).toBe(true);
    }
  });

  it("refuses a module with no row at all when others are configured", () => {
    expect(canActOnModule({
      isAdmin: false, permissions: ro, moduleKey: "billing", action: "can_edit",
    })).toBe(false);
  });

  it("is what the three hooks answer with", () => {
    // Comments stripped: the file's own header explains the `?? false` it
    // no longer does, and a plain search would find that sentence.
    const hooks = readFileSync("src/hooks/useCanEdit.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const a of ["can_edit", "can_create", "can_delete"]) {
      expect(hooks).toContain(`action: "${a}"`);
    }
    // The old shape, which did not know about the empty map.
    expect(hooks).not.toContain("?? false");
  });
});

describe("the Appointments page offers only what the role may do", () => {
  it("hides New Appt without create", () => {
    expect(PAGE()).toMatch(/\{canCreateAppt && \(\s*\n\s*<DialogTrigger asChild>/);
  });

  it("hides the pencil and the delete icon separately", () => {
    const src = PAGE();
    expect(src).toMatch(/\{canEditAppt && \(\s*\n\s*<Button variant="ghost" size="icon" className="h-7 w-7" onClick=\{\(\) => startInlineEdit\(apt\)\}/);
    expect(src).toMatch(/\{canDeleteAppt && \(\s*\n\s*<Button[\s\S]{0,400}title="Delete appointment"/);
  });

  it("hides Add Prescription behind the module it navigates to", () => {
    // Offering a button that lands on Access Denied is worse than not
    // offering it.
    expect(PAGE()).toContain('moduleKey: "procedures"');
    expect(PAGE()).toMatch(/\{canAddPrescription && \(/);
  });

  it("drops the whole Actions column when there is nothing to put in it", () => {
    const src = PAGE();
    expect(src).toContain("const showRowActions = canEditAppt || canDeleteAppt || canAddPrescription;");
    expect(src).toMatch(/\{showRowActions && <th[^>]*>Actions<\/th>\}/);
    expect(src).toMatch(/\{showRowActions && \(\s*\n\s*<td className="p-3" onClick=/);
  });

  it("shows the status as a badge, not a dropdown, without edit", () => {
    // The dropdown writes straight to the row. Without a read-only fallback
    // somebody who may only look would still hold the one control on the
    // list that changes a record.
    expect(PAGE()).toMatch(/\{!canEditAppt \? \([\s\S]{0,400}<Badge/);
  });

  it("asks the shared rule rather than its own", () => {
    const src = PAGE();
    expect(src).toContain('from "@/lib/staffAccess"');
    expect(src).toMatch(/canActOnModule\(\{ isAdmin: iAmAdmin, permissions: myPermissions, moduleKey: "appointments", action \}\)/);
  });
});

describe("the database stops them seeing the rest", () => {
  it("gives appointment scoping its own axis, not data_scope", () => {
    // Doctor is ALREADY data_scope = 'own' for billing, and 20260923000000
    // deliberately removed appointment scoping so doctors could cover for
    // each other. Reusing data_scope would silently put that back.
    const src = sql();
    expect(src).toContain("add column if not exists appointment_scope text not null default 'all'");
    expect(src).not.toMatch(/has_full_data_scope/);
  });

  it("defaults to seeing everything wherever anything is missing", () => {
    // A misconfiguration must never blank the clinic's own list.
    expect(sql()).toMatch(/select coalesce\([\s\S]{0,320}\n\s*true\);/);
  });

  it("turns it on for therapists and nurses only", () => {
    expect(sql()).toMatch(/set appointment_scope = 'assigned'[\s\S]{0,80}lower\(name\) in \('therapist', 'nurse'\)/);
  });

  it("counts all three ways an appointment can be theirs, in EVERY policy", () => {
    // therapist_id is what the published build writes, therapist_ids what
    // this one does; both are needed, and the doctor column matches the
    // procedures precedent.
    //
    // Checked policy by policy, not across the file: the notes policy spells
    // the same clauses with an `a.` prefix, so a search of the whole file
    // passed while all three appointment policies had lost one.
    const src = sql();
    const policies = [
      "scope appointments to the assigned",
      "scope appointment writes to the assigned",
      "scope appointment deletes to the assigned",
      "scope appointment notes to the assigned",
    ];
    for (const name of policies) {
      const at = src.indexOf(`create policy "${name}"`);
      expect(at, `${name} is gone`).toBeGreaterThan(-1);
      const body = src.slice(at, src.indexOf("\n  );", at));
      const prefix = name.includes("notes") ? "a." : "";
      for (const col of ["staff_id", "therapist_id"]) {
        expect(body, `${name} does not match on ${col}`)
          .toContain(`${prefix}${col} = (select public.current_staff_id())`);
      }
      expect(body, `${name} does not match on therapist_ids`)
        .toContain(`(select public.current_staff_id()) = any (${prefix}therapist_ids)`);
    }
  });

  it("is restrictive, so it narrows rather than widens", () => {
    expect((sql().match(/as restrictive for/g) ?? []).length).toBe(4);
  });

  it("hoists every helper call", () => {
    // 20260910160000 measured 7ms against 874ms over 50k rows for the
    // unhoisted form, and this table holds 57,970.
    const src = sql();
    expect(src).not.toMatch(/or staff_id = public\.current_staff_id\(\)/);
    expect(src).not.toMatch(/using \(\s*public\.sees_all_appointments\(\)/);
  });

  it("takes the notes with the appointment", () => {
    expect(sql()).toMatch(/on public\.appointment_sticky_notes as restrictive for select/);
  });

  it("makes appointments read-only for them", () => {
    expect(sql()).toMatch(/set can_edit = false, can_create = false, can_delete = false[\s\S]{0,200}lower\(r\.name\) in \('therapist', 'nurse'\)/);
  });

  it("renames and drops nothing", () => {
    const src = sql();
    expect(src).not.toMatch(/drop column/i);
    expect(src).not.toMatch(/rename/i);
    expect(src).not.toMatch(/drop table/i);
  });
});
