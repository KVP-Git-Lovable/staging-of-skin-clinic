import { describe, it, expect } from "vitest";
import { thumbnailUrl } from "./photoHashImage";

/**
 * The only part of photoHashImage that can be tested without a browser - and
 * the part most likely to be got wrong, since a backfill over 87,879 photos
 * either fetches a few kilobytes each or a megabyte each depending on it.
 */

const PUBLIC =
  "https://brdrkhgfbbrgdkzdfbpr.supabase.co/storage/v1/object/public/patient-photos/abc/123.jpg";

describe("thumbnailUrl", () => {
  it("points a public storage URL at the render endpoint instead", () => {
    expect(thumbnailUrl(PUBLIC)).toBe(
      "https://brdrkhgfbbrgdkzdfbpr.supabase.co/storage/v1/render/image/public/patient-photos/abc/123.jpg?width=256&quality=80"
    );
  });

  it("asks for a width and never a height, so the photo keeps its shape", () => {
    // Pinning both dimensions would stretch the picture, and a stretched
    // picture hashes as a different picture - the grid is 9x8 regardless.
    const url = thumbnailUrl(PUBLIC, 128) ?? "";
    expect(url).toContain("width=128");
    expect(url).not.toContain("height=");
  });

  it("keeps a query string that was already there", () => {
    expect(thumbnailUrl(`${PUBLIC}?v=2`)).toContain("?v=2&width=256");
  });

  it("declines anything that is not a public storage object", () => {
    expect(thumbnailUrl("https://example.com/photo.jpg")).toBeNull();
    expect(thumbnailUrl("https://x.supabase.co/storage/v1/object/sign/p/a.jpg")).toBeNull();
    expect(thumbnailUrl("")).toBeNull();
  });
});
