import { describe, it, expect, vi } from "vitest";
import zlib from "node:zlib";
import type { ReportConfig } from "./reportsCatalog";

/**
 * End-to-end check on the generated document. The unit tests cover the formatting
 * helpers; this one catches the failures they cannot see - jsPDF throwing during
 * assembly, and any non-ASCII reaching the page (the rupee sign would be drawn as
 * the wrong glyph, silently, on every money figure in the report).
 */

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { first_name: "Vindhya", last_name: "Pai" } }) }),
        limit: () => ({
          maybeSingle: async () => ({
            data: {
              name: "The Skin Clinic",
              address: "Vyas Rao Lane, Kadri",
              city: "Mangalore",
              phone: "+91 6360 75 3030",
              email: "theskinclinic30@gmail.com",
              logo_url: null,
            },
          }),
        }),
      }),
    }),
  },
}));
vi.mock("@/assets/skin-clinic-logo.png", () => ({ default: "/logo.png" }));

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
global.fetch = vi.fn(async () => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.byteLength),
})) as unknown as typeof fetch;

const report = {
  key: "invoices",
  title: "Invoices & Revenue",
  description: "All invoices with paid and pending amounts.",
  columns: [
    { key: "invoice_number", label: "Invoice #" },
    { key: "patient_name", label: "Patient" },
    { key: "total_amount", label: "Total", type: "currency" },
    { key: "status", label: "Status", type: "badge" },
    { key: "created_at", label: "Date", type: "date" },
  ],
  filters: [
    { key: "dateRange", label: "Created", type: "dateRange" },
    { key: "doctor", label: "Doctor", type: "doctor" },
  ],
} as unknown as ReportConfig;

const rows = Array.from({ length: 120 }, (_, i) => ({
  invoice_number: `INV-${1000 + i}`,
  patient_name: `Patient ${i}`,
  total_amount: 1234 * (i + 1),
  status: i % 2 ? "Paid" : "Pending",
  created_at: "2026-09-11T06:30:00.000Z",
}));

/** Every literal string the document draws, with the point it was drawn at. */
function drawnRuns(bytes: Buffer): { x: number; y: number; text: string }[] {
  const out: { x: number; y: number; text: string }[] = [];
  for (const [, body] of bytes.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let data = body;
    try { data = zlib.inflateSync(Buffer.from(body, "latin1")).toString("latin1"); } catch { /* uncompressed */ }
    for (const [, x, y, t] of data.matchAll(/([\d.]+)\s+([\d.]+)\s+Td\s*\((.*?)\)\s*Tj/g))
      out.push({ x: Number(x), y: Number(y), text: t.replace(/\\([()])/g, "$1") });
  }
  return out;
}

/** Every literal string the document actually draws. */
function drawnText(bytes: Buffer): string[] {
  const out: string[] = [];
  for (const [, body] of bytes.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let data = body;
    try { data = zlib.inflateSync(Buffer.from(body, "latin1")).toString("latin1"); } catch { /* uncompressed */ }
    for (const [, s] of data.matchAll(/\((.*?)\)\s*Tj/g)) out.push(s.replace(/\\([()])/g, "$1"));
  }
  return out;
}

/** Every drawn string with the y it was drawn at (PDF y grows upwards). */
function drawnTextAt(bytes: Buffer): { text: string; y: number }[] {
  const out: { text: string; y: number }[] = [];
  for (const [, body] of bytes.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let data = body;
    try { data = zlib.inflateSync(Buffer.from(body, "latin1")).toString("latin1"); } catch { /* uncompressed */ }
    for (const [, y, text] of data.matchAll(/[\d.-]+\s+([\d.-]+)\s+Td\s*\((.*?)\)\s*Tj/g)) {
      out.push({ text: text.replace(/\\([()])/g, "$1"), y: Number(y) });
    }
  }
  return out;
}

const imageCount = (bytes: Buffer) => (bytes.toString("latin1").match(/\/Subtype\s*\/Image/g) || []).length;

/** Drawing operators inside the page content, after inflating it. */
function drawOps(bytes: Buffer) {
  let content = "";
  for (const [, body] of bytes.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let data = body;
    try { data = zlib.inflateSync(Buffer.from(body, "latin1")).toString("latin1"); } catch { /* uncompressed */ }
    if (data.includes("Tj")) content += data;
  }
  return { strokes: (content.match(/\bS\b/g) || []).length };
}

describe("report PDF", () => {
  it("draws the totals line once, at the end, lined up under its figures", async () => {
    const { buildReportPdf } = await import("./reportPdf");
    const doc = await buildReportPdf({
      report,
      rows: rows.slice(0, 3),
      summary: [],
      filterState: { search: "", dateFrom: null, dateTo: null, datePreset: "all", selects: {} },
      dayOnly: false,
      totals: { invoice_number: "TOTAL", total_amount: 7404 },
      recordCount: 3,
    });

    const buf = Buffer.from(doc.output("arraybuffer"));
    const at = drawnTextAt(buf);
    // Once: autoTable repeats a foot on every page unless told otherwise.
    expect(at.filter((r) => r.text === "TOTAL")).toHaveLength(1);

    const figure = at.find((r) => r.text === "7,404")!;
    expect(figure).toBeTruthy();
    // Under the rows, not among them. The page's origin is bottom-left, so
    // further down the page is a smaller y.
    const lastRow = at.find((r) => r.text === "INV-1002")!;
    expect(figure.y).toBeLessThan(lastRow.y);

    // Right-aligned to the same edge as the figures above it. columnStyles
    // does not reach a foot row either, so this is what catches a totals line
    // styled the wrong way.
    const runs = drawnRuns(buf);
    const foot = runs.find((r) => r.text === "7,404")!;
    const body = runs.find((r) => r.text === "3,702")!;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    const footRight = foot.x + doc.getTextWidth("7,404");
    doc.setFont("helvetica", "normal");
    const bodyRight = body.x + doc.getTextWidth("3,702");
    expect(Math.abs(footRight - bodyRight)).toBeLessThan(1);

    // The count is the records asked for, not the rows drawn.
    expect(at.some((r) => /^3 record\(s\)/.test(r.text))).toBe(true);
  });

  it("draws no totals line when a report has none", async () => {
    const { buildReportPdf } = await import("./reportPdf");
    const doc = await buildReportPdf({
      report,
      rows: rows.slice(0, 3),
      summary: [],
      filterState: { search: "", dateFrom: null, dateTo: null, datePreset: "all", selects: {} },
      dayOnly: false,
    });
    expect(drawnTextAt(Buffer.from(doc.output("arraybuffer"))).some((r) => r.text === "TOTAL")).toBe(false);
  });

  it("draws the hint under the figure, inside its box", async () => {
    const { buildReportPdf, SUMMARY_BOX_HEIGHT, SUMMARY_BOX_HEIGHT_WITH_HINT } = await import("./reportPdf");
    const doc = await buildReportPdf({
      report,
      rows: rows.slice(0, 3),
      summary: [
        { label: "Invoices", value: "35" },
        { label: "Total Billed", value: "Rs 1,94,800" },
        { label: "UPI", value: "Rs 1,44,000" },
        { label: "Other", value: "Rs 15,650", hint: "Part-Payment" },
      ],
      filterState: { search: "", dateFrom: null, dateTo: null, datePreset: "all", selects: {} },
      dayOnly: false,
    });

    const at = drawnTextAt(Buffer.from(doc.output("arraybuffer")));
    const yOf = (label: string) => at.find((t) => t.text === label)?.y;

    // The hint is drawn, below its own figure, and still above the box floor.
    expect(yOf("Part-Payment")).toBeDefined();
    expect(yOf("Part-Payment")!).toBeLessThan(yOf("Rs 15,650")!);
    expect(yOf("OTHER")! - yOf("Part-Payment")!).toBeLessThan(SUMMARY_BOX_HEIGHT_WITH_HINT);
    // A hint makes the boxes taller, so the table has to start lower than it
    // would without one.
    expect(yOf("Invoice #")!).toBeLessThan(yOf("Part-Payment")!);
    expect(SUMMARY_BOX_HEIGHT_WITH_HINT).toBeGreaterThan(SUMMARY_BOX_HEIGHT);
  });

  it("keeps the old box geometry for a summary with no hint", async () => {
    const { buildReportPdf, SUMMARY_BOX_HEIGHT } = await import("./reportPdf");
    const summary = [
      { label: "Invoices", value: "35" },
      { label: "Total Billed", value: "Rs 1,94,800" },
      { label: "UPI", value: "Rs 1,44,000" },
      { label: "Cash", value: "Rs 10,900" },
      { label: "Card", value: "Rs 24,250" },
    ];
    const doc = await buildReportPdf({
      report,
      rows: rows.slice(0, 3),
      summary,
      filterState: { search: "", dateFrom: null, dateTo: null, datePreset: "all", selects: {} },
      dayOnly: false,
    });
    const at = drawnTextAt(Buffer.from(doc.output("arraybuffer")));
    const yOf = (label: string) => at.find((t) => t.text === label)?.y;
    // Two rows of boxes, one gap between them - the untaller layout.
    expect(yOf("INVOICES")! - yOf("CARD")!).toBe(SUMMARY_BOX_HEIGHT + 10);
  });


  it("wraps a long summary onto a second row instead of squeezing it", async () => {
    // The Invoices report shows one box per payment instrument, so seven boxes
    // is now an ordinary day. On one row each would be ~55pt wide - narrower
    // than the figure printed inside it.
    const { buildReportPdf } = await import("./reportPdf");
    const doc = await buildReportPdf({
      report,
      rows: rows.slice(0, 3),
      summary: [
        { label: "Invoices", value: "35" },
        { label: "Total Billed", value: "Rs 1.95 L" },
        { label: "UPI", value: "Rs 1.1 L" },
        { label: "Cash", value: "Rs 32K" },
        { label: "Card", value: "Rs 28K" },
        { label: "Bank Transfer", value: "Rs 15K" },
        { label: "Cheque", value: "Rs 9K" },
      ],
      filterState: { search: "", dateFrom: null, dateTo: null, datePreset: "all", selects: {} },
      dayOnly: false,
    });

    const at = drawnTextAt(Buffer.from(doc.output("arraybuffer")));
    const yOf = (label: string) => at.find((t) => t.text === label)?.y;

    // All seven labels made it in - nothing was dropped off the edge.
    for (const label of ["INVOICES", "TOTAL BILLED", "UPI", "CASH", "CARD", "BANK TRANSFER", "CHEQUE"]) {
      expect(yOf(label), label).toBeDefined();
    }
    // Four across, then the rest on a row below it.
    expect(yOf("INVOICES")).toBe(yOf("CASH"));
    expect(yOf("CARD")).toBe(yOf("CHEQUE"));
    expect(yOf("CARD")!).toBeLessThan(yOf("INVOICES")!);
    // And the table starts below the boxes rather than on top of them.
    expect(yOf("Invoice #")!).toBeLessThan(yOf("CARD")!);
  });


  it("draws the clinic header, filters, summary and every row", async () => {
    const { buildReportPdf } = await import("./reportPdf");
    const doc = await buildReportPdf({
      report,
      rows,
      summary: [
        { label: "Invoices", value: "68" },
        { label: "Total Billed", value: "₹3.34 L" },
        { label: "Outstanding", value: "₹7.4K" },
      ],
      filterState: {
        search: "",
        dateFrom: new Date(2026, 8, 1),
        dateTo: new Date(2026, 8, 11),
        datePreset: "this_month",
        selects: { doctor: "some-uuid" },
      },
      dayOnly: false,
    });

    const bytes = Buffer.from(doc.output("arraybuffer"));
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const text = drawnText(bytes);

    expect(text).toContain("The Skin Clinic");
    expect(text).toContain("Invoices & Revenue");
    // The period is spelled out with real dates, and the doctor id is resolved.
    expect(text).toContain("Current Month (01 Sep 2026 - 11 Sep 2026) - Vindhya Pai");
    expect(text.some((t) => /^120 record\(s\) - generated \d{2} \w{3} \d{4} \d{1,2}:\d{2} [AP]M$/.test(t))).toBe(true);
    expect(text).toContain("Total (Rs)");
    expect(text).toContain("1,234");       // Indian grouping, no symbol
    expect(text).toContain("11/09/2026"); // dates formatted, not raw ISO
    expect(text).toContain("Rs 3.34 L");   // summary symbol swapped, not dropped

    // Every row made it in, across pages - not just the 50 shown on screen.
    expect(text).toContain("INV-1000");
    expect(text).toContain("INV-1119");
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(text).toContain(`Page ${doc.getNumberOfPages()}`);
  });

  it("right-aligns a money heading to the same edge as its figures", async () => {
    // Regression: autoTable ignores columnStyles for head cells, which left the
    // "Total (Rs)" heading left-aligned above right-aligned amounts.
    const { buildReportPdf } = await import("./reportPdf");
    const doc = await buildReportPdf({
      report,
      rows: [{ invoice_number: "INV-1", patient_name: "Suyog Hegde", total_amount: 1234, status: "Paid", created_at: "2026-09-11T06:30:00.000Z" }],
      summary: [],
      filterState: { search: "", dateFrom: new Date(2026, 8, 11), dateTo: new Date(2026, 8, 11), datePreset: "custom", selects: {} },
      dayOnly: false,
    });
    const runs = drawnRuns(Buffer.from(doc.output("arraybuffer")));
    const head = runs.find((r) => r.text === "Total (Rs)")!;
    const value = runs.find((r) => r.text === "1,234")!;
    expect(head).toBeTruthy();
    expect(value).toBeTruthy();

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    const headRight = head.x + doc.getTextWidth("Total (Rs)");
    doc.setFont("helvetica", "normal");
    const valueRight = value.x + doc.getTextWidth("1,234");
    expect(Math.abs(headRight - valueRight)).toBeLessThan(1);
  });

  it("leaves a readable gap between a right-aligned figure and the next column", async () => {
    // Regression: with only the default cell padding, the amount sat 8pt from
    // "Pending" and the two read as a single run.
    const { buildReportPdf } = await import("./reportPdf");
    const doc = await buildReportPdf({
      report,
      rows: [{ invoice_number: "INV-1", patient_name: "Rakesh Shetty", total_amount: 32000, status: "Pending", created_at: "2026-09-11T06:30:00.000Z" }],
      summary: [],
      filterState: { search: "", dateFrom: new Date(2026, 8, 11), dateTo: new Date(2026, 8, 11), datePreset: "custom", selects: {} },
      dayOnly: false,
    });
    const runs = drawnRuns(Buffer.from(doc.output("arraybuffer")));
    const amount = runs.find((r) => r.text === "32,000")!;
    const status = runs.find((r) => r.text === "Pending" && Math.abs(r.y - amount.y) < 0.5)!;
    expect(amount).toBeTruthy();
    expect(status).toBeTruthy();

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const gap = status.x - (amount.x + doc.getTextWidth("32,000"));
    expect(gap).toBeGreaterThan(14);
  });

  it("actually embeds the clinic logo", async () => {
    // The guard that was missing: the logo once vanished from the document while
    // every other test still passed, because nothing checked the image was there.
    const { buildReportPdf } = await import("./reportPdf");
    const doc = await buildReportPdf({
      report,
      rows: [{ invoice_number: "INV-1", patient_name: "Suyog Hegde", total_amount: 500, status: "Paid", created_at: "2026-09-11T06:30:00.000Z" }],
      summary: [],
      filterState: { search: "", dateFrom: new Date(2026, 8, 11), dateTo: new Date(2026, 8, 11), datePreset: "custom", selects: {} },
      dayOnly: false,
    });
    expect(imageCount(Buffer.from(doc.output("arraybuffer")))).toBeGreaterThanOrEqual(1);
  });

  it("rules a line between the columns so neighbours cannot read as one", async () => {
    const { buildReportPdf } = await import("./reportPdf");
    const doc = await buildReportPdf({
      report,
      rows: [{ invoice_number: "INV-1", patient_name: "Suyog Hegde", total_amount: 32000, status: "Pending", created_at: "2026-09-11T06:30:00.000Z" }],
      summary: [],
      filterState: { search: "", dateFrom: new Date(2026, 8, 11), dateTo: new Date(2026, 8, 11), datePreset: "custom", selects: {} },
      dayOnly: false,
    });
    // One stroked border per cell: 5 columns x (1 head + 1 body) = 10.
    expect(drawOps(Buffer.from(doc.output("arraybuffer"))).strokes).toBeGreaterThanOrEqual(10);
  });

  it("puts no character in the file that the PDF font cannot draw", async () => {
    const { buildReportPdf } = await import("./reportPdf");
    const doc = await buildReportPdf({
      report,
      rows: [{ invoice_number: "INV-1", patient_name: "Anushaᵗ – café", total_amount: 500, status: "Paid", created_at: "2026-09-11T06:30:00.000Z" }],
      summary: [{ label: "Total Billed", value: "₹1,00,000" }],
      filterState: { search: "", dateFrom: new Date(2026, 8, 11), dateTo: new Date(2026, 8, 11), datePreset: "custom", selects: {} },
      dayOnly: false,
    });

    const bytes = Buffer.from(doc.output("arraybuffer"));
    expect(bytes.includes(Buffer.from("₹", "utf8"))).toBe(false);
    for (const s of drawnText(bytes)) {
      expect(s, `non-ASCII reached the page: ${JSON.stringify(s)}`).toMatch(/^[\x20-\x7E]*$/);
    }
  });
});
