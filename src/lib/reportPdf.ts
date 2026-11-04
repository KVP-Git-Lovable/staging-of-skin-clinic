import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { formatAmountExact, formatNumber } from "@/lib/currency";
import { REPORT_DATE_RANGE_OPTIONS } from "@/lib/reportDateRange";
import { displayDate } from "@/lib/dateInput";
import type { ReportColumn, ReportConfig, ReportSummaryCard } from "@/lib/reportsCatalog";
import type { FilterState } from "@/components/reports/ReportFilterBar";
import bundledLogo from "@/assets/skin-clinic-logo.png";

/**
 * PDF export for the report screens.
 *
 * jsPDF's built-in Helvetica is WinAnsi-encoded and has no rupee sign (U+20B9),
 * so anything drawn has to be ASCII first. The edge functions that produce the
 * invoice and prescription PDFs already settled on this: generate-prescription-pdf
 * strips non-ASCII in its own sanitize(), and generate-invoice-pdf heads its money
 * columns "Charges (Rs)". Same convention here - currency columns are headed
 * "(Rs)" and their values printed as plain grouped numbers.
 */

/** ASCII-only text, with the punctuation we actually emit mapped rather than dropped. */
export function sanitize(value: unknown): string {
  return String(value ?? "")
    .replace(/₹/g, "Rs ")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/·/g, "-")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type ReportRow = Record<string, unknown>;

function cellValue(col: ReportColumn, row: ReportRow) {
  return col.accessor ? col.accessor(row) : row[col.key];
}

/**
 * The string form of a cell, mirroring SortableDataTable.renderCell so the PDF and
 * the table on screen never disagree. col.render returns a ReactNode and cannot be
 * used here, so those columns fall through to the raw value.
 */
export function reportCellText(col: ReportColumn, row: ReportRow, empty = "-"): string {
  const v = cellValue(col, row);
  if (v === null || v === undefined || v === "") return empty;
  return formatCell(col, v);
}

/**
 * The same cell for the CSV download.
 *
 * The download used to write whatever the row held, so a date column that read
 * "05/10/2026" on screen and in the printed report arrived in Excel as
 * "2026-10-05T14:20:43.29+00:00" - a timestamp nobody asked for, in a format
 * Excel will not treat as a date. One formatter for all three now. An empty
 * cell stays empty rather than becoming a dash, because a spreadsheet counts
 * and filters on blanks.
 */
export function reportCellCsv(col: ReportColumn, row: ReportRow): string {
  const v = cellValue(col, row);
  if (v === null || v === undefined || v === "") return "";
  // Money goes out as a bare number, to two decimals. Grouped into
  // "1,66,322.50" it would land in Excel as text, and a column of text cannot
  // be summed - which is the one thing a finance export exists for. But bare
  // used to mean every digit JavaScript holds: a Rs 1,000 bill charged
  // inclusive of 5% GST is 1000/1.05, which does not divide evenly, and
  // B-49052 exported its GST as 47.61904762 against 952.3809524. Two decimals
  // is what the same figure reads as on screen and in the printed report, and
  // 47.62 + 952.38 still comes back to the 1000.00 on the bill.
  if (col.type === "currency") return Number(v).toFixed(2);
  // A count has no paise and must not grow any - "5.00" of something.
  if (col.type === "number") return String(Number(v));
  return formatCell(col, v);
}

function formatCell(col: ReportColumn, v: unknown): string {
  switch (col.type) {
    // Money is the figure someone totals by hand against a bank statement, so
    // it never abbreviates and never loses its paise. Sending it through
    // formatNumber rounded to whole rupees while decimals are off, and a day
    // whose summary card read Rs 1,66,322.50 printed rows adding up to
    // Rs 1,66,324.00 - three half-rupee bills, each rounded up, in a document
    // that could not be reconciled against itself.
    case "currency":
      return formatAmountExact(Number(v));
    // A count has no paise and should not grow any.
    case "number":
      return formatNumber(Number(v));
    // dd/MM/yyyy, the one date format the rest of the app settled on.
    case "date":
      return displayDate(v as string) || String(v);
    case "datetime":
      try { return `${displayDate(v as string)} ${format(new Date(v as string), "h:mm a")}`.trim(); } catch { return String(v); }
    default:
      return String(v);
  }
}

/**
 * The columns as an export row should be read.
 *
 * A report that builds its own export rows has already resolved them - the
 * service is that line's service, the GST is that line's GST - so the columns'
 * accessors, which expect a whole invoice, must not run again. The heading and
 * the type stay, so the figures format and align exactly as they do today.
 */
export function exportColumns(columns: ReportColumn[]): ReportColumn[] {
  return columns.map(({ key, label, type }) => ({ key, label, type }));
}

/** Currency columns say which currency, since the values carry no symbol. */
export function reportColumnHeader(col: ReportColumn): string {
  return col.type === "currency" ? `${col.label} (Rs)` : col.label;
}

const isNumeric = (col: ReportColumn) => col.type === "currency" || col.type === "number";

const LOGO_MAX_H = 84;
const LOGO_MAX_W = 190;

/**
 * Fit the logo inside a box rather than forcing a height: a square mark then fills
 * the full 60pt and reads at the same weight as the clinic name beside it, while a
 * wide letterhead-style mark is held back by the width limit instead of running
 * into the text.
 */
export function fitLogo(width: number, height: number) {
  if (!(width > 0) || !(height > 0)) return { w: 0, h: 0 };
  const scale = Math.min(LOGO_MAX_H / height, LOGO_MAX_W / width);
  return { w: width * scale, h: height * scale };
}

/**
 * A right-aligned figure sits flush against the next column's left-aligned text,
 * leaving only the two cells' padding between them - "1,000 Pending" reads as one
 * run. Extra padding on the right of numeric columns opens that gap. It must be on
 * the head cells too, or the heading stops lining up with the figures.
 */
const NUMERIC_STYLES = {
  halign: "right" as const,
  cellPadding: { top: 4, right: 14, bottom: 4, left: 4 },
};

/**
 * Head cells, with the alignment set on the cell itself.
 *
 * autoTable applies `columnStyles` to body cells only - jspdf.plugin.autotable.mjs
 * has `colStyles = sectionName === 'body' ? columnStyles : {}` - so a right-aligned
 * money column would otherwise get a left-aligned heading sitting over
 * right-aligned figures. Per-cell styles are merged last and do reach the head.
 */
export function pdfHeadCells(columns: ReportColumn[]) {
  return columns.map((c) => ({
    content: sanitize(reportColumnHeader(c)),
    styles: isNumeric(c) ? NUMERIC_STYLES : {},
  }));
}

/**
 * The totals line, styled per cell for the same reason the head is: autoTable's
 * `columnStyles` reaches the body only, so a figure set by it would sit under a
 * heading it no longer lines up with.
 *
 * Empty reads as empty, not as the "-" a body cell shows: a dash under Patient
 * on a totals line looks like a missing value rather than a column that has no
 * total.
 */
export function pdfFootCells(columns: ReportColumn[], totals: ReportRow) {
  return columns.map((c) => {
    const v = cellValue(c, totals);
    return {
      content: v === null || v === undefined || v === "" ? "" : sanitize(formatCell(c, v)),
      styles: isNumeric(c) ? NUMERIC_STYLES : {},
    };
  });
}

const presetLabel = (key?: string) =>
  REPORT_DATE_RANGE_OPTIONS.find((o) => o.key === key)?.label;

/**
 * One line describing what the reader is looking at. The concrete dates are always
 * printed next to the period name - "Current Month" means nothing once the file has
 * been emailed on.
 */
export async function describeFilters(
  report: ReportConfig,
  state: FilterState,
  dayOnly: boolean,
): Promise<string> {
  const parts: string[] = [];

  const from = state.dateFrom;
  const to = dayOnly ? from : state.dateTo;
  const dates =
    from && to
      ? from.getTime() === to.getTime()
        ? format(from, "dd MMM yyyy")
        : `${format(from, "dd MMM yyyy")} - ${format(to, "dd MMM yyyy")}`
      : "";
  const preset = dayOnly ? undefined : presetLabel(state.datePreset);
  if (dates) parts.push(preset && preset !== "Custom Date Range" ? `${preset} (${dates})` : dates);
  else if (preset) parts.push(preset);

  for (const f of report.filters) {
    const v = state.selects[f.key];
    if (!v) continue;
    if (f.type === "doctor") {
      // The select holds a staff id, not a name - resolve it, but only when set.
      const { data } = await supabase
        .from("staff")
        .select("first_name,last_name")
        .eq("id", v)
        .maybeSingle();
      const name = data ? `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim() : "";
      parts.push(name || f.label);
      continue;
    }
    const option = f.options?.find((o) => o.value === v);
    parts.push(option?.label ?? v);
  }

  if (state.search.trim()) parts.push(`Search: "${state.search.trim()}"`);

  return parts.join("  -  ");
}

/**
 * Fetch an image as raw bytes.
 *
 * jsPDF reads a Uint8Array directly and sniffs the format from the bytes, so there
 * is no need to go through Blob + FileReader to build a data: URL - and no
 * dependence on the server sending a sensible content-type. (An ArrayBuffer is not
 * accepted; it has to be a view.)
 */
async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("report pdf: logo fetch failed", url, res.status);
      return null;
    }
    return new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    console.warn("report pdf: logo could not be fetched", url, e);
    return null;
  }
}

interface ClinicHeader {
  name: string;
  lines: string[];
  logo: Uint8Array | null;
}

interface ClinicSettingsRow {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  pincode?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
}

async function loadClinicHeader(): Promise<ClinicHeader> {
  let clinic: ClinicSettingsRow | null = null;
  try {
    const { data } = await supabase.from("clinic_settings").select("*").limit(1).maybeSingle();
    clinic = data as ClinicSettingsRow | null;
  } catch {
    // A missing or unreadable settings row must not block the export.
  }

  // The admin-uploaded logo first, so a new upload in Settings reaches every
  // document; the bundled mark is the fallback and is always available.
  const logo =
    (clinic?.logo_url ? await fetchImageBytes(clinic.logo_url) : null) ??
    (await fetchImageBytes(bundledLogo));

  const address = [clinic?.address, clinic?.city, clinic?.pincode].filter(Boolean).join(", ");
  const contact = [clinic?.phone, clinic?.email].filter(Boolean).join("  |  ");

  return {
    name: clinic?.name || "The Skin Clinic",
    lines: [address, contact, clinic?.website].filter(Boolean).map(String),
    logo,
  };
}

export interface ReportPdfArgs {
  report: ReportConfig;
  rows: ReportRow[];
  summary: ReportSummaryCard[];
  filterState: FilterState;
  dayOnly: boolean;
  /** A line under the columns that get added up. */
  totals?: ReportRow | null;
  /** What the document counts, when a row is not a record - a bill split
   *  across its services is still one bill. */
  recordCount?: number;
  /**
   * What an empty cell prints. A dash says "nothing was recorded", which is
   * right on an ordinary row and wrong on the second line of a bill, where the
   * date and the patient are blank because they are already on the line above.
   */
  emptyCell?: string;
}

/** Summary boxes per row before wrapping, so each stays wide enough to read. */
export const SUMMARY_BOXES_PER_ROW = 4;
export const SUMMARY_BOX_HEIGHT = 40;
/** Room for the hint line under the figure. */
export const SUMMARY_BOX_HEIGHT_WITH_HINT = 52;
const SUMMARY_BOX_GAP = 10;

/**
 * Where each summary box goes, relative to the block's top-left corner.
 *
 * The boxes used to share one row however many there were, which was fine for
 * the three or four every report had. The Invoices report now shows one box
 * per payment instrument, and dividing the page width by eight leaves each too
 * narrow for the figure inside it - so they wrap instead, keeping the width a
 * full row of four would have.
 */
export function summaryBoxLayout(
  count: number,
  availableWidth: number,
  perRowLimit = SUMMARY_BOXES_PER_ROW,
  gap = SUMMARY_BOX_GAP,
  boxH = SUMMARY_BOX_HEIGHT,
) {
  const perRow = Math.max(1, Math.min(perRowLimit, count));
  const boxW = (availableWidth - gap * (perRow - 1)) / perRow;
  const boxes = Array.from({ length: Math.max(0, count) }, (_, i) => ({
    x: (i % perRow) * (boxW + gap),
    y: Math.floor(i / perRow) * (boxH + gap),
  }));
  const rows = Math.ceil(Math.max(0, count) / perRow);
  return { perRow, boxW, boxes, height: rows === 0 ? 0 : rows * (boxH + gap) - gap };
}

/** Assemble the document. Split from the save so the output can be inspected in tests. */
export async function buildReportPdf({ report, rows, summary, filterState, dayOnly, totals, recordCount, emptyCell }: ReportPdfArgs) {
  const [{ jsPDF }, { autoTable }, clinic, filterLine] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    loadClinicHeader(),
    describeFilters(report, filterState, dayOnly),
  ]);

  const landscape = report.columns.length > 6;
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 36;
  let y = margin;

  // Header: logo left, clinic identity beside it. Scaled to fit a box rather than
  // to a fixed height, so a wide letterhead-style mark cannot run into the text.
  let logoH = 0;
  let textX = margin;
  if (clinic.logo) {
    try {
      // Let jsPDF name the format from the bytes rather than guessing it from the
      // URL or the content-type.
      const props = doc.getImageProperties(clinic.logo);
      const fit = fitLogo(props.width, props.height);
      logoH = fit.h;
      doc.addImage(clinic.logo, props.fileType, margin, y, fit.w, fit.h);
      textX = margin + fit.w + 16;
    } catch (e) {
      // An unreadable image degrades to the name alone, as the invoice PDF does -
      // but it says so, rather than leaving a silent blank.
      console.warn("report pdf: logo could not be embedded", e);
    }
  }

  // Centre the clinic details against the logo, so a tall mark does not leave the
  // text hanging off the top of it.
  const textBlockH = 17 + clinic.lines.length * 12;
  const textTop = y + Math.max(0, (logoH - textBlockH) / 2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(sanitize(clinic.name), textX, textTop + 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  clinic.lines.forEach((line, i) => doc.text(sanitize(line), textX, textTop + 33 + i * 12));
  doc.setTextColor(0);

  y += Math.max(logoH, textBlockH + 16, 46);
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // Title block.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(sanitize(report.title), margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  if (report.description) {
    doc.text(sanitize(report.description), margin, y);
    y += 12;
  }
  if (filterLine) {
    doc.text(sanitize(filterLine), margin, y);
    y += 12;
  }
  doc.text(
    sanitize(`${(recordCount ?? rows.length).toLocaleString()} record(s)  -  generated ${format(new Date(), "dd MMM yyyy h:mm a")}`),
    margin,
    y,
  );
  doc.setTextColor(0);
  y += 16;

  // Summary boxes. Taller only when something needs a hint line, so every other
  // report keeps the geometry it had.
  if (summary.length) {
    const boxH = summary.some((s) => s.hint) ? SUMMARY_BOX_HEIGHT_WITH_HINT : SUMMARY_BOX_HEIGHT;
    const layout = summaryBoxLayout(summary.length, pageWidth - margin * 2, SUMMARY_BOXES_PER_ROW, undefined, boxH);
    summary.forEach((s, i) => {
      const x = margin + layout.boxes[i].x;
      const boxY = y + layout.boxes[i].y;
      doc.setDrawColor(215);
      doc.roundedRect(x, boxY, layout.boxW, boxH, 3, 3);
      doc.setFontSize(7.5);
      doc.setTextColor(110);
      doc.text(sanitize(s.label).toUpperCase(), x + 8, boxY + 14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text(sanitize(s.value), x + 8, boxY + 31);
      doc.setFont("helvetica", "normal");
      if (s.hint) {
        doc.setFontSize(6.5);
        doc.setTextColor(120);
        // A hint is the stored payment mode, so its length is the clinic's data,
        // not ours. Measure rather than guess a character count: splitTextToSize
        // gives the part that fits the box, and only that part is drawn.
        const [fitted] = doc.splitTextToSize(sanitize(s.hint), layout.boxW - 16);
        doc.text(fitted ?? "", x + 8, boxY + 44);
        doc.setTextColor(0);
      }
    });
    y += layout.height + 16;
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 34 },
    head: [pdfHeadCells(report.columns)],
    body: rows.map((r) => report.columns.map((c) => sanitize(reportCellText(c, r, emptyCell)))),
    ...(totals ? { foot: [pdfFootCells(report.columns, totals)] } : {}),
    // autoTable repeats the foot on every page by default, which would put a
    // running total that is not running at the bottom of each one.
    showFoot: "lastPage" as const,
    footStyles: { fillColor: [237, 242, 241], textColor: 20, fontStyle: "bold" as const },
    styles: {
      fontSize: 8,
      cellPadding: 4,
      overflow: "linebreak",
      // A rule down each column boundary. Without it the eye groups a right-aligned
      // figure with the left-aligned text beside it - autoTable spreads leftover
      // page width across the columns, so the gaps between them are uneven and a
      // short number can sit far from its own heading.
      lineWidth: { right: 0.5 },
      lineColor: [219, 224, 226],
    },
    headStyles: { fillColor: [13, 148, 136], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [247, 250, 249] },
    columnStyles: Object.fromEntries(
      report.columns.map((c, i) => [i, isNumeric(c) ? NUMERIC_STYLES : {}]),
    ),
    didDrawPage: (data) => {
      doc.setFontSize(8);
      doc.setTextColor(130);
      doc.text(
        sanitize(`${clinic.name}  -  ${report.title}`),
        margin,
        doc.internal.pageSize.getHeight() - 18,
      );
      doc.text(`Page ${data.pageNumber}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 18, { align: "right" });
      doc.setTextColor(0);
    },
  });

  return doc;
}

export async function downloadReportPdf(args: ReportPdfArgs) {
  const doc = await buildReportPdf(args);
  doc.save(`${args.report.key}-${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
