import { describe, it, expect } from "vitest";
import { buildReviewCsv, csvField, reviewCsvFilename } from "./visitsReviewCsv";

/**
 * A minimal RFC 4180 reader, so a test can check what a SPREADSHEET would
 * see rather than what a naive split on commas sees. Only used here.
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(field); field = ""; }
    else field += c;
  }
  out.push(field);
  return out;
}

/**
 * The visits-to-review export.
 *
 * This file is passed round the clinic and worked through by hand, so a row
 * that shears into the wrong columns is worse than no export at all - a
 * reviewer would be reading one patient's date against another's name.
 */
describe("csvField", () => {
  it("leaves an ordinary value alone", () => {
    expect(csvField("Consultation")).toBe("Consultation");
    expect(csvField("Dr. Punya Suvarna")).toBe("Dr. Punya Suvarna");
  });

  it("quotes a value holding a comma, which clinic names do", () => {
    // "Shetty, Anil" unquoted would become two columns and push every
    // following field one place right for that row alone.
    expect(csvField("Shetty, Anil")).toBe('"Shetty, Anil"');
  });

  it("doubles inner quotes rather than ending the field early", () => {
    expect(csvField('Peel 20% "strong"')).toBe('"Peel 20% ""strong"""');
  });

  it("quotes a value containing a newline", () => {
    expect(csvField("Line one\nLine two")).toBe('"Line one\nLine two"');
  });

  it("defuses a value Excel would run as a formula", () => {
    // A service or note beginning with = + - or @ is executed on open. A
    // clinic spreadsheet must never do that.
    expect(csvField("=1+1")).toBe("'=1+1");
    expect(csvField("+91 9663438657")).toBe("'+91 9663438657");
    expect(csvField("-5% discount")).toBe("'-5% discount");
    expect(csvField("@everyone")).toBe("'@everyone");
  });

  it("writes nothing for nothing", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });
});

describe("buildReviewCsv", () => {
  const ROW = {
    appointment_id: "c9a52bd9-0046-4508-ac73-9c895755acc0",
    patient_id: "97c6bd7a-f43b-4b23-8b76-8a74c84d1201",
    patient_name: "Dia K",
    start_time: "2026-09-25T11:15:00+05:30",
    service: "Consultation",
    doctor_name: "Dr. Punya Suvarna",
    from_salesforce: true,
  };

  it("writes a header and one line per visit", () => {
    const csv = buildReviewCsv([ROW, { ...ROW, appointment_id: "second" }]);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Date,Time,Patient,Service,Doctor,Origin,Appointment ID,Patient ID");
  });

  it("writes the date and time the clinic reads, not an ISO string", () => {
    // The suite runs with TZ=Asia/Kolkata, which is the clinic's clock.
    const line = buildReviewCsv([ROW]).trim().split("\r\n")[1];
    expect(line.startsWith("25/09/2026,11:15 AM,Dia K,")).toBe(true);
  });

  it("names where the row came from, which is the clue a reviewer uses", () => {
    expect(buildReviewCsv([ROW])).toContain("Salesforce");
    expect(buildReviewCsv([{ ...ROW, from_salesforce: false }])).toContain("Created here");
  });

  it("keeps the columns intact when a name holds a comma", () => {
    // The row that would otherwise shear: every field after the name slides
    // one column right, so a reviewer reads one patient's date against
    // another's doctor.
    const line = buildReviewCsv([{ ...ROW, patient_name: "Shetty, Anil" }]).trim().split("\r\n")[1];
    expect(line).toContain('"Shetty, Anil"');
    expect(parseCsvLine(line)).toHaveLength(8);
    expect(parseCsvLine(line)[2]).toBe("Shetty, Anil");
  });

  it("survives a row with almost nothing in it", () => {
    const csv = buildReviewCsv([{ appointment_id: "x", start_time: "not a date" }]);
    expect(csv.trim().split("\r\n")).toHaveLength(2);
    expect(csv).toContain(",,"); // empty fields, not "undefined"
    expect(csv).not.toContain("undefined");
  });

  it("ends with a newline so the last row is not dropped", () => {
    expect(buildReviewCsv([ROW]).endsWith("\r\n")).toBe(true);
  });
});

describe("reviewCsvFilename", () => {
  it("carries the date so two exports do not overwrite each other", () => {
    expect(reviewCsvFilename(new Date("2026-11-03T10:00:00+05:30"))).toBe("visits-to-review-2026-11-03.csv");
  });
});
