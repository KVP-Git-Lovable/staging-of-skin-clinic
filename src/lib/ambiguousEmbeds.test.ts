import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * A schema change must not break the queries that read it.
 *
 * Adding `appointments.therapist_id` gave `appointments` a SECOND foreign key
 * to `staff`. PostgREST does not choose between two candidate relationships -
 * it refuses the request - so every query that embedded staff by bare name,
 * `staff(first_name, last_name)`, began failing the moment the column landed,
 * and appointment loading broke in the live clinic. The fix is to name the
 * relationship: `staff:staff!appointments_staff_id_fkey(...)`, which keeps the
 * response shape identical.
 *
 * No mocked test could have caught that. The suite stubs the Supabase client,
 * so the ambiguity only exists against a real PostgREST, and the column was
 * verified against the database while the queries reading it were not. This
 * test closes that gap from the other side: it reads the source.
 *
 * It is deliberately NOT limited to appointments. The hazard belongs to any
 * table that reaches the same table twice, and the next column someone adds
 * will create a new pair.
 */

/**
 * Every (table -> target) pair in this database reached by more than one
 * foreign key, so an implicit embed of the target is ambiguous.
 *
 * Taken from the live schema. To re-derive after a migration:
 *
 *   select c.conrelid::regclass, c.confrelid::regclass, count(*)
 *     from pg_constraint c
 *     join pg_class r on r.oid = c.conrelid
 *     join pg_namespace n on n.oid = r.relnamespace
 *    where c.contype = 'f' and n.nspname = 'public'
 *    group by 1, 2 having count(*) > 1;
 *
 * A pair missing here is not a false pass to shrug at - it is the exact shape
 * of the outage above. Add the pair whenever a migration adds a second route
 * between two tables.
 */
const AMBIGUOUS_EMBEDS: Record<string, string[]> = {
  // staff_id, therapist_id. The therapist foreign key is TEMPORARILY
  // dropped (20261104150000) because the published build predates the
  // explicit embeds and was erroring on every appointment. The entry
  // stays: the rule it enforces is right either way, and removing it
  // would let the outage straight back in when the key is restored.
  appointments: ["staff"],
  assets: ["vendors"],               // vendor_id, amc_vendor_id
  comms_journeys: ["staff"],         // created_by, submitted_by, approver_id
  leads: ["staff"],                  // created_by, owner_id
  leave_applications: ["staff"],     // staff_id, approved_by
  patient_family_members: ["patients"], // patient_id, related_patient_id
  procedures: ["staff"],             // staff_id, assisted_by
};

const SEARCH_ROOTS = ["src", "supabase/functions"];

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      // Test files are skipped: they mock the Supabase client, so their
      // query strings never reach PostgREST - and this file's own fixtures
      // are deliberately ambiguous.
      else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  for (const root of SEARCH_ROOTS) walk(root);
  return out;
}

/**
 * The offending embeds in one file, as readable lines.
 *
 * Exported shape kept simple on purpose: the failure message has to name the
 * file, the line and the select, because the person reading it will not have
 * this context.
 */
export function ambiguousEmbedsIn(file: string, source: string): string[] {
  const hits: string[] = [];
  for (const [table, targets] of Object.entries(AMBIGUOUS_EMBEDS)) {
    const needle = `from("${table}")`;
    let at = source.indexOf(needle);
    while (at !== -1) {
      // The select belonging to this query: the builder is chained, so it is
      // the next one in the text. 700 characters covers the long ones.
      const select = source.slice(at, at + 700).match(/\.select\(\s*(["'`])([\s\S]*?)\1/);
      if (select) {
        const columns = select[2];
        for (const target of targets) {
          // `staff:staff!appointments_staff_id_fkey(` is explicit and fine.
          // A bare `staff(` or `staff:staff(` is the ambiguous form. The `!`
          // exclusion is what tells them apart.
          const implicit = new RegExp(`(^|[^!\\w])${target}(:${target})?\\s*\\(`).test(columns);
          if (implicit && !columns.includes(`${table}_`)) {
            const line = source.slice(0, at).split("\n").length;
            hits.push(`${file}:${line}  [${table} -> ${target}]  ${columns.slice(0, 100)}`);
          }
        }
      }
      at = source.indexOf(needle, at + 1);
    }
  }
  return hits;
}

describe("PostgREST embeds are never ambiguous", () => {
  it("names the foreign key wherever two tables are joined twice", () => {
    const offenders = sourceFiles().flatMap((file) =>
      ambiguousEmbedsIn(file, readFileSync(file, "utf8")),
    );
    expect(
      offenders,
      `These queries embed a table reachable by more than one foreign key, which PostgREST refuses outright.\n` +
        `Name the relationship, e.g. staff:staff!appointments_staff_id_fkey(first_name, last_name).\n\n` +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("recognises the ambiguous form", () => {
    // Guarding the guard: a detector that silently matches nothing would pass
    // the test above for ever while the clinic's screens were broken.
    expect(
      ambiguousEmbedsIn("x.ts", 'supabase.from("appointments").select("*, staff(first_name)")'),
    ).toHaveLength(1);
    expect(
      ambiguousEmbedsIn("x.ts", 'supabase.from("procedures").select("*, staff:staff(first_name)")'),
    ).toHaveLength(1);
  });

  it("accepts an explicitly named relationship", () => {
    expect(
      ambiguousEmbedsIn(
        "x.ts",
        'supabase.from("appointments").select("*, staff:staff!appointments_staff_id_fkey(first_name)")',
      ),
    ).toEqual([]);
  });

  it("leaves unambiguous tables alone", () => {
    // patients is reached by one key from appointments, so embedding it by
    // name is correct and must not be flagged.
    expect(
      ambiguousEmbedsIn("x.ts", 'supabase.from("appointments").select("*, patients(first_name)")'),
    ).toEqual([]);
  });
});
