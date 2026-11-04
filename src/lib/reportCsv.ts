/**
 * A report as a .csv Excel will read.
 *
 * Lifted out of ReportView so it can be tested: the export path had no test of
 * any kind, which is how a date column reached Excel as
 * "2026-10-05T14:20:43.29+00:00" and how money reached it as a fifteen-digit
 * float. Every cell goes through reportCellCsv, the one formatter the screen,
 * the printed report and this file share.
 */

import { reportCellCsv, reportColumnHeader } from "@/lib/reportPdf";
import type { ReportColumn } from "@/lib/reportsCatalog";

const cell = (col: ReportColumn, row: unknown): string =>
  `"${reportCellCsv(col, row as Record<string, unknown>).replace(/"/g, '""')}"`;

/**
 * Header, rows, and an optional line under them.
 *
 * The trailing row is an ordinary row object, so it is formatted by the same
 * rule as every other: a figure in a currency column comes out as a bare
 * number Excel can add, and a column it says nothing about comes out empty.
 * Its label therefore has to sit in a column that is not currency - a word in
 * a currency column would export as NaN.
 */
export function toCSV(
  columns: ReportColumn[],
  rows: unknown[],
  footer?: Record<string, unknown> | null,
): string {
  const header = columns.map((c) => `"${reportColumnHeader(c)}"`).join(",");
  const lines = rows.map((r) => columns.map((c) => cell(c, r)).join(","));
  if (footer) lines.push(columns.map((c) => cell(c, footer)).join(","));
  return [header, ...lines].join("\n");
}
