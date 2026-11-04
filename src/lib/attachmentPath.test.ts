import { describe, it, expect } from "vitest";
import { attachmentStoragePath, fileExtension } from "./attachmentPath";

const PATIENT = "841bffb7-7dc9-47cc-8bfe-f96dd808e3ed";

describe("fileExtension", () => {
  it("takes the last extension, lowercased", () => {
    expect(fileExtension("Prescription-Cheryl_Fernandes-D-6696.PDF")).toBe("pdf");
    expect(fileExtension("scan.report.jpeg")).toBe("jpeg");
  });

  it("falls back to bin when there is nothing to take", () => {
    expect(fileExtension("consent form")).toBe("bin");
    expect(fileExtension("trailing.")).toBe("bin");
    expect(fileExtension(".hidden")).toBe("bin");
    expect(fileExtension("")).toBe("bin");
  });

  it("ignores dots in the folders of a path", () => {
    expect(fileExtension("C:/my.files/report")).toBe("bin");
    expect(fileExtension("my.files/report.png")).toBe("png");
  });
});

describe("attachmentStoragePath", () => {
  it("files the object under the patient and keeps the extension", () => {
    expect(attachmentStoragePath(PATIENT, "Lab Report.pdf", 0, 1000, "abc123")).toBe(
      `${PATIENT}/1000_0_abc123.pdf`,
    );
  });

  it("never repeats a key within one batch", () => {
    // The whole point: Date.now() is the same for every file in a fast loop, so
    // the single-file naming would have collided and lost all but the first.
    const names = ["a.pdf", "b.pdf", "c.pdf", "d.pdf"];
    const paths = names.map((n, i) => attachmentStoragePath(PATIENT, n, i, 1000, "abc123"));
    expect(new Set(paths).size).toBe(names.length);
  });

  it("separates two batches that begin in the same millisecond", () => {
    expect(attachmentStoragePath(PATIENT, "a.pdf", 0, 1000, "aaaaaa")).not.toBe(
      attachmentStoragePath(PATIENT, "a.pdf", 0, 1000, "bbbbbb"),
    );
  });

  it("produces distinct real paths when nothing is stubbed", () => {
    const paths = ["a.pdf", "b.pdf", "c.pdf"].map((n, i) => attachmentStoragePath(PATIENT, n, i));
    expect(new Set(paths).size).toBe(3);
    paths.forEach((p) => expect(p.startsWith(`${PATIENT}/`)).toBe(true));
  });
});

describe("attachmentStoragePath in a batch", () => {
  it("gives every file in one loop a distinct key", () => {
    // The property the multi-file upload depends on. The single-file path it
    // replaced was `${patientId}/${Date.now()}.${ext}`, and in a loop several
    // files land in the same millisecond - Supabase then rejects the duplicate
    // key and only the first photo survives.
    const now = 1_700_000_000_000;
    const files = ["a.jpg", "b.jpg", "WhatsApp Image.jpeg", "WhatsApp Image.jpeg", "c.png"];
    const keys = files.map((name, i) => attachmentStoragePath("patient-1", name, i, now, "abc123"));
    expect(new Set(keys).size).toBe(files.length);
  });

  it("keeps the patient folder, so delete-by-prefix still works", () => {
    expect(attachmentStoragePath("patient-1", "a.jpg", 0)).toMatch(/^patient-1\//);
  });
});
