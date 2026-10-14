import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { applyFilters, type FilterCondition } from "./list-view-engine.ts";
import { PATIENT_FIELDS, rawValue } from "./patient-view-fields.ts";
import { toE164IN } from "./comms-phone.ts";

export type Combinator = "union" | "intersection" | "difference";
export type Segment = { key: "A" | "B"; label: string; list_view_id: string; entity_type: "patients" };
export type AudienceConfig = { segments: Segment[]; combinator: Combinator; primary: "A" | "B" };

// deno-lint-ignore no-explicit-any
type PatientRow = Record<string, any>;

export type ResolvedAudience = {
  patients: (PatientRow & { phone_e164: string })[];
  perSegment: Record<string, number>;
  total: number;
  withoutPhone: number;
};

async function loadAllPatients(admin: SupabaseClient): Promise<PatientRow[]> {
  const rows: PatientRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("patients").select("*").order("id").range(from, from + 999);
    if (error) throw new Error(`patients load failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export function validateAudienceConfig(config: unknown): AudienceConfig {
  const c = config as Partial<AudienceConfig> | null;
  const segments = Array.isArray(c?.segments) ? c!.segments! : [];
  if (segments.length < 1 || segments.length > 2) throw new Error("Pick one or two audience segments");
  for (const s of segments) {
    if (!s?.list_view_id || s.entity_type !== "patients") throw new Error("Segments must use Patients list views");
  }
  const combinator = (["union", "intersection", "difference"] as const).find((x) => x === c?.combinator) ?? "union";
  return { segments, combinator, primary: c?.primary === "B" ? "B" : "A" };
}

export type PatientSet = { patients: PatientRow[]; perSegment: Record<string, number> };

/** Every patient matched by the segments (after the combinator), with no contact-detail filtering. */
export async function resolvePatientSet(admin: SupabaseClient, rawConfig: unknown): Promise<PatientSet> {
  const config = validateAudienceConfig(rawConfig);
  const patients = await loadAllPatients(admin);

  const sets: Record<string, Set<string>> = {};
  for (const seg of config.segments) {
    const { data: view, error } = await admin
      .from("list_views")
      .select("id, section, filter_match, filters")
      .eq("id", seg.list_view_id)
      .maybeSingle();
    if (error || !view) throw new Error(`Saved view "${seg.label}" no longer exists`);
    if (view.section !== "patients") throw new Error(`Saved view "${seg.label}" is not a Patients view`);
    const conditions: FilterCondition[] = Array.isArray(view.filters)
      ? view.filters
      : Array.isArray(view.filters?.conditions)
        ? view.filters.conditions
        : [];
    const match = view.filter_match === "any" ? "any" : "all";
    const matched = applyFilters(patients, { match, conditions }, PATIENT_FIELDS, rawValue);
    sets[seg.key] = new Set(matched.map((p) => p.id as string));
  }

  const perSegment = Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, v.size]));
  const [first, second] = config.segments;
  let ids: Set<string>;
  if (!second) ids = sets[first.key];
  else {
    const a = sets[first.key];
    const b = sets[second.key];
    if (config.combinator === "intersection") ids = new Set([...a].filter((x) => b.has(x)));
    else if (config.combinator === "difference") {
      const keep = config.primary === second.key ? b : a;
      const drop = config.primary === second.key ? a : b;
      ids = new Set([...keep].filter((x) => !drop.has(x)));
    } else ids = new Set([...a, ...b]);
  }
  return { patients: patients.filter((p) => ids.has(p.id)), perSegment };
}

export async function resolveAudience(admin: SupabaseClient, rawConfig: unknown): Promise<ResolvedAudience> {
  const { patients: picked, perSegment } = await resolvePatientSet(admin, rawConfig);
  const reachable: ResolvedAudience["patients"] = [];
  for (const p of picked) {
    const phone = toE164IN(p.phone);
    if (phone) reachable.push({ ...p, phone_e164: phone });
  }
  return { patients: reachable, perSegment, total: reachable.length, withoutPhone: picked.length - reachable.length };
}
