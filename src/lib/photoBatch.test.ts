import { describe, it, expect } from "vitest";
import { photoFileName, photoBatchMessage } from "./photoBatch";

describe("photoFileName", () => {
  it("keeps the patient's folder and the file's extension", () => {
    expect(photoFileName("pat-1", "photo-123.jpg", 0, 1000, "abcdef")).toBe("pat-1/1000-0-abcdef.jpg");
    expect(photoFileName("pat-1", "scan.PNG", 1, 1000, "abcdef")).toBe("pat-1/1000-1-abcdef.png");
  });

  it("never repeats a name inside one batch, even in the same millisecond", () => {
    // Two uploads starting in the same millisecond used to produce the same
    // name, and the second silently overwrote the first in storage.
    const names = [0, 1, 2, 3, 4].map((i) => photoFileName("pat-1", "photo.jpg", i, 1000, "abcdef"));
    expect(new Set(names).size).toBe(5);
  });

  it("falls back to jpg for a file with no usable extension", () => {
    expect(photoFileName("pat-1", "photo", 0, 1000, "abcdef")).toBe("pat-1/1000-0-abcdef.jpg");
    expect(photoFileName("pat-1", "photo.", 0, 1000, "abcdef")).toBe("pat-1/1000-0-abcdef.jpg");
  });
});

describe("photoBatchMessage", () => {
  it("counts what went in", () => {
    expect(photoBatchMessage({ uploaded: 1, failed: 0 })).toBe("Photo uploaded");
    expect(photoBatchMessage({ uploaded: 4, failed: 0 })).toBe("4 photos uploaded");
  });

  it("does not call a total failure a success", () => {
    expect(photoBatchMessage({ uploaded: 0, failed: 1 })).toBe("The photo could not be uploaded");
    expect(photoBatchMessage({ uploaded: 0, failed: 3 })).toBe("None of the 3 photos could be uploaded");
  });

  it("says plainly when a batch half worked", () => {
    // The case worth getting right: "Photos uploaded" over two silent failures
    // loses pictures nobody will think to take again.
    expect(photoBatchMessage({ uploaded: 3, failed: 2 })).toContain("3 uploaded, 2 could not be");
    expect(photoBatchMessage({ uploaded: 3, failed: 1 })).toContain("the one that failed is still here");
  });
});
