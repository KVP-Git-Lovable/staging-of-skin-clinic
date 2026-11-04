import { describe, it, expect } from "vitest";
import {
  dHashFromRgba,
  hammingDistance,
  isValidHash,
  matchQuality,
  matchQualityLabel,
  normaliseHash,
  HASH_BITS,
  HASH_HEX_LENGTH,
  NEAR_DUPLICATE_MAX,
} from "./photoHash";

/**
 * The case this was built for: a photo arrives on WhatsApp and nobody knows
 * whose record it belongs to. WhatsApp resizes and recompresses what it sends,
 * so the test images below are drawn from a continuous function and then
 * rendered at several sizes - the same picture, genuinely resampled, which is
 * what the hash has to see through.
 */

type Pattern = (u: number, v: number) => number;

/** A grey image of a pattern, at whatever size. Grey, so luminance is exact. */
const render = (width: number, height: number, pattern: Pattern) => {
  const px = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = pattern((x + 0.5) / width, (y + 0.5) / height);
      const i = (y * width + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = value;
      px[i + 3] = 255;
    }
  }
  return px;
};

// Peaks at 218, so the brightened copy below stays clear of the 255 ceiling.
const PHOTO: Pattern = (u, v) => 128 + 90 * Math.sin(u * 7) * Math.cos(v * 5);
const OTHER_PHOTO: Pattern = (u, v) => 128 + 90 * Math.cos(u * 3 + v * 9);

describe("dHashFromRgba", () => {
  it("is sixteen hex characters - the 64 bits the database compares", () => {
    const hash = dHashFromRgba(render(360, 320, PHOTO), 360, 320);
    expect(hash).toHaveLength(HASH_HEX_LENGTH);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(HASH_BITS).toBe(64);
  });

  it("gives the same answer every time for the same picture", () => {
    const pixels = render(200, 150, PHOTO);
    expect(dHashFromRgba(pixels, 200, 150)).toBe(dHashFromRgba(pixels, 200, 150));
  });

  it("sees through a resize - the WhatsApp case", () => {
    const full = dHashFromRgba(render(720, 640, PHOTO), 720, 640);
    const half = dHashFromRgba(render(360, 320, PHOTO), 360, 320);
    const thumb = dHashFromRgba(render(180, 160, PHOTO), 180, 160);
    expect(hammingDistance(full, half)).toBeLessThanOrEqual(NEAR_DUPLICATE_MAX);
    expect(hammingDistance(full, thumb)).toBeLessThanOrEqual(NEAR_DUPLICATE_MAX);
  });

  it("sees through a brightness change, because it compares rather than measures", () => {
    const normal = dHashFromRgba(render(300, 240, PHOTO), 300, 240);
    const brighter = dHashFromRgba(render(300, 240, (u, v) => PHOTO(u, v) + 20), 300, 240);
    expect(brighter).toBe(normal);
  });

  it("does not confuse one photograph with another", () => {
    const a = dHashFromRgba(render(360, 320, PHOTO), 360, 320);
    const b = dHashFromRgba(render(360, 320, OTHER_PHOTO), 360, 320);
    expect(hammingDistance(a, b)).toBeGreaterThan(NEAR_DUPLICATE_MAX);
  });

  it("copes with an image smaller than the grid it averages into", () => {
    expect(() => dHashFromRgba(render(4, 3, PHOTO), 4, 3)).not.toThrow();
    expect(dHashFromRgba(render(4, 3, PHOTO), 4, 3)).toHaveLength(HASH_HEX_LENGTH);
  });

  it("refuses a buffer that cannot hold the image it claims to be", () => {
    expect(() => dHashFromRgba(new Uint8ClampedArray(16), 100, 100)).toThrow(/smaller/);
    expect(() => dHashFromRgba(render(10, 10, PHOTO), 0, 10)).toThrow(/positive/);
    expect(() => dHashFromRgba(render(10, 10, PHOTO), 10.5, 10)).toThrow(/whole/);
  });
});

describe("hammingDistance", () => {
  it("is nothing at all between a hash and itself", () => {
    expect(hammingDistance("0f0f0f0f0f0f0f0f", "0f0f0f0f0f0f0f0f")).toBe(0);
  });

  it("counts single flipped bits", () => {
    expect(hammingDistance("0f0f0f0f0f0f0f0f", "0f0f0f0f0f0f0f0e")).toBe(1);
    expect(hammingDistance("0000000000000000", "0000000000000003")).toBe(2);
  });

  it("is all 64 between opposites", () => {
    expect(hammingDistance("ffffffffffffffff", "0000000000000000")).toBe(HASH_BITS);
  });

  it("does not care how a stored hash was cased or padded", () => {
    expect(hammingDistance("  0F0F0F0F0F0F0F0F  ", "0f0f0f0f0f0f0f0f")).toBe(0);
  });

  it("treats a missing or broken fingerprint as far away, never as a crash", () => {
    // A row whose phash never backfilled, or arrived malformed, must sink to
    // the bottom of a search rather than take the search down with it.
    expect(hammingDistance(null, "0f0f0f0f0f0f0f0f")).toBe(HASH_BITS);
    expect(hammingDistance("not a hash", "0f0f0f0f0f0f0f0f")).toBe(HASH_BITS);
    expect(hammingDistance("0f0f", "0f0f0f0f0f0f0f0f")).toBe(HASH_BITS);
    expect(hammingDistance("zzzzzzzzzzzzzzzz", "0f0f0f0f0f0f0f0f")).toBe(HASH_BITS);
  });
});

describe("normaliseHash", () => {
  it("accepts a real fingerprint and settles its case", () => {
    expect(normaliseHash("0F0F0F0F0F0F0F0F")).toBe("0f0f0f0f0f0f0f0f");
    expect(isValidHash("0f0f0f0f0f0f0f0f")).toBe(true);
  });

  it("rejects everything that is not one", () => {
    expect(normaliseHash("")).toBeNull();
    expect(normaliseHash(null)).toBeNull();
    expect(normaliseHash(undefined)).toBeNull();
    expect(normaliseHash(12345)).toBeNull();
    expect(normaliseHash("0f0f0f0f0f0f0f0")).toBeNull();   // 15
    expect(normaliseHash("0f0f0f0f0f0f0f0ff")).toBeNull(); // 17
    expect(isValidHash("ghijklmnopqrstuv")).toBe(false);
  });
});

describe("matchQuality", () => {
  it("names what the front desk is looking at", () => {
    expect(matchQuality(0)).toBe("identical");
    expect(matchQuality(1)).toBe("near");
    expect(matchQuality(NEAR_DUPLICATE_MAX)).toBe("near");
    expect(matchQuality(NEAR_DUPLICATE_MAX + 1)).toBe("possible");
    expect(matchQuality(16)).toBe("possible");
    expect(matchQuality(17)).toBe("different");
    expect(matchQuality(HASH_BITS)).toBe("different");
  });

  it("says so in words", () => {
    expect(matchQualityLabel(0)).toBe("Exact match");
    expect(matchQualityLabel(4)).toBe("Same photo");
    expect(matchQualityLabel(12)).toBe("Possible match");
    expect(matchQualityLabel(40)).toBe("Unlikely match");
  });

  it("is not thrown by a nonsense distance", () => {
    expect(matchQuality(-1)).toBe("different");
    expect(matchQuality(Number.NaN)).toBe("different");
  });
});
