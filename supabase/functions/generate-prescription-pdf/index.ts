import { PDFDocument, PDFImage, PDFFont, PDFPage, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";
import { parsePrescriptionText } from "./prescriptionText.ts";
import { isPlaceholderService } from "./placeholderService.ts";
import { isRollUpOf } from "./procedureRollup.ts";
import { tableRowHeight, tableStartSpace } from "./pdfTableLayout.ts";

const BodySchema = z.object({
  procedureId: z.string().uuid(),
  mode: z.enum(["download", "upload"]).optional(),
});

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 32;
const FOOTER_TOP = 74;
const CONTENT_BOTTOM = 100;
const mint = rgb(0.72, 0.83, 0.73);
const blue = rgb(0.22, 0.43, 0.68);
const dark = rgb(0.08, 0.08, 0.08);
const lineGrey = rgb(0.3, 0.3, 0.3);

/**
 * Line breaks are content, not noise.
 *
 * This used to fold every control character into a space and then collapse all
 * whitespace, so a field written over several lines printed as one run-on
 * paragraph. Lab tests were the visible case - five tests on five lines in the
 * app arrived as "Vitamin d3 Viatmin B12 TSH Hb Serum ferittin" on the
 * document - but it flattened diagnosis, symptoms, prescriptions and notes
 * just the same.
 *
 * So newlines survive here and `wrap` lays them out. Everything else the PDF
 * font cannot draw is still replaced, and runs of spaces are still collapsed -
 * just not across a line ending.
 */
function sanitize(value: unknown): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]+/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E\n]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function shortNumFromUuid(uuid: string, digits = 4): string {
  const hex = uuid.replace(/-/g, "").slice(0, 8) || "0";
  const number = Number.parseInt(hex, 16) % Math.pow(10, digits);
  return String(number).padStart(digits, "0");
}

/**
 * The patient's age for the printed prescription.
 *
 * Under a year this reads in months. A baby's age in years is 0, which printed
 * "Age: 0" on the prescription - and the dose a doctor writes for a seven month
 * old is not the dose for a newborn, so that line has to say which.
 *
 * Counted by calendar month, matching patientAgeLabel in
 * src/lib/patientIdentity.ts, so the printed sheet and the record it was
 * written from say the same thing. (This file cannot import from src/.)
 */
function ageFromDob(dob?: string | null): string {
  if (!dob) return "";
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return "";
  const now = new Date();
  let months = (now.getFullYear() - born.getFullYear()) * 12 + (now.getMonth() - born.getMonth());
  if (now.getDate() < born.getDate()) months -= 1;
  if (months < 0) return "";
  const years = Math.floor(months / 12);
  if (years >= 1) return String(years);
  if (months === 0) return "<1 month";
  return months === 1 ? "1 month" : `${months} months`;
}

/** Word-wraps one line - no line breaks of its own. See `wrap`. */
function wrapOneLine(clean: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = clean.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = "";

  for (const originalWord of words) {
    let word = originalWord;
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) {
      lines.push(line);
      line = "";
    }
    while (font.widthOfTextAtSize(word, size) > maxWidth && word.length > 1) {
      let splitAt = word.length - 1;
      while (splitAt > 1 && font.widthOfTextAtSize(word.slice(0, splitAt), size) > maxWidth) splitAt -= 1;
      lines.push(word.slice(0, splitAt));
      word = word.slice(splitAt);
    }
    line = word;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Lays text out to `maxWidth`, keeping the author's own line breaks: each line
 * the writer typed starts a new line on the page, and is word-wrapped within
 * it. A prescription or a list of lab tests then reads on the document exactly
 * as it does on the screen.
 */
function wrap(text: unknown, font: PDFFont, size: number, maxWidth: number): string[] {
  const clean = sanitize(text);
  if (!clean) return [""];
  return clean.split("\n").flatMap((authorLine) =>
    authorLine.trim() ? wrapOneLine(authorLine, font, size, maxWidth) : [""]
  );
}

function drawFooter(page: PDFPage, font: PDFFont, bold: PDFFont, clinic: Record<string, unknown>) {
  const phone = sanitize(clinic.phone) || "+91 6360 75 3030, 9620 12 3030 | Mob: +91 9845 39 3030";
  const email = sanitize(clinic.email) || "theskinclinic30@gmail.com";
  const website = sanitize(clinic.website) || "www.theskinclinic.org.in";
  page.drawLine({ start: { x: MARGIN, y: FOOTER_TOP }, end: { x: PAGE_WIDTH - MARGIN, y: FOOTER_TOP }, thickness: 0.6, color: lineGrey });

  const lines = [
    `Clinic Phone: ${phone}`,
    `E-mail: ${email} | Website: ${website}`,
  ];
  lines.forEach((text, index) => {
    const display = sanitize(text);
    const textWidth = (index === 0 ? font : font).widthOfTextAtSize(display, 9);
    page.drawText(display, { x: Math.max(MARGIN, (PAGE_WIDTH - textWidth) / 2), y: 46 - index * 13, size: 9, font: index === 0 ? font : font, color: dark });
  });
  void bold;
}

function drawContinuedTitle(page: PDFPage, font: PDFFont) {
  const title = "Prescription Document (continued)";
  const width = font.widthOfTextAtSize(title, 15);
  page.drawText(title, { x: (PAGE_WIDTH - width) / 2, y: PAGE_HEIGHT - 42, size: 15, font, color: dark });
  page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - 55 }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 55 }, thickness: 0.8, color: blue });
}

async function embedLogo(pdfDoc: PDFDocument, logoUrl?: string | null): Promise<PDFImage | null> {
  if (!logoUrl) return null;
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "";
    return contentType.includes("png") ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
  } catch {
    return null;
  }
}

class NotFoundError extends Error {}

async function buildPrescriptionPdf(client: ReturnType<typeof createClient>, procedureId: string) {

  const { data: procedure, error: procedureError } = await client
    .from("procedures")
    .select("*, patients(*), staff!procedures_staff_id_fkey(*), appointments(*, staff!appointments_staff_id_fkey(*))")
    .eq("id", procedureId)
    .limit(1)
    .maybeSingle();
  if (procedureError) throw new Error(procedureError.message);
  if (!procedure) throw new NotFoundError("This prescription record could not be found.");


  const [
    { data: prescriptions, error: prescriptionError },
    { data: clinicData },
    { data: serviceLineRows },
    { data: stickyNoteRows },
  ] = await Promise.all([
    client.from("prescriptions").select("*").eq("procedure_id", procedureId).order("created_at"),
    client.from("clinic_settings").select("*").limit(1).maybeSingle(),
    client.from("procedure_services").select("*").eq("procedure_id", procedureId).order("sort_order"),
    client.from("procedure_sticky_notes").select("*").eq("procedure_id", procedureId).order("created_at"),
  ]);
  if (prescriptionError) throw new Error(prescriptionError.message);

  const clinic = (clinicData || {}) as Record<string, unknown>;
  const patient = procedure.patients || {};
  const staff = procedure.staff || procedure.appointments?.staff || {};
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedLogo(pdfDoc, typeof clinic.logo_url === "string" ? clinic.logo_url : null);
  const pages: PDFPage[] = [];
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pages.push(page);

  const addContinuationPage = () => {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    drawContinuedTitle(page, font);
    return PAGE_HEIGHT - 76;
  };

  const clinicName = sanitize(clinic.name) || "THE SKIN CLINIC";
  const clinicAddress = sanitize(clinic.address) || "VYAS RAO LANE, KADRI KAMBALA ROAD, MANGALORE - 575003";
  const clinicPhone = sanitize(clinic.phone) || "+91 6360-75-3030, 9620-12-3030";
  const clinicWebsite = sanitize(clinic.website) || "www.theskinclinic.org.in";

  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 160, width: PAGE_WIDTH, height: 160, color: mint });
  page.drawText(clinicName.toUpperCase(), { x: MARGIN, y: PAGE_HEIGHT - 32, size: 15, font: bold, color: dark });
  page.drawText(sanitize(`PHONE: ${clinicPhone} | WEBSITE: ${clinicWebsite}`), { x: MARGIN, y: PAGE_HEIGHT - 52, size: 8.5, font: bold, color: dark });
  for (const [index, addressLine] of wrap(clinicAddress.toUpperCase(), bold, 8.5, 370).slice(0, 2).entries()) {
    page.drawText(addressLine, { x: MARGIN, y: PAGE_HEIGHT - 70 - index * 11, size: 8.5, font: bold, color: dark });
  }

  const logoBoxX = PAGE_WIDTH - 142;
  const logoBoxY = PAGE_HEIGHT - 146;
  page.drawRectangle({ x: logoBoxX, y: logoBoxY, width: 122, height: 132, color: rgb(1, 1, 1) });
  if (logo) {
    const dimensions = logo.scaleToFit(112, 122);
    page.drawImage(logo, { x: logoBoxX + (122 - dimensions.width) / 2, y: logoBoxY + (132 - dimensions.height) / 2, width: dimensions.width, height: dimensions.height });
  } else {
    const fallback = "The Skin Clinic";
    page.drawText(fallback, { x: logoBoxX + 13, y: logoBoxY + 58, size: 13, font: bold, color: blue });
  }

  const doctorFirst = sanitize(staff.first_name);
  const doctorLast = sanitize(staff.last_name);
  const doctorName = [doctorFirst, doctorLast].filter(Boolean).join(" ");
  const displayDoctor = doctorName
    ? /^(dr\.?\s)/i.test(doctorName) ? doctorName.replace(/^dr\.?\s*/i, "Dr. ") : `Dr. ${doctorName}`
    : "Doctor";
  const qualification = sanitize(staff.specialization || staff.qualification || staff.role);
  const doctorPhone = sanitize(staff.phone);
  const prescriptionNo = `D-${shortNumFromUuid(procedure.id, 4)}`;
  const appointmentNo = `A-${shortNumFromUuid(procedure.appointment_id || procedure.id, 4)}`;
  const dateValue = new Date(procedure.procedure_date || procedure.created_at);
  const dateText = Number.isNaN(dateValue.getTime()) ? "" : dateValue.toLocaleDateString("en-GB");

  page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - 91 }, end: { x: logoBoxX - 12, y: PAGE_HEIGHT - 91 }, thickness: 0.7, color: blue });
  page.drawText(displayDoctor, { x: MARGIN + 18, y: PAGE_HEIGHT - 108, size: 11, font: bold, color: dark });
  if (qualification) page.drawText(qualification, { x: MARGIN + 18, y: PAGE_HEIGHT - 123, size: 10, font, color: dark });
  if (doctorPhone) page.drawText(doctorPhone, { x: MARGIN + 18, y: PAGE_HEIGHT - 138, size: 10, font, color: dark });
  page.drawText(`Prescription No: ${prescriptionNo}`, { x: 275, y: PAGE_HEIGHT - 108, size: 10, font, color: dark });
  page.drawText(`Date: ${dateText}`, { x: 305, y: PAGE_HEIGHT - 124, size: 10, font, color: dark });

  let y = PAGE_HEIGHT - 188;
  const title = "Prescription Document";
  page.drawText(title, { x: (PAGE_WIDTH - font.widthOfTextAtSize(title, 18)) / 2, y, size: 18, font, color: dark });
  y -= 18;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.8, color: blue });
  y -= 29;

  const patientName = sanitize(`${patient.first_name || ""} ${patient.last_name || ""}`) || "-";
  const infoRows = [
    ["Patient Name:", patientName, "Appointment No:", appointmentNo],
    ["Phone No:", sanitize(patient.phone) || "-", "Email Id:", sanitize(patient.email) || "-"],
    ["Age:", ageFromDob(patient.date_of_birth) || "-", "Sex:", sanitize(patient.gender) || "-"],
  ];
  for (const row of infoRows) {
    page.drawText(row[0], { x: MARGIN, y, size: 10, font: bold, color: dark });
    page.drawText(row[1], { x: 112, y, size: 10, font, color: dark });
    page.drawText(row[2], { x: 292, y, size: 10, font: bold, color: dark });
    const rightLines = wrap(row[3], font, 10, PAGE_WIDTH - 402 - MARGIN);
    page.drawText(rightLines[0] || "", { x: 402, y, size: 10, font, color: dark });
    y -= Math.max(18, rightLines.length * 12);
  }
  y -= 19;

  const ensureSpace = (heightNeeded: number) => {
    if (y - heightNeeded < CONTENT_BOTTOM) y = addContinuationPage();
  };

  const drawSection = (heading: string, content: unknown) => {
    const paragraphs = String(content ?? "").split(/\n+/).map(sanitize).filter(Boolean);
    if (!paragraphs.length) return;
    const lines = paragraphs.flatMap((paragraph) => wrap(paragraph, font, 10, PAGE_WIDTH - 2 * MARGIN - 10));
    ensureSpace(30);
    page.drawText(heading, { x: MARGIN, y, size: 11, font: bold, color: blue });
    y -= 15;
    for (const textLine of lines) {
      ensureSpace(15);
      page.drawText(textLine, { x: MARGIN + 8, y, size: 10, font, color: dark });
      y -= 13;
    }
    y -= 10;
  };

  const drawLabeledField = (label: string, value: unknown) => {
    const clean = sanitize(value);
    if (!clean) return;
    const lines = wrap(clean, font, 10, PAGE_WIDTH - 2 * MARGIN - 8);
    ensureSpace(13 + lines.length * 13);
    page.drawText(`${label}:`, { x: MARGIN, y, size: 10, font: bold, color: dark });
    y -= 13;
    for (const textLine of lines) {
      ensureSpace(13);
      page.drawText(textLine, { x: MARGIN + 8, y, size: 10, font, color: dark });
      y -= 13;
    }
    y -= 6;
  };

  const drawServicesTable = (serviceRows: { service: string; notes: string; recommendations: string }[]) => {
    if (!serviceRows.length) return;
    const tableX = MARGIN;
    const tableWidth = PAGE_WIDTH - 2 * MARGIN;
    const serviceWidth = 105;
    const notesWidth = Math.round((tableWidth - serviceWidth) / 2);
    const recWidth = tableWidth - serviceWidth - notesWidth;
    const colX = [tableX, tableX + serviceWidth, tableX + serviceWidth + notesWidth];

    // `reserve` is the first row that will follow this heading. Without it the
    // heading and the column header were placed wherever they themselves fitted,
    // and a tall first row then moved to the next page on its own - leaving an
    // empty table and most of a page of white space behind it.
    const drawHeader = (heading: string, reserve = 0) => {
      ensureSpace(tableStartSpace(22, reserve));
      page.drawText(heading, { x: MARGIN, y, size: 11, font: bold, color: blue });
      y -= 18;
      const height = 22;
      page.drawRectangle({ x: tableX, y: y - height + 6, width: tableWidth, height, borderColor: dark, borderWidth: 0.7 });
      page.drawLine({ start: { x: colX[1], y: y - height + 6 }, end: { x: colX[1], y: y + 6 }, thickness: 0.7, color: dark });
      page.drawLine({ start: { x: colX[2], y: y - height + 6 }, end: { x: colX[2], y: y + 6 }, thickness: 0.7, color: dark });
      page.drawText("Service", { x: colX[0] + 8, y: y - 9, size: 9, font: bold, color: dark });
      page.drawText("Procedure Notes", { x: colX[1] + 8, y: y - 9, size: 9, font: bold, color: dark });
      page.drawText("Recommendations", { x: colX[2] + 8, y: y - 9, size: 9, font: bold, color: dark });
      y -= height;
    };

    const heightOf = (row: { service: string; notes: string; recommendations: string }) =>
      tableRowHeight(
        wrap(row.service, font, 9, serviceWidth - 12).length,
        wrap(row.notes, font, 9, notesWidth - 12).length,
        wrap(row.recommendations, font, 9, recWidth - 12).length,
      );

    drawHeader("Procedure Details", heightOf(serviceRows[0]));

    for (const row of serviceRows) {
      const svcLines = wrap(row.service, font, 9, serviceWidth - 12);
      const notesLines = wrap(row.notes, font, 9, notesWidth - 12);
      const recLines = wrap(row.recommendations, font, 9, recWidth - 12);
      const rowHeight = tableRowHeight(svcLines.length, notesLines.length, recLines.length);
      if (y - rowHeight < CONTENT_BOTTOM) {
        y = addContinuationPage();
        drawHeader("Procedure Details (continued)");
      }
      page.drawRectangle({ x: tableX, y: y - rowHeight + 6, width: tableWidth, height: rowHeight, borderColor: dark, borderWidth: 0.7 });
      page.drawLine({ start: { x: colX[1], y: y - rowHeight + 6 }, end: { x: colX[1], y: y + 6 }, thickness: 0.7, color: dark });
      page.drawLine({ start: { x: colX[2], y: y - rowHeight + 6 }, end: { x: colX[2], y: y + 6 }, thickness: 0.7, color: dark });
      svcLines.forEach((line, index) => page.drawText(line, { x: colX[0] + 8, y: y - 9 - index * 12, size: 9, font, color: dark }));
      notesLines.forEach((line, index) => page.drawText(line, { x: colX[1] + 8, y: y - 9 - index * 12, size: 9, font, color: dark }));
      recLines.forEach((line, index) => page.drawText(line, { x: colX[2] + 8, y: y - 9 - index * 12, size: 9, font, color: dark }));
      y -= rowHeight;
    }
    y -= 10;
  };

  const drawKeyValueTable = (heading: string, fieldRows: { label: string; value: string }[]) => {
    if (!fieldRows.length) return;
    const tableX = MARGIN;
    const tableWidth = PAGE_WIDTH - 2 * MARGIN;
    const labelWidth = 140;
    const valueWidth = tableWidth - labelWidth;
    const colX = [tableX, tableX + labelWidth];

    const drawHeader = (title: string, reserve = 0) => {
      ensureSpace(tableStartSpace(22, reserve));
      page.drawText(title, { x: MARGIN, y, size: 11, font: bold, color: blue });
      y -= 18;
      const height = 22;
      page.drawRectangle({ x: tableX, y: y - height + 6, width: tableWidth, height, borderColor: dark, borderWidth: 0.7 });
      page.drawLine({ start: { x: colX[1], y: y - height + 6 }, end: { x: colX[1], y: y + 6 }, thickness: 0.7, color: dark });
      page.drawText("Field", { x: colX[0] + 8, y: y - 9, size: 9, font: bold, color: dark });
      page.drawText("Details", { x: colX[1] + 8, y: y - 9, size: 9, font: bold, color: dark });
      y -= height;
    };

    drawHeader(
      heading,
      tableRowHeight(
        wrap(fieldRows[0].label, font, 9, labelWidth - 12).length,
        wrap(fieldRows[0].value, font, 9, valueWidth - 12).length,
      ),
    );

    for (const row of fieldRows) {
      const labelLines = wrap(row.label, font, 9, labelWidth - 12);
      const valueLines = wrap(row.value, font, 9, valueWidth - 12);
      const rowHeight = tableRowHeight(labelLines.length, valueLines.length);
      if (y - rowHeight < CONTENT_BOTTOM) {
        y = addContinuationPage();
        drawHeader(`${heading} (continued)`);
      }
      page.drawRectangle({ x: tableX, y: y - rowHeight + 6, width: tableWidth, height: rowHeight, borderColor: dark, borderWidth: 0.7 });
      page.drawLine({ start: { x: colX[1], y: y - rowHeight + 6 }, end: { x: colX[1], y: y + 6 }, thickness: 0.7, color: dark });
      labelLines.forEach((line, index) => page.drawText(line, { x: colX[0] + 8, y: y - 9 - index * 12, size: 9, font: bold, color: dark }));
      valueLines.forEach((line, index) => page.drawText(line, { x: colX[1] + 8, y: y - 9 - index * 12, size: 9, font, color: dark }));
      y -= rowHeight;
    }
    y -= 10;
  };

  /** The name the importer uses when Salesforce recorded no treatment at all. */

  // A "Consultation" service name is not a procedure - it means "the patient
  // was seen". 10,586 of these rows carry procedure notes and 9,178 carry
  // recommendations, so the text must not be lost: it prints under a "Visit
  // notes" heading above the table instead of inside it. Real services stay in
  // the Procedure Details table; when no real service remains, the table is
  // not drawn at all.
  const allServiceRows = (serviceLineRows && serviceLineRows.length
    ? serviceLineRows.map((s: Record<string, unknown>) => ({ service: s.service_name, notes: s.procedure_notes, recommendations: s.recommendations }))
    : [{ service: procedure.service_name, notes: procedure.procedure_notes, recommendations: procedure.recommendations }]
  )
    .map((r) => ({ service: sanitize(r.service), notes: sanitize(r.notes), recommendations: sanitize(r.recommendations) }))
    .filter((r) => r.service)
    // One service, once. A visit holds a service a single time - the database
    // enforces it now - but a prescription the clinic prints must not repeat a
    // treatment even if a copy ever reaches it from somewhere else. Identical
    // rows collapse; two rows that differ in what the doctor wrote both stay,
    // because that is not a copy.
    .filter((row, index, rows) =>
      rows.findIndex(
        (other) =>
          other.service.trim().toLowerCase() === row.service.trim().toLowerCase() &&
          other.notes === row.notes &&
          other.recommendations === row.recommendations,
      ) === index,
    );

  const consultationRows = allServiceRows.filter((r) => isPlaceholderService(r.service));
  const visitNotesText = consultationRows
    .flatMap((r) => [r.notes, r.recommendations].filter(Boolean))
    .join("\n")
    .trim();

  const serviceRows = allServiceRows
    .filter((r) => !isPlaceholderService(r.service))
    // An empty column is left empty. It used to print "-", which reads as
    // though something was recorded and found to be nothing: a treatment the
    // doctor wrote nothing against came out as "SERVICE | - | -". 323 of the
    // last 9,509 service lines are that. wrap("") gives one empty line, the
    // same height a dash took, so nothing in the table shifts.
    .map((r) => ({ service: r.service, notes: r.notes, recommendations: r.recommendations }));

  // The same lines in the shape the shared roll-up rule expects. It never saw
  // the "-" placeholders that used to be substituted above, and still does not.
  const rollUpLines = allServiceRows.map((r) => ({
    service_name: r.service,
    procedure_notes: r.notes,
    recommendations: r.recommendations,
  }));

  /**
   * The visit's own notes - the procedure notes and recommendations attached to
   * the "Consultation" placeholder row. These are not a service performed, so
   * they print under their own heading above the Procedure Details table, the
   * same way Special Instructions does, instead of being squeezed into a table
   * column. The text is never dropped: 10,586 rows carry notes, 9,178 carry
   * recommendations.
   */
  const drawVisitNotes = () => {
    const text = sanitize(visitNotesText);
    if (!text) return;
    ensureSpace(30);
    page.drawText("Visit notes", { x: MARGIN, y, size: 11, font: bold, color: blue });
    y -= 15;
    for (const textLine of wrap(text, font, 10, PAGE_WIDTH - 2 * MARGIN - 8)) {
      ensureSpace(13);
      page.drawText(textLine, { x: MARGIN + 8, y, size: 10, font, color: dark });
      y -= 13;
    }
    y -= 10;
  };

  /**
   * The visit's special instructions, under their own heading.
   *
   * These (Salesforce's Special_Instructions__c, filled on 17,581 visits) only
   * ever appeared squeezed into a column of the Procedure Details table, where
   * the clinic could not find them. They get their own labelled block - but
   * only when the table is not already printing the same words, however many
   * services the visit has.
   */
  const drawSpecialInstructions = () => {
    const text = sanitize(procedure.recommendations);
    if (!text) return;
    // Skip it when it is nothing more than the roll-up of the lines already
    // printed in Procedure Details. This used to compare a raw line ("1v2")
    // against the prefixed parent ("FILLERS: 1v2"), so on any visit with two
    // services it never matched and the same words printed twice - once in the
    // table, once here. Same rule as the screen; see procedureRollup.ts beside
    // this file, and keep the two in step.
    if (isRollUpOf(text, rollUpLines, "recommendations")) return;
    if (visitNotesText.split(/\n/).includes(text)) return;
    ensureSpace(30);
    page.drawText("Special Instructions", { x: MARGIN, y, size: 11, font: bold, color: blue });
    y -= 15;
    for (const textLine of wrap(text, font, 10, PAGE_WIDTH - 2 * MARGIN - 8)) {
      ensureSpace(13);
      page.drawText(textLine, { x: MARGIN + 8, y, size: 10, font, color: dark });
      y -= 13;
    }
    y -= 10;
  };

  // This visit's own findings first, then the patient's standing history.
  // Diagnosis and Symptoms used to be loose sections above Procedure Details,
  // and Lab Tests was not on the document at all. Empty rows stay hidden, as
  // every row here always has.
  const medicalFields: [string, unknown][] = [
    ["Diagnosis", procedure.diagnosis],
    // Kept in step with src/lib/medicalFields.ts - the screen and the document
    // must head these the same way.
    ["Symptoms", procedure.symptoms || procedure.consultation_notes],
    ["Lab Tests", procedure.lab_tests],
    ["History/Examination details", patient.medical_history],
    ["Current Medications", patient.current_medications],
    ["Dietary Advice", patient.dietary_advice],
    ["Previous Treatments", patient.previous_treatments],
    ["Skin Type", patient.skin_type],
  ];
  const medicalRows = medicalFields
    .map(([label, value]) => ({ label, value: sanitize(value) }))
    .filter((row) => row.value);

  const noteRows = (stickyNoteRows || [])
    .map((note: Record<string, unknown>) => ({ title: sanitize(note.title), content: sanitize(note.content) }))
    .filter((note) => note.content);
  const drawNotes = () => {
  if (noteRows.length) {
    ensureSpace(30);
    page.drawText("Notes", { x: MARGIN, y, size: 11, font: bold, color: blue });
    y -= 15;
    for (const note of noteRows) {
      if (note.title) {
        drawLabeledField(note.title, note.content);
        continue;
      }
      const lines = wrap(note.content, font, 10, PAGE_WIDTH - 2 * MARGIN - 8);
      for (const textLine of lines) {
        ensureSpace(13);
        page.drawText(textLine, { x: MARGIN + 8, y, size: 10, font, color: dark });
        y -= 13;
      }
      y -= 6;
    }
    y -= 4;
  }
  };

  const drawMedications = () => {
  // Structured prescription rows are what this app writes when a doctor
  // prescribes here. The 25,346 visits imported from Salesforce have no such
  // rows - their medicines are one free-text field, which used to mean the
  // Products/Medications table simply did not appear on those documents even
  // though the visit had a prescription. So fall back to that text, read by
  // the same parser the screen uses.
  const structured = (prescriptions || []).map((prescription: Record<string, unknown>, index: number) => {
    const details = [prescription.dosage, prescription.frequency, prescription.duration ? `for ${prescription.duration}` : "", prescription.instructions]
      .map(sanitize)
      .filter(Boolean)
      .join(" - ");
    return { serial: String(index + 1), product: sanitize(prescription.medicine_name) || "-", instruction: details || "-" };
  });
  // Only Salesforce-imported visits keep medicines in procedure_notes; on an
  // app-entered visit that field is the doctor's clinical notes.
  const rows = structured.length || !procedure.sf_id
    ? structured
    : parsePrescriptionText(procedure.procedure_notes as string | null).map((item, index) => ({
        serial: String(index + 1),
        product: sanitize(item.product) || "-",
        instruction: sanitize(item.instruction) || "-",
      }));

  if (rows.length) {
    const tableX = MARGIN;
    const tableWidth = PAGE_WIDTH - 2 * MARGIN;
    const serialWidth = 50;
    const productWidth = 170;
    const instructionWidth = tableWidth - serialWidth - productWidth;
    const drawTableHeader = () => {
      const height = 24;
      page.drawRectangle({ x: tableX, y: y - height + 6, width: tableWidth, height, borderColor: dark, borderWidth: 0.7 });
      page.drawLine({ start: { x: tableX + serialWidth, y: y - height + 6 }, end: { x: tableX + serialWidth, y: y + 6 }, thickness: 0.7, color: dark });
      page.drawLine({ start: { x: tableX + serialWidth + productWidth, y: y - height + 6 }, end: { x: tableX + serialWidth + productWidth, y: y + 6 }, thickness: 0.7, color: dark });
      page.drawText("S.No", { x: tableX + 13, y: y - 9, size: 9, font: bold, color: dark });
      page.drawText("Product", { x: tableX + serialWidth + 60, y: y - 9, size: 9, font: bold, color: dark });
      page.drawText("Instruction", { x: tableX + serialWidth + productWidth + 92, y: y - 9, size: 9, font: bold, color: dark });
      y -= height;
    };

    ensureSpace(
      tableStartSpace(
        24,
        tableRowHeight(
          wrap(rows[0].product, font, 9, productWidth - 12).length,
          wrap(rows[0].instruction, font, 9, instructionWidth - 12).length,
        ),
      ),
    );
    page.drawText("Products/Medications", { x: MARGIN, y, size: 11, font: bold, color: blue });
    y -= 18;
    drawTableHeader();

    for (const row of rows) {
      const productLines = wrap(row.product, font, 9, productWidth - 12);
      const instructionLines = wrap(row.instruction, font, 9, instructionWidth - 12);
      const rowHeight = tableRowHeight(productLines.length, instructionLines.length);
      if (y - rowHeight < CONTENT_BOTTOM) {
        y = addContinuationPage();
        page.drawText("Products/Medications (continued)", { x: MARGIN, y, size: 11, font: bold, color: blue });
        y -= 18;
        drawTableHeader();
      }
      page.drawRectangle({ x: tableX, y: y - rowHeight + 6, width: tableWidth, height: rowHeight, borderColor: dark, borderWidth: 0.7 });
      page.drawLine({ start: { x: tableX + serialWidth, y: y - rowHeight + 6 }, end: { x: tableX + serialWidth, y: y + 6 }, thickness: 0.7, color: dark });
      page.drawLine({ start: { x: tableX + serialWidth + productWidth, y: y - rowHeight + 6 }, end: { x: tableX + serialWidth + productWidth, y: y + 6 }, thickness: 0.7, color: dark });
      page.drawText(row.serial, { x: tableX + 22, y: y - 9, size: 9, font, color: dark });
      productLines.forEach((line, index) => page.drawText(line, { x: tableX + serialWidth + 6, y: y - 9 - index * 12, size: 9, font, color: dark }));
      instructionLines.forEach((line, index) => page.drawText(line, { x: tableX + serialWidth + productWidth + 6, y: y - 9 - index * 12, size: 9, font, color: dark }));
      y -= rowHeight;
    }
    y -= 10;
  }
  };

  // The order the document reads in: what was found, what was given, what was
  // done, then anything written alongside it.
  drawKeyValueTable("Medical Information", medicalRows);
  drawMedications();
  drawVisitNotes();
  drawSpecialInstructions();
  drawServicesTable(serviceRows);
  drawNotes();

  pages.forEach((pdfPage) => drawFooter(pdfPage, font, bold, clinic));
  const bytes = await pdfDoc.save();
  const safeName = patientName.replace(/[^A-Za-z0-9_-]+/g, "_");
  return { bytes, filename: `Prescription-${safeName}-${prescriptionNo}.pdf`, patient };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // An empty or malformed body must read as a validation error, not crash the function.
    let rawBody: unknown = null;
    try {
      rawBody = await req.json();
    } catch {
      rawBody = null;
    }
    const parsed = BodySchema.safeParse(rawBody);

    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const backendUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!backendUrl || !serviceKey) throw new Error("Backend environment is not configured");
    const client = createClient(backendUrl, serviceKey);
    const { bytes, filename, patient } = await buildPrescriptionPdf(client, parsed.data.procedureId);

    if (parsed.data.mode === "upload") {
      const path = `prescriptions/${parsed.data.procedureId}/${filename}`;
      const { error: uploadError } = await client.storage.from("procedure-attachments").upload(path, bytes, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw uploadError;
      const { data: publicData } = client.storage.from("procedure-attachments").getPublicUrl(path);
      await client.from("procedure_attachments").insert({
        procedure_id: parsed.data.procedureId,
        patient_id: patient?.id || null,
        file_url: publicData.publicUrl,
        file_name: filename,
        notes: "Auto-generated prescription PDF",
      });
      return new Response(JSON.stringify({ ok: true, url: publicData.publicUrl, filename, phone: patient?.phone || null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
    return new Response(JSON.stringify({ ok: true, base64: btoa(binary), filename }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("generate-prescription-pdf error:", error);

    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
