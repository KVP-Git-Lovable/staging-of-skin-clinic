import { describe, it, expect } from "vitest";
import { attachmentKind } from "./attachmentPreview";

describe("attachmentKind", () => {
  it("knows a photograph by its name", () => {
    expect(attachmentKind("I-53529.jpeg", "")).toBe("image");
    expect(attachmentKind("consent.PNG", "")).toBe("image");
    expect(attachmentKind("WhatsApp Image 2026-10-12 at 11.19.57 (2).jpeg", "")).toBe("image");
    expect(attachmentKind("scan.heic", "")).toBe("image");
  });

  it("falls back to the address when the name carries no suffix", () => {
    expect(attachmentKind("Consent form", "https://x/storage/v1/object/public/p/abc.jpg")).toBe("image");
  });

  it("knows a PDF, even behind a query string", () => {
    expect(attachmentKind("report.pdf", "")).toBe("pdf");
    expect(attachmentKind("", "https://x/report.pdf?token=abc")).toBe("pdf");
  });

  it("leaves anything else to be downloaded rather than previewed", () => {
    expect(attachmentKind("notes.docx", "https://x/notes.docx")).toBe("file");
    expect(attachmentKind("", "")).toBe("file");
    expect(attachmentKind(null, undefined)).toBe("file");
  });

  it("is not fooled by the word appearing mid-name", () => {
    // "pdf-summary.docx" is a Word file whatever it is called.
    expect(attachmentKind("pdf-summary.docx", "")).toBe("file");
    expect(attachmentKind("jpeg-notes.txt", "")).toBe("file");
  });
});
