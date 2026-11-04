import { describe, it, expect } from "vitest";
import { photoFileName } from "./photoDownload";

const STORED = "https://brdrkhgfbbrgdkzdfbpr.supabase.co/storage/v1/object/public/patient-photos/8d6be5ca/1793167500224-0-mord0r.jpg";

describe("photoFileName", () => {
  it("names the file after the patient, the treatment and the day", () => {
    // Four photos saved from one viewer have to be tellable apart a week later;
    // "1793167500224-0-mord0r.jpg" four times over is not.
    expect(photoFileName({
      patientName: "Asha Rao",
      serviceName: "Hydra Signature",
      takenAt: "2026-10-29T10:00:00Z",
      url: STORED,
    })).toBe("Asha Rao - Hydra Signature - 29-10-2026.jpg");
  });

  it("leaves out what it does not know, rather than leaving a gap", () => {
    expect(photoFileName({ patientName: "Asha Rao", url: STORED }))
      .toBe("Asha Rao.jpg");
    expect(photoFileName({ patientName: "Asha Rao", takenAt: "2026-10-29T10:00:00Z", url: STORED }))
      .toBe("Asha Rao - 29-10-2026.jpg");
  });

  it("drops the trailing spaces real patient names carry", () => {
    // "Shaida " and "Ayesha " are both in the clinic's data as typed.
    expect(photoFileName({ patientName: "Shaida ", url: STORED })).toBe("Shaida.jpg");
  });

  it("removes the characters a filesystem refuses", () => {
    expect(photoFileName({
      patientName: 'A/B\\C:D*E?F"G<H>I|J',
      url: STORED,
    })).toBe("A B C D E F G H I J.jpg");
  });

  it("reads the extension from the path, not from a signed URL's token", () => {
    // The case that actually bites: a PNG whose query string ends in something
    // that looks like a different extension. Reading the whole URL saves it as
    // a .jpg - and a .jpg containing PNG bytes is a file some viewers refuse.
    expect(photoFileName({ patientName: "Asha Rao", url: "https://x.test/a/b.png?v=1.jpg" }))
      .toBe("Asha Rao.png");
    expect(photoFileName({ patientName: "Asha Rao", url: "https://x.test/a/b.webp#preview.jpg" }))
      .toBe("Asha Rao.webp");
    expect(photoFileName({ patientName: "Asha Rao", url: `${STORED}?token=eyJhbGciOi.AAA` }))
      .toBe("Asha Rao.jpg");
  });

  it("keeps the real extension when it is not a jpg", () => {
    expect(photoFileName({ patientName: "Asha Rao", url: "https://x.test/a/b.png" })).toBe("Asha Rao.png");
    expect(photoFileName({ patientName: "Asha Rao", url: "https://x.test/a/b.WEBP" })).toBe("Asha Rao.webp");
    expect(photoFileName({ patientName: "Asha Rao", url: "https://x.test/a/b.heic" })).toBe("Asha Rao.heic");
  });

  it("falls back to jpg when the URL says nothing useful", () => {
    expect(photoFileName({ patientName: "Asha Rao", url: "https://x.test/a/b" })).toBe("Asha Rao.jpg");
    expect(photoFileName({ patientName: "Asha Rao", url: "https://x.test/a/b.exe" })).toBe("Asha Rao.jpg");
    expect(photoFileName({ patientName: "Asha Rao", url: "" })).toBe("Asha Rao.jpg");
    expect(photoFileName({ patientName: "Asha Rao" })).toBe("Asha Rao.jpg");
  });

  it("still produces a usable name when nothing at all is known", () => {
    // ".jpg" alone is a hidden file on macOS and Linux.
    expect(photoFileName({})).toBe("photo.jpg");
    expect(photoFileName({ patientName: "   ", takenAt: "not a date", url: STORED })).toBe("photo.jpg");
  });

  it("ignores a date it cannot read instead of writing Invalid Date", () => {
    expect(photoFileName({ patientName: "Asha Rao", takenAt: "not a date", url: STORED }))
      .toBe("Asha Rao.jpg");
  });
});
