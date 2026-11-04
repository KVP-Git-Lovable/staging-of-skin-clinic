/**
 * The visits-to-review list as a spreadsheet.
 *
 * Four thousand visits is not a job anyone does fifty rows at a time in a
 * browser; it is a file passed round the clinic and worked through. The
 * building of the text is separated from the downloading of it so the
 * escaping can be tested - a patient called "Shetty, Anil" or a service
 * named `Peel 20% "strong"` must not shear the columns apart, and a clinic
 * list is full of commas.
 */

export interface ReviewCsvRow {
  appointment_id: string;
  patient_id?: string | null;
  patient_name?: string | null;
  start_time: string;
  service?: string | null;
  doctor_name?: string | null;
  from_salesforce?: boolean | null;
}

const HEADERS = ["Date", "Time", "Patient", "Service", "Doctor", "Origin", "Appointment ID", "Patient ID"];

/**
 * One CSV field.
 *
 * Quoted whenever it holds a comma, a quote or a newline, with inner quotes
 * doubled, per RFC 4180. A leading `=`, `+`, `-` or `@` is prefixed with a
 * single quote: Excel treats those as the start of a formula, and a patient
 * record should never execute anything when the file is opened.
 */
export function csvField(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** dd/MM/yyyy and hh:mm a, the formats the rest of the clinic reads. */
function dateParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const p2 = (n: number) => String(n).padStart(2, "0");
  const h24 = d.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return {
    date: `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`,
    time: `${p2(h12)}:${p2(d.getMinutes())} ${h24 < 12 ? "AM" : "PM"}`,
  };
}

export function buildReviewCsv(rows: ReviewCsvRow[]): string {
  const lines = [HEADERS.join(",")];
  for (const r of rows) {
    const { date, time } = dateParts(r.start_time);
    lines.push([
      csvField(date),
      csvField(time),
      csvField(r.patient_name ?? ""),
      csvField(r.service ?? ""),
      csvField(r.doctor_name ?? ""),
      csvField(r.from_salesforce ? "Salesforce" : "Created here"),
      csvField(r.appointment_id),
      csvField(r.patient_id ?? ""),
    ].join(","));
  }
  // Trailing newline: without it some tools drop the final row.
  return lines.join("\r\n") + "\r\n";
}

/** The filename carries the date so two exports do not overwrite each other. */
export function reviewCsvFilename(now: Date = new Date()): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `visits-to-review-${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}.csv`;
}

export function downloadCsv(rows: ReviewCsvRow[], now: Date = new Date()): void {
  // BOM so Excel reads it as UTF-8; without it Indian names with accents
  // arrive mangled.
  const blob = new Blob(["﻿" + buildReviewCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = reviewCsvFilename(now);
  a.click();
  URL.revokeObjectURL(url);
}
