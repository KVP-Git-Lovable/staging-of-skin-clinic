/**
 * A photograph's fingerprint, for finding the same photograph again.
 *
 * The clinic's problem: a photo arrives on WhatsApp, or turns up on somebody's
 * phone, and nobody knows whose record it belongs to. There are 87,879 photos
 * across 5,821 patients, so finding it by eye is not an option.
 *
 * This is a dHash ("difference hash"). The picture is reduced to a 9x8 grid of
 * grey cells and each cell compared with the one to its right: brighter or not,
 * one bit each, 8 comparisons per row across 8 rows = 64 bits, written as 16
 * hex characters. Two photos are then compared by counting how many of those 64
 * bits differ - the Hamming distance.
 *
 * Why this and not an AI model: it costs nothing to run, there is no model to
 * call and no per-search charge, and because the whole thing happens in the
 * browser the photograph itself never leaves the device - only the 16
 * characters do. For patient photographs that matters.
 *
 * WHAT IT FINDS, and what it does not:
 *
 *   - It finds the SAME PHOTOGRAPH, through resizing, recompression and
 *     brightness changes. That is exactly what WhatsApp does to a picture when
 *     it is sent, which is the case this was built for.
 *   - It does NOT recognise a person or a lesion. A fresh photo of a patient
 *     taken today will not match their old ones; it is a different photograph.
 *   - Cropping and rotation defeat it. The grid no longer lines up.
 *
 * The downscale is done here, by hand, rather than left to the browser's canvas
 * or to whatever library the backfill happens to use. That is deliberate and it
 * is the whole reason this module exists separately: the search and the
 * backfill MUST produce the same hash for the same image, and two different
 * resize algorithms disagree in the low bits. Identical arithmetic on raw
 * pixels is what guarantees they agree - and it is what lets this be tested
 * from plain arrays, with no browser anywhere near it.
 */

/** 9 columns, because 8 comparisons per row need 9 cells. */
export const HASH_GRID_WIDTH = 9;
export const HASH_GRID_HEIGHT = 8;

/** (9 - 1) * 8 = 64 bits = 16 hex characters. */
export const HASH_BITS = (HASH_GRID_WIDTH - 1) * HASH_GRID_HEIGHT;
export const HASH_HEX_LENGTH = HASH_BITS / 4;

/**
 * At or under this many differing bits, treat it as the same photograph.
 *
 * 10 of 64 is the usual near-duplicate threshold and it leaves room for what
 * WhatsApp's recompression does to a picture without letting genuinely
 * different photos in.
 */
export const NEAR_DUPLICATE_MAX = 10;

/** Past this, it is a different photograph and is not worth showing. */
export const POSSIBLE_MAX = 16;

export type MatchQuality = "identical" | "near" | "possible" | "different";

const HEX = /^[0-9a-f]+$/;

/**
 * A hash in the one form everything else here expects, or null if it is not a
 * hash at all. Stored values come back from the database as text and could be
 * anything, so nothing trusts them without coming through this first.
 */
export function normaliseHash(hash: unknown): string | null {
  if (typeof hash !== "string") return null;
  const h = hash.trim().toLowerCase();
  if (h.length !== HASH_HEX_LENGTH || !HEX.test(h)) return null;
  return h;
}

export function isValidHash(hash: unknown): boolean {
  return normaliseHash(hash) !== null;
}

/**
 * Average the picture down into HASH_GRID_WIDTH x HASH_GRID_HEIGHT grey cells.
 *
 * A box filter - every source pixel inside a cell counts once - rather than
 * sampling single pixels, so that a photo and a resized copy of it land on the
 * same values instead of on whichever pixels each size happened to hit.
 *
 * Grey by luminance (0.299/0.587/0.114) rather than a flat average of the three
 * channels: it is how brightness is actually perceived, so a colour shift that
 * leaves the picture looking the same moves these numbers least.
 */
function downscaleToGrey(pixels: ArrayLike<number>, width: number, height: number): number[] {
  const cells: number[] = new Array(HASH_GRID_WIDTH * HASH_GRID_HEIGHT).fill(0);

  for (let gy = 0; gy < HASH_GRID_HEIGHT; gy++) {
    const y0 = Math.floor((gy * height) / HASH_GRID_HEIGHT);
    // At least one row, so an image shorter than the grid still gives every
    // cell something to average rather than dividing by zero.
    const y1 = Math.min(height, Math.max(y0 + 1, Math.floor(((gy + 1) * height) / HASH_GRID_HEIGHT)));

    for (let gx = 0; gx < HASH_GRID_WIDTH; gx++) {
      const x0 = Math.floor((gx * width) / HASH_GRID_WIDTH);
      const x1 = Math.min(width, Math.max(x0 + 1, Math.floor(((gx + 1) * width) / HASH_GRID_WIDTH)));

      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          sum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
          count += 1;
        }
      }
      cells[gy * HASH_GRID_WIDTH + gx] = count > 0 ? sum / count : 0;
    }
  }

  return cells;
}

/**
 * The fingerprint of an image given its raw RGBA pixels - what a canvas's
 * getImageData hands back, and what an image decoder in a backfill hands back.
 * Alpha is ignored: these are photographs, not graphics with transparency.
 */
export function dHashFromRgba(pixels: ArrayLike<number>, width: number, height: number): string {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("dHashFromRgba: width and height must be positive whole numbers");
  }
  if (pixels.length < width * height * 4) {
    throw new Error("dHashFromRgba: pixel buffer is smaller than width * height * 4");
  }

  const cells = downscaleToGrey(pixels, width, height);

  let hex = "";
  let nibble = 0;
  let bits = 0;
  for (let y = 0; y < HASH_GRID_HEIGHT; y++) {
    for (let x = 0; x < HASH_GRID_WIDTH - 1; x++) {
      const left = cells[y * HASH_GRID_WIDTH + x];
      const right = cells[y * HASH_GRID_WIDTH + x + 1];
      nibble = (nibble << 1) | (left > right ? 1 : 0);
      bits += 1;
      if (bits === 4) {
        hex += nibble.toString(16);
        nibble = 0;
        bits = 0;
      }
    }
  }
  return hex;
}

/**
 * How many of the 64 bits differ. 0 is the same picture; see
 * NEAR_DUPLICATE_MAX for where "the same photograph" stops.
 *
 * Anything that is not a hash counts as maximally distant rather than throwing:
 * a row with a missing or malformed fingerprint should drop quietly to the
 * bottom of a search, not take the search down with it.
 */
export function hammingDistance(a: unknown, b: unknown): number {
  const x = normaliseHash(a);
  const y = normaliseHash(b);
  if (!x || !y) return HASH_BITS;

  let distance = 0;
  for (let i = 0; i < HASH_HEX_LENGTH; i++) {
    let diff = parseInt(x[i], 16) ^ parseInt(y[i], 16);
    while (diff) {
      distance += diff & 1;
      diff >>= 1;
    }
  }
  return distance;
}

/** What to tell the person looking at the result. */
export function matchQuality(distance: number): MatchQuality {
  if (!Number.isFinite(distance) || distance < 0) return "different";
  if (distance === 0) return "identical";
  if (distance <= NEAR_DUPLICATE_MAX) return "near";
  if (distance <= POSSIBLE_MAX) return "possible";
  return "different";
}

/** The same thing in words, for the dropdown. */
export function matchQualityLabel(distance: number): string {
  switch (matchQuality(distance)) {
    case "identical":
      return "Exact match";
    case "near":
      return "Same photo";
    case "possible":
      return "Possible match";
    default:
      return "Unlikely match";
  }
}
