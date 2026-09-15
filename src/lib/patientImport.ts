import * as XLSX from "xlsx";

export const PATIENT_FIELDS = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "date_of_birth",
  "gender",
  "address",
  "emergency_contact_name",
  "emergency_contact_phone",
  "source",
  "medical_history",
  "previous_treatments",
  "notes",
  "skin_concerns",
  "follows_facebook",
  "follows_instagram",
  "sf_id",
] as const;

export type PatientField = (typeof PATIENT_FIELDS)[number];

/** Virtual mapping target that splits a single full-name column into first_name + last_name. */
export const FULL_NAME_TARGET = "__full_name__" as const;
export type MappingTarget = PatientField | typeof FULL_NAME_TARGET;

export const REQUIRED_FIELDS: PatientField[] = ["first_name", "phone"];

const FIELD_ALIASES: Record<PatientField, string[]> = {
  first_name: ["first name", "firstname", "fname", "given name", "first"],
  last_name: ["last name", "lastname", "lname", "surname", "family name", "last"],
  phone: ["phone", "phone number", "mobile", "mobile number", "contact", "contact number", "cell", "telephone", "mobile number c"],
  email: ["email", "email address", "e-mail", "mail", "email id c"],
  date_of_birth: ["dob", "date of birth", "birth date", "birthdate", "birthday", "date of birth c"],
  gender: ["gender", "sex", "sex c"],
  address: ["address", "street", "location", "addr", "place c"],
  emergency_contact_name: ["emergency contact name", "emergency name", "emergency contact", "emergency contact person c"],
  emergency_contact_phone: ["emergency contact phone", "emergency phone", "emergency number", "emergency contact number c"],
  source: ["source", "lead source", "referred by", "referral source", "patient source c"],
  medical_history: ["medical history", "history", "past medical history"],
  previous_treatments: ["previous treatments", "past treatments", "prior treatments"],
  notes: ["notes", "remarks", "comments", "patient details c"],
  skin_concerns: ["skin concerns", "concerns", "skin issues", "problems", "reason for consulting c"],
  follows_facebook: ["follows facebook", "facebook", "fb follower", "follows fb", "fb follower c"],
  follows_instagram: ["follows instagram", "instagram", "ig follower", "follows ig", "instagram follower c"],
  sf_id: ["id", "sf id", "salesforce id", "record id", "sfid"],
};

const FULL_NAME_ALIASES = ["patient name", "patient name c", "full name", "name", "patient"];

const norm = (s: string) => s.toLowerCase().trim().replace(/[_\-\s]+/g, " ");

export function autoDetectMapping(headers: string[]): Record<string, MappingTarget | ""> {
  const out: Record<string, MappingTarget | ""> = {};
  for (const h of headers) {
    const n = norm(h);
    let match: MappingTarget | "" = "";
    // Full name first (exact)
    if (FULL_NAME_ALIASES.some((a) => norm(a) === n)) {
      out[h] = FULL_NAME_TARGET;
      continue;
    }
    for (const f of PATIENT_FIELDS) {
      if (FIELD_ALIASES[f].some((a) => norm(a) === n)) {
        match = f;
        break;
      }
    }
    if (!match) {
      if (FULL_NAME_ALIASES.some((a) => n.includes(norm(a)) || norm(a).includes(n))) {
        out[h] = FULL_NAME_TARGET;
        continue;
      }
      for (const f of PATIENT_FIELDS) {
        if (FIELD_ALIASES[f].some((a) => n.includes(norm(a)) || norm(a).includes(n))) {
          match = f;
          break;
        }
      }
    }
    out[h] = match;
  }
  return out;
}

export async function parseFile(file: File): Promise<{ headers: string[]; rows: Record<string, any>[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  const headers = json.length ? Object.keys(json[0]) : [];
  return { headers, rows: json };
}

export const normalizePhone = (v: any): string => String(v ?? "").replace(/[\s\-()]/g, "").trim();

const PHONE_LIKE = /^[0-9+\-\s()]{7,}$/;
const isPhoneLike = (v: any) => PHONE_LIKE.test(String(v ?? "").trim());

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function parseDate(v: any): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial
    const d = XLSX.SSF ? new Date(Math.round((v - 25569) * 86400 * 1000)) : null;
    if (d && !isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // dd/mm/yyyy or dd-mm-yyyy
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
  // yyyy-mm-dd
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m2) {
    const d = new Date(Date.UTC(+m2[1], +m2[2] - 1, +m2[3]));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseBool(v: any): boolean {
  const s = String(v ?? "").toLowerCase().trim();
  return ["yes", "y", "true", "1", "t"].includes(s);
}

function parseGender(v: any): string | null {
  const s = String(v ?? "").toLowerCase().trim();
  if (!s) return null;
  if (["m", "male"].includes(s)) return "Male";
  if (["f", "female"].includes(s)) return "Female";
  if (["o", "other"].includes(s)) return "Other";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface MappedRow {
  index: number;
  data: Record<string, any>;
  errors: string[];
  skip?: boolean;
  skipReason?: string;
}

export function buildMappedRows(
  rows: Record<string, any>[],
  mapping: Record<string, MappingTarget | "">,
  existingPhones: Set<string>,
  existingEmails: Set<string> = new Set()
): MappedRow[] {
  const result: MappedRow[] = [];
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();

  // Determine if first/last are explicitly mapped — if so, skip auto-split
  const explicitFirst = Object.values(mapping).includes("first_name");
  const explicitLast = Object.values(mapping).includes("last_name");

  rows.forEach((raw, i) => {
    const data: Record<string, any> = {};
    const errors: string[] = [];
    const fromSplit = new Set<string>();

    for (const [header, field] of Object.entries(mapping)) {
      if (!field) continue;
      const val = raw[header];
      if (val === undefined || val === null || val === "") continue;

      if (field === FULL_NAME_TARGET) {
        const full = String(val).replace(/\s+/g, " ").trim();
        if (!full) continue;
        const idx = full.indexOf(" ");
        const fn = idx === -1 ? full : full.slice(0, idx);
        const ln = idx === -1 ? "" : full.slice(idx + 1).trim();
        if (!explicitFirst && !data.first_name) { data.first_name = fn; fromSplit.add("first_name"); }
        if (!explicitLast && !data.last_name) { data.last_name = ln; fromSplit.add("last_name"); }
        continue;
      }

      switch (field) {
        case "phone":
        case "emergency_contact_phone":
          data[field] = normalizePhone(val);
          break;
        case "email":
          data[field] = String(val).trim();
          break;
        case "date_of_birth": {
          const d = parseDate(val);
          if (d) data[field] = d;
          else errors.push("Invalid date_of_birth");
          break;
        }
        case "gender":
          data[field] = parseGender(val);
          break;
        case "follows_facebook":
        case "follows_instagram":
          data[field] = parseBool(val);
          break;
        case "skin_concerns":
          data[field] = String(val);
          break;
        default:
          data[field] = String(val).trim();
      }
    }

    // Guard: first_name accidentally contains a phone number (only when not from full-name split)
    if (data.first_name && !fromSplit.has("first_name") && isPhoneLike(data.first_name)) {
      const digits = normalizePhone(data.first_name);
      if (!data.phone) {
        // Move to phone, blank out first_name (will trigger required-field error below if no replacement)
        data.phone = digits;
        data.first_name = "";
      } else {
        errors.push("First name looks like a phone number");
      }
    }

    for (const f of REQUIRED_FIELDS) {
      if (!data[f]) errors.push(`${f.replace("_", " ")} missing`);
    }

    // Dedup against DB and within file (phone OR email)
    let skip = false;
    let skipReason: string | undefined;
    const phone = data.phone ? String(data.phone) : "";
    const email = data.email ? String(data.email).toLowerCase() : "";
    if (errors.length === 0) {
      if (phone && existingPhones.has(phone)) { skip = true; skipReason = "Duplicate phone in DB"; }
      else if (email && existingEmails.has(email)) { skip = true; skipReason = "Duplicate email in DB"; }
      else if (phone && seenPhones.has(phone)) { skip = true; skipReason = "Duplicate phone in file"; }
      else if (email && seenEmails.has(email)) { skip = true; skipReason = "Duplicate email in file"; }
      else {
        if (phone) seenPhones.add(phone);
        if (email) seenEmails.add(email);
      }
    }
    result.push({ index: i, data, errors, skip, skipReason });
  });

  return result;
}

export function toInsertPayload(row: MappedRow): Record<string, any> {
  const d = { ...row.data };
  if (typeof d.skin_concerns === "string") {
    // store as text in skin_concerns column
    d.skin_concerns = d.skin_concerns;
  }
  // last_name is NOT NULL in the DB but optional in the importer — default to empty string
  if (!d.last_name) d.last_name = "";
  return d;
}