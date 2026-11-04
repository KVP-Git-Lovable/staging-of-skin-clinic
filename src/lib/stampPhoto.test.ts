import { describe, it, expect } from "vitest";
import { captionFontSize, coordLine, fitWithin, stampCaption, stampGeometry, stampPhotoOrOriginal } from "./stampPhoto";

describe("stampCaption", () => {
  it("reads dd/mm/yyyy with a 12-hour clock, as the rest of the clinic does", () => {
    expect(stampCaption(new Date(2026, 10, 2, 9, 42))).toBe("02/11/2026 · 09:42 AM");
  });

  it("pads the day, month, hour and minute so the band never jumps width", () => {
    expect(stampCaption(new Date(2026, 0, 5, 8, 7))).toBe("05/01/2026 · 08:07 AM");
  });

  it("gets the two times a 12-hour clock usually gets wrong", () => {
    // Midnight is 12 AM and noon is 12 PM - not 00 and not 12 AM.
    expect(stampCaption(new Date(2026, 10, 2, 0, 5))).toContain("12:05 AM");
    expect(stampCaption(new Date(2026, 10, 2, 12, 5))).toContain("12:05 PM");
  });

  it("puts the afternoon in the afternoon", () => {
    expect(stampCaption(new Date(2026, 10, 2, 18, 30))).toContain("06:30 PM");
    expect(stampCaption(new Date(2026, 10, 2, 23, 59))).toContain("11:59 PM");
  });
});

describe("captionFontSize", () => {
  it("scales with the picture, so it reads the same on any phone", () => {
    expect(captionFontSize(1280)).toBeGreaterThan(captionFontSize(640));
  });

  it("never goes so small it cannot be read", () => {
    // A tiny upload used to produce one-pixel text, which is no caption at all.
    expect(captionFontSize(100)).toBeGreaterThanOrEqual(11);
    expect(captionFontSize(0)).toBeGreaterThanOrEqual(11);
  });
});

describe("coordLine", () => {
  it("writes the fix to five decimals, which is metres", () => {
    // toFixed ROUNDS, it does not truncate - 74.843217 becomes 74.84322.
    expect(coordLine(12.871453, 74.843217)).toBe("12.87145, 74.84322");
    expect(coordLine(12.8714, 74.8432)).toBe("12.87140, 74.84320");
  });

  it("says nothing when there was no fix", () => {
    // The caption still gets its time line - gating the WHOLE caption on a
    // GPS fix is how the reference ended up with photos carrying nothing at
    // all when somebody stood somewhere with no signal.
    expect(coordLine(null, null)).toBe("");
    expect(coordLine(undefined, undefined)).toBe("");
    expect(coordLine(12.87, null)).toBe("");
    expect(coordLine(null, 74.84)).toBe("");
  });

  it("refuses a nonsense coordinate rather than printing NaN on the photo", () => {
    expect(coordLine(Number.NaN, 74.84)).toBe("");
    expect(coordLine(Infinity, 74.84)).toBe("");
  });

  it("keeps a southern or western fix negative", () => {
    expect(coordLine(-33.86785, -151.20732)).toBe("-33.86785, -151.20732");
  });
});

describe("stampPhotoOrOriginal", () => {
  it("hands back the original photo rather than throwing", async () => {
    // jsdom has no real canvas, so stamping fails here exactly as it would on
    // a phone whose canvas is unavailable. A caption is worth having; it is
    // not worth refusing somebody's attendance over, so the photo must still
    // come back.
    const original = new Blob(["not really a jpeg"], { type: "image/jpeg" });
    const out = await stampPhotoOrOriginal(original, { at: new Date(2026, 10, 3, 9, 42) });
    expect(out).toBe(original);
  });

  it("still returns the photo when a location was supplied", async () => {
    const original = new Blob(["not really a jpeg"], { type: "image/jpeg" });
    const out = await stampPhotoOrOriginal(original, {
      at: new Date(2026, 10, 3, 9, 42),
      address: "Vyasa Rao Road, Mangalore",
      lat: 12.871453,
      lng: 74.843217,
    });
    expect(out).toBe(original);
  });
});

describe("fitWithin", () => {
  it("leaves an image that already fits completely alone", () => {
    expect(fitWithin(640, 480, 800)).toEqual({ width: 640, height: 480 });
    // Exactly on the limit is still "fits".
    expect(fitWithin(800, 600, 800)).toEqual({ width: 800, height: 600 });
  });

  it("NEVER upscales a small image", () => {
    // Blowing a 320px webcam frame up to 800px invents detail the face
    // matcher would then read as if it were real.
    expect(fitWithin(320, 240, 800)).toEqual({ width: 320, height: 240 });
  });

  it("shrinks a 12MP phone photo to the long edge, keeping the shape", () => {
    // The case that matters: an iPhone native capture via the fallback.
    expect(fitWithin(4032, 3024, 800)).toEqual({ width: 800, height: 600 });
  });

  it("measures the LONGEST edge, so portrait shrinks by its height", () => {
    // A phone held upright is the normal case for a selfie. Capping on width
    // would leave a 3024x4032 portrait 4032px tall.
    expect(fitWithin(3024, 4032, 800)).toEqual({ width: 600, height: 800 });
  });

  it("treats a missing, zero or negative max as no limit", () => {
    // Clinical photography passes nothing and must keep full resolution.
    expect(fitWithin(1920, 1080)).toEqual({ width: 1920, height: 1080 });
    expect(fitWithin(1920, 1080, null)).toEqual({ width: 1920, height: 1080 });
    expect(fitWithin(1920, 1080, 0)).toEqual({ width: 1920, height: 1080 });
    expect(fitWithin(1920, 1080, -800)).toEqual({ width: 1920, height: 1080 });
    expect(fitWithin(1920, 1080, Number.NaN)).toEqual({ width: 1920, height: 1080 });
  });

  it("keeps at least one pixel on the short edge", () => {
    // A freak aspect ratio would otherwise round the short side to 0 and
    // produce a canvas that cannot be drawn to.
    expect(fitWithin(4000, 3, 800)).toEqual({ width: 800, height: 1 });
  });

  it("hands back nonsense dimensions rather than dividing by them", () => {
    expect(fitWithin(0, 0, 800)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(Number.NaN, 100, 800).width).toBeNaN();
  });
});

describe("stampGeometry", () => {
  it("sizes the caption from the FINAL width, not the source", () => {
    // The whole point of bundling these. A 4032px phone photo capped at 800
    // must get an 800px-sized caption; measuring the source would draw a
    // 105px band onto an 800px image and swallow an eighth of the picture.
    const g = stampGeometry(4032, 3024, 800);
    expect(g).toEqual({ width: 800, height: 600, fontSize: captionFontSize(800) });
    expect(g.fontSize).not.toBe(captionFontSize(4032));
  });

  it("is unchanged from the old behaviour when no cap is given", () => {
    // Clinical photography passes no maxEdge and must be byte-identical to
    // before this change.
    expect(stampGeometry(1920, 1080)).toEqual({
      width: 1920, height: 1080, fontSize: captionFontSize(1920),
    });
  });
});
