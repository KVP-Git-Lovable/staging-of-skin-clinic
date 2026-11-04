import { dHashFromRgba } from "./photoHash";

/**
 * Turning an actual photograph into a fingerprint.
 *
 * Deliberately thin. Everything worth testing - the downscale, the comparison,
 * the thresholds - lives in photoHash.ts and is tested there from plain arrays.
 * All this does is get raw pixels out of a file or a URL and hand them over,
 * because that part needs a browser and cannot be tested without one.
 *
 * Nothing here ever throws at the caller. A photo that cannot be decoded - an
 * iPhone HEIC, a corrupt file, a URL that will not load - returns null, and the
 * caller carries on without a fingerprint. An upload must never fail because a
 * fingerprint could not be taken, and a search must never break on one bad
 * file.
 */

/**
 * Decode no larger than this on the longest edge.
 *
 * The hash only ever looks at a 9x8 grid, so decoding a 12-megapixel clinical
 * photo at full size would be wasted work on a phone. Scaling down first is
 * safe: the hash is a comparison of averaged regions, and the tests show a
 * picture and a copy a sixteenth of its size hashing within a single bit of
 * each other. Proportional, never stretched - distorting the aspect ratio
 * WOULD change the hash, because the grid is 9x8 whatever shape the photo is.
 */
const MAX_DECODE_EDGE = 512;

type Pixels = { data: Uint8ClampedArray; width: number; height: number };

function makeCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas | null {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function pixelsFromBlob(blob: Blob): Promise<Pixels | null> {
  if (typeof createImageBitmap === "undefined") return null;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > MAX_DECODE_EDGE ? MAX_DECODE_EDGE / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = makeCanvas(width, height);
    if (!canvas) return null;
    // willReadFrequently: this canvas exists only to be read back once.
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) return null;

    ctx.drawImage(bitmap, 0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    return { data: image.data, width, height };
  } catch {
    return null;
  } finally {
    bitmap?.close?.();
  }
}

/** The fingerprint of a file the clinic chose or photographed, or null. */
export async function hashImageFile(file: Blob): Promise<string | null> {
  const pixels = await pixelsFromBlob(file);
  if (!pixels) return null;
  try {
    return dHashFromRgba(pixels.data, pixels.width, pixels.height);
  } catch {
    return null;
  }
}

/**
 * The fingerprint of a photo already in the bucket, fetched rather than read
 * from disk. Used by the backfill.
 *
 * fetch + blob rather than an <img> tag on purpose: an <img> drawn to a canvas
 * taints it and getImageData then throws, whereas a fetched blob does not.
 */
export async function hashImageUrl(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await hashImageFile(blob);
  } catch {
    return null;
  }
}

/**
 * A Supabase Storage URL rewritten to ask for a smaller rendering of the same
 * image: /object/public/... becomes /render/image/public/...?width=N.
 *
 * This is what makes a backfill over 87,879 photos reasonable - a few kilobytes
 * each instead of a megabyte each. Width only, so the image keeps its shape;
 * forcing both dimensions would stretch it and change the hash.
 *
 * Returns null for a URL that is not a public storage object, and the caller
 * falls back to the original. Image transformation is a paid Supabase feature,
 * so it may simply not answer - the backfill checks before it relies on it.
 */
export function thumbnailUrl(url: string, width = 256): string | null {
  if (!url.includes("/storage/v1/object/public/")) return null;
  const rendered = url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  return `${rendered}${rendered.includes("?") ? "&" : "?"}width=${width}&quality=80`;
}
