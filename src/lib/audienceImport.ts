import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/supabasePaginate";
import { applyFilters, type ViewFilters } from "@/lib/listViews/engine";
import { PATIENT_FIELDS, rawValue as patientRawValue } from "@/lib/patientFields";
import { LEAD_VIEW_FIELDS } from "@/lib/listViews/leadFields";

/**
 * Customer-list audiences for Meta ("Custom audience → Customer list").
 *
 * Mirrors src/lib/leadImport.ts: template download, spreadsheet parsing and row
 * validation happen in the browser. Only { email, phone } of the valid rows are
 * sent to the meta-api edge function, which hashes them in memory before
 * uploading to Meta. The raw list is never stored anywhere.
 */

export const AUDIENCE_HEADERS = ["email", "phone"] as const;

/** Meta's Ads Manager refuses customer lists with fewer than 100 rows. */
export const MIN_AUDIENCE_ROWS = 100;
/** Meta accepts up to 10 000 rows per upload call; we keep one list to one call budget. */
export const MAX_AUDIENCE_ROWS = 10000;

/** Rows are treated as Indian numbers when they carry no country code. */
export const DEFAULT_COUNTRY_CODE = "91";

/** Saved-view objects that carry contact details usable for an audience. */
export type AudienceEntity = "patients" | "leads";
export const AUDIENCE_LIST_VIEW_ENTITIES: AudienceEntity[] = ["patients", "leads"];

export type AudienceInputRow = { email?: string; phone?: string };

export type Issue = { severity: "error" | "warning"; message: string };

export type ValidatedAudienceRow = {
  rowNumber: number;
  raw: AudienceInputRow;
  issues: Issue[];
  /** Present only when the row can be uploaded. */
  resolved?: { email: string | null; phone: string | null };
};

export type AudienceSummary = {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  warnings: number;
};

const SAMPLE_ROWS: AudienceInputRow[] = [
  { email: "asha@example.com", phone: "9876543210" },
  { email: "rahul@example.com", phone: "" },
  { email: "", phone: "+91 98765 43211" },
];

/* ----------------------------- normalisation ----------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Meta rule: trim and lowercase. Returns null when the value is not an email. */
export function normalizeEmail(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  return EMAIL_RE.test(s) ? s : null;
}

/**
 * Meta rule: digits only, no leading zeros, country code included.
 * 10-digit numbers without a code are assumed to be Indian mobiles.
 * Returns null when the value cannot be a phone number.
 */
export function normalizePhone(v: unknown, defaultCountryCode = DEFAULT_COUNTRY_CODE): string | null {
  let s = String(v ?? "").trim();
  if (!s) return null;
  // Spreadsheets sometimes hand us numbers in scientific notation.
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(s)) s = Number(s).toLocaleString("fullwide", { useGrouping: false });
  let digits = s.replace(/\D/g, "");
  digits = digits.replace(/^0+/, "");
  if (!digits) return null;
  if (digits.length === 10) digits = `${defaultCountryCode}${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/* ------------------------------- templates ------------------------------- */

export function csvCell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadAudienceTemplateCSV() {
  const lines = [
    AUDIENCE_HEADERS.join(","),
    ...SAMPLE_ROWS.map((r) => AUDIENCE_HEADERS.map((h) => csvCell(String(r[h] ?? ""))).join(",")),
  ];
  triggerDownload(new Blob([`${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" }), "customer_list_template.csv");
}

export function downloadAudienceTemplateXLSX() {
  const ws = XLSX.utils.json_to_sheet(SAMPLE_ROWS, { header: AUDIENCE_HEADERS as unknown as string[] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Customer list");
  XLSX.writeFile(wb, "customer_list_template.xlsx");
}

/* -------------------------------- parsing -------------------------------- */

/**
 * Reads a CSV / XLSX customer list. Header matching is lenient so Meta's own
 * template (which repeats `email` and `phone` columns) works too: every column
 * whose header starts with "email" or "phone" is considered, first non-empty wins.
 */
export async function parseAudienceFile(file: File): Promise<AudienceInputRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("File contains no sheets");
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });
  if (!rows.length) throw new Error("File is empty");

  const headers = Object.keys(rows[0]);
  const emailCols = headers.filter((h) => /^email/i.test(h.trim()));
  const phoneCols = headers.filter((h) => /^(phone|mobile)/i.test(h.trim()));
  if (!emailCols.length && !phoneCols.length) {
    throw new Error('No "email" or "phone" column found. Download the template and keep its headers.');
  }

  const firstNonEmpty = (r: Record<string, unknown>, cols: string[]) => {
    for (const c of cols) {
      const v = String(r[c] ?? "").trim();
      if (v) return v;
    }
    return "";
  };

  return rows.map((r) => ({
    email: firstNonEmpty(r, emailCols),
    phone: firstNonEmpty(r, phoneCols),
  }));
}

/* ------------------------------- validation ------------------------------ */

export function validateAudienceRows(rows: AudienceInputRow[]): ValidatedAudienceRow[] {
  const seen = new Set<string>();
  return rows.map((raw, i) => {
    const issues: Issue[] = [];
    const rawEmail = String(raw.email ?? "").trim();
    const rawPhone = String(raw.phone ?? "").trim();

    const email = normalizeEmail(rawEmail);
    const phone = normalizePhone(rawPhone);

    if (!rawEmail && !rawPhone) {
      issues.push({ severity: "error", message: "Row has neither email nor phone" });
    } else {
      if (rawEmail && !email) {
        issues.push({ severity: phone ? "warning" : "error", message: phone ? "Invalid email dropped; phone kept" : "Invalid email and no usable phone" });
      }
      if (rawPhone && !phone) {
        issues.push({ severity: email ? "warning" : "error", message: email ? "Invalid phone dropped; email kept" : "Invalid phone and no usable email" });
      }
    }

    const hasError = issues.some((x) => x.severity === "error");
    const key = `${email ?? ""}|${phone ?? ""}`;
    if (!hasError) {
      if (seen.has(key)) {
        issues.push({ severity: "error", message: "Duplicate of an earlier row" });
      } else {
        seen.add(key);
      }
    }

    const validated: ValidatedAudienceRow = { rowNumber: i + 1, raw, issues };
    if (!issues.some((x) => x.severity === "error")) {
      validated.resolved = { email, phone };
    }
    return validated;
  });
}

export function summarizeAudienceRows(rows: ValidatedAudienceRow[]): AudienceSummary {
  let valid = 0, invalid = 0, duplicates = 0, warnings = 0;
  for (const r of rows) {
    const hasErr = r.issues.some((x) => x.severity === "error");
    const isDup = r.issues.some((x) => x.message.startsWith("Duplicate"));
    if (hasErr) {
      if (isDup) duplicates++;
      else invalid++;
    } else {
      valid++;
      if (r.issues.length) warnings++;
    }
  }
  return { total: rows.length, valid, invalid, duplicates, warnings };
}

export function downloadAudienceErrorRows(rows: ValidatedAudienceRow[]) {
  const errorRows = rows.filter((r) => r.issues.some((x) => x.severity === "error"));
  if (!errorRows.length) return;
  const header = ["row", "email", "phone", "issues"];
  const lines = errorRows.map((r) =>
    [
      String(r.rowNumber),
      String(r.raw.email ?? ""),
      String(r.raw.phone ?? ""),
      r.issues.map((x) => x.message).join("; "),
    ].map(csvCell).join(","),
  );
  triggerDownload(
    new Blob([`${header.join(",")}\n${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" }),
    "customer_list_errors.csv",
  );
}

/* ------------------------------- list views ------------------------------ */

export type AudienceListView = {
  id: string;
  name: string;
  entity_type: AudienceEntity;
  filters: ViewFilters;
};

const ENTITY_LABELS: Record<AudienceEntity, string> = { patients: "Patients", leads: "Leads" };

export function listViewEntityLabel(key: AudienceEntity): string {
  return ENTITY_LABELS[key] ?? key;
}

/** Normalises a list_views row's filters, which are stored either as an array or as { conditions }. */
export function viewFiltersFromRow(row: { filter_match?: string | null; filters?: unknown }): ViewFilters {
  const f = row.filters as { conditions?: ViewFilters["conditions"] } | ViewFilters["conditions"] | null | undefined;
  const conditions = Array.isArray(f) ? f : Array.isArray(f?.conditions) ? f!.conditions! : [];
  return { match: row.filter_match === "any" ? "any" : "all", conditions };
}

/**
 * Pulls the rows of a saved view (Patients or Leads) and maps them to { email, phone }.
 * Filters are evaluated in the browser with the same engine the list pages use.
 */
export async function rowsFromListView(view: AudienceListView): Promise<AudienceInputRow[]> {
  type ContactRow = { email?: unknown; phone?: unknown };
  // The two tables are chosen dynamically, so the typed client cannot infer the row shape.
  const all = await fetchAll<ContactRow>((from, to) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from(view.entity_type) as any).select("*").order("id").range(from, to),
  );
  const rows = view.entity_type === "patients"
    ? applyFilters(all, view.filters, PATIENT_FIELDS, patientRawValue)
    : applyFilters(all, view.filters, LEAD_VIEW_FIELDS);
  return rows.map((r) => ({ email: String(r.email ?? ""), phone: String(r.phone ?? "") }));
}
