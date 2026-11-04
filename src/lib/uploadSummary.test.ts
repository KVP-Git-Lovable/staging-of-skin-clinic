import { describe, it, expect } from "vitest";
import { uploadSuccessMessage, uploadFailureMessage } from "./uploadSummary";

describe("uploadSuccessMessage", () => {
  it("says nothing when nothing uploaded", () => {
    expect(uploadSuccessMessage(0, "Photo", "photos")).toBeNull();
    expect(uploadSuccessMessage(-1, "Photo", "photos")).toBeNull();
  });

  it("uses the singular for one", () => {
    expect(uploadSuccessMessage(1, "Photo", "photos")).toBe("Photo uploaded");
    expect(uploadSuccessMessage(1, "Attachment", "attachments")).toBe("Attachment uploaded");
  });

  it("counts the rest", () => {
    expect(uploadSuccessMessage(5, "Photo", "photos")).toBe("5 photos uploaded");
    expect(uploadSuccessMessage(2, "Attachment", "attachments")).toBe("2 attachments uploaded");
  });
});

describe("uploadFailureMessage", () => {
  it("says nothing when everything worked", () => {
    expect(uploadFailureMessage([], 7)).toBeNull();
  });

  it("names every file that failed, with why", () => {
    const msg = uploadFailureMessage(
      [
        { index: 1, name: "scan-a.jpg", reason: "Payload too large" },
        { index: 4, name: "scan-b.png", reason: "Network error" },
      ],
      7,
    );
    expect(msg).toBe("2 of 7 could not be uploaded — scan-a.jpg: Payload too large; scan-b.png: Network error");
  });

  it("names the single failure rather than just counting it", () => {
    // "1 failed" would send staff back through all five to find it.
    expect(uploadFailureMessage([{ index: 0, name: "x.jpg", reason: "Denied" }], 5))
      .toBe("1 of 5 could not be uploaded — x.jpg: Denied");
  });

  it("copes with two files sharing a name", () => {
    const msg = uploadFailureMessage(
      [
        { index: 0, name: "WhatsApp Image.jpeg", reason: "Denied" },
        { index: 3, name: "WhatsApp Image.jpeg", reason: "Timeout" },
      ],
      4,
    );
    expect(msg).toContain("WhatsApp Image.jpeg: Denied");
    expect(msg).toContain("WhatsApp Image.jpeg: Timeout");
  });
});
