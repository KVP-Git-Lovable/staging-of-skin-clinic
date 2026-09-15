import * as XLSX from "xlsx";
import { normalizeName } from "./textNormalize";

export const PROCEDURE_FIELDS = [
  "patient_sf_id",
  "patient_name",
  "patient_phone",
  "service_name_text",
  "procedure_date",
  "staff_name",
  "status",
  "visit_type",
  "symptoms",
  "diagnosis",
  "consultation_notes",
  "procedure_notes",
  "recommendations",
  "prescription_text",
  "special_instructions",
  "dietary_advice",
  "lab_tests",
  "follow_up_date",
  "cost",
  "notes",
] as const;

export type ProcedureField = (typeof PROCEDURE_FIELDS)[number];

export const FIELD_LABELS: Record<ProcedureField, string> = {
  patient_sf_id: "Patient (Salesforce ID)",
  patient_name: "Patient Name",
  patient_phone: "Patient Phone",
  service_name_text: "Service (free text)",
  procedure_date: "Procedure Date",
  staff_name: "Staff Name",
  status: "Status",
  visit_type: "Visit Type",
  symptoms: "Symptoms",
  diagnosis: "Diagnosis",
  consultation_notes: "Consultation Notes",
  procedure_notes: "Procedure Notes",
  recommendations: "Recommendations",
  prescription_text: "Prescription (free text)",
  special_instructions: "Special Instructions",
  dietary_advice: "Dietary Advice",
  lab_tests: "Lab Tests",
  follow_up_date: "Follow-up Date",
  cost: "Cost",
  notes: "Notes",
};

const ALLOWED_STATUSES = new Set(["scheduled", "in progress", "completed", "cancelled", "no show"]);

const SF_ALIASES: Record<string, ProcedureField> = {
  "patient c": "patient_sf_id",
  "patient": "patient_sf_id",
  "patient name c": "patient_name",
  "patient name": "patient_name",
  "service c": "service_name_text",
  "service": "service_name_text",
  "symptoms c": "symptoms",
  "diagnosis c": "diagnosis",
  "prescription c": "prescription_text",
  "prescription": "prescription_text",
  "special instructions c": "special_instructions",
  "dietary advice c": "dietary_advice",
  "required lab test s c": "lab_tests",
  "required lab tests c": "lab_tests",
  "lab tests c": "lab_tests",
  "visit type c": "visit_type",
  "visit type": "visit_type",
  "phone": "patient_phone",
  "mobile": "patient_phone",
};

const norm = (s: string) => s.toLowerCase().trim().replace(/[_\-\s\.]+/g, " ").replace(/[^a-z0-9 ]/g, "");

export function autoDetectProcedureMapping(headers: string[]): Record<string, ProcedureField | ""> {
  const out: Record<string, ProcedureField | ""> = {};
  for (const h of headers) {
    const n = norm(h);
    out[h] = SF_ALIASES[n] || "";
  }
  return out;
}

export const normalizePhone = (v: any): string =>
  String(v ?? "").replace(/[\s\-()]/g, "").trim();

export { normalizeName };

function parseDate(v: any): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m1 = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (m1) {
    const dd = +m1[1], mm = +m1[2];
    let yy = +m1[3];
    if (yy < 100) {
      const currentYY = new Date().getFullYear() % 100;
      yy += yy <= currentYY ? 2000 : 1900;
    }
    const d = new Date(Date.UTC(yy, mm - 1, dd));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m2) {
    const d = new Date(Date.UTC(+m2[1], +m2[2] - 1, +m2[3]));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export async function parseFile(file: File): Promise<{ headers: string[]; rows: Record<string, any>[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  const headers = json.length ? Object.keys(json[0]) : [];
  return { headers, rows: json };
}

export interface MappedProcedureRow {
  index: number;
  data: Record<string, any>;
  errors: string[];
  warnings: string[];
  patient_id?: string | null;
  staff_id?: string | null;
  resolved_service_name?: string;
  skip?: boolean;
}

export interface ResolutionMaps {
  sfIdToPatient: Map<string, string>;
  nameToPatients: Map<string, string[]>; // lowercased "first last" → [ids] (most recent first)
  phoneToPatient: Map<string, string>;
  nameToStaff: Map<string, string>;
  serviceNames: Map<string, string>; // lowercased name → canonical name
}

export function buildMappedProcedureRows(
  rows: Record<string, any>[],
  mapping: Record<string, ProcedureField | "">,
  maps: ResolutionMaps,
  defaultProcedureDate: string | null
): MappedProcedureRow[] {
  const result: MappedProcedureRow[] = [];

  rows.forEach((raw, i) => {
    const data: Record<string, any> = {};
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const [header, field] of Object.entries(mapping)) {
      if (!field) continue;
      const val = raw[header];
      if (val === undefined || val === null || val === "") continue;

      switch (field) {
        case "patient_phone":
          data[field] = normalizePhone(val);
          break;
        case "patient_sf_id":
          data[field] = String(val).trim();
          break;
        case "patient_name":
          data[field] = String(val).replace(/\s+/g, " ").trim();
          break;
        case "procedure_date":
        case "follow_up_date": {
          const d = parseDate(val);
          if (d) data[field] = d;
          else if (field === "follow_up_date") warnings.push("Invalid follow_up_date (ignored)");
          break;
        }
        case "cost": {
          const n = Number(String(val).replace(/[^0-9.-]/g, ""));
          if (!isNaN(n)) data[field] = n;
          break;
        }
        default:
          data[field] = String(val).trim();
      }
    }

    // --- Patient resolution: sf_id → name → phone ---
    let patient_id: string | null = null;
    if (data.patient_sf_id) {
      patient_id = maps.sfIdToPatient.get(String(data.patient_sf_id)) ?? null;
    }
    if (!patient_id && data.patient_name) {
      const key = normalizeName(data.patient_name);
      const matches = maps.nameToPatients.get(key);
      if (matches && matches.length === 1) {
        patient_id = matches[0];
      } else if (matches && matches.length > 1) {
        patient_id = matches[0];
        warnings.push(`Multiple patients named "${data.patient_name}" — picked most recent`);
      }
    }
    if (!patient_id && data.patient_phone) {
      patient_id = maps.phoneToPatient.get(data.patient_phone) ?? null;
    }
    if (!patient_id) {
      const ref = data.patient_sf_id || data.patient_name || data.patient_phone || "(no identifier)";
      errors.push(`No patient match for "${ref}"`);
    }

    // --- Service resolution ---
    let resolved_service_name = "Consultation";
    if (data.service_name_text) {
      const key = normalizeName(data.service_name_text);
      const canonical = maps.serviceNames.get(key);
      if (canonical) {
        resolved_service_name = canonical;
      } else {
        resolved_service_name = String(data.service_name_text);
        warnings.push(`Service "${data.service_name_text}" not in master — kept as free text`);
      }
    } else {
      warnings.push(`No service in row — defaulted to "Consultation"`);
    }

    // --- Date ---
    if (!data.procedure_date) {
      if (defaultProcedureDate) {
        data.procedure_date = defaultProcedureDate;
      } else {
        errors.push("procedure_date missing (no default set)");
      }
    }

    // --- Status / visit_type ---
    let status = "Completed";
    if (data.status) {
      const s = String(data.status).toLowerCase().trim();
      if (ALLOWED_STATUSES.has(s)) {
        status = s.split(" ").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
      } else {
        warnings.push(`Status "${data.status}" not standard — using "Completed"`);
      }
    }
    if (data.visit_type) {
      const v = String(data.visit_type).toLowerCase().trim();
      if (ALLOWED_STATUSES.has(v)) {
        status = v.split(" ").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
      } else {
        // Prepend visit type to consultation_notes
        const prefix = `Visit Type: ${data.visit_type}`;
        data.consultation_notes = data.consultation_notes
          ? `${prefix}\n${data.consultation_notes}`
          : prefix;
      }
    }
    data.status = status;

    // --- Staff ---
    let staff_id: string | null = null;
    if (data.staff_name) {
      const key = normalizeName(data.staff_name);
      staff_id = maps.nameToStaff.get(key) ?? null;
      if (!staff_id) warnings.push(`Staff "${data.staff_name}" not matched`);
    }

    result.push({
      index: i,
      data,
      errors,
      warnings,
      patient_id,
      staff_id,
      resolved_service_name,
      skip: false,
    });
  });

  return result;
}

export function toProcedureInsertPayload(row: MappedProcedureRow): Record<string, any> {
  const d = row.data;

  // Build procedure_notes — combine free notes + prescription text
  const noteParts: string[] = [];
  if (d.procedure_notes) noteParts.push(d.procedure_notes);
  if (d.prescription_text) noteParts.push(`Prescription:\n${d.prescription_text}`);
  if (d.notes) noteParts.push(`Notes: ${d.notes}`);
  if (d.follow_up_date) noteParts.push(`Follow-up: ${d.follow_up_date}`);
  if (d.cost != null) noteParts.push(`Cost: ${d.cost}`);

  // Build recommendations — combine recs + special instructions + dietary + lab tests
  const recParts: string[] = [];
  if (d.recommendations) recParts.push(d.recommendations);
  if (d.special_instructions) recParts.push(`Special Instructions:\n${d.special_instructions}`);
  if (d.dietary_advice) recParts.push(`Dietary Advice:\n${d.dietary_advice}`);
  if (d.lab_tests) recParts.push(`Lab Tests:\n${d.lab_tests}`);

  return {
    patient_id: row.patient_id,
    service_name: row.resolved_service_name || "Consultation",
    procedure_date: d.procedure_date,
    staff_id: row.staff_id,
    status: d.status || "Completed",
    symptoms: d.symptoms ?? null,
    diagnosis: d.diagnosis ?? null,
    consultation_notes: d.consultation_notes ?? null,
    procedure_notes: noteParts.length ? noteParts.join("\n\n") : null,
    recommendations: recParts.length ? recParts.join("\n\n") : null,
  };
}