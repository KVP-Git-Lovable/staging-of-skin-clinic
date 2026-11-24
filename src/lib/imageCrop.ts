/**
 * The geometry behind cropping a photographed page.
 *
 * The clinic photographs prescriptions and consent forms with the app's
 * camera, and the shot takes in the desk, a hand and the edge of a file.
 * There was no way to trim it, so this is the arithmetic that lets them -
 * kept away from the DOM so it can be proved rather than only looked at.
 *
 * Every rectangle here is in NATURAL IMAGE PIXELS, never in screen pixels.
 * The picture is shown scaled to fit a dialog, so the two differ by whatever
 * that scale happens to be; mixing them is how a crop comes out shifted.
 */

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A crop box smaller than this is a mis-drag, not an intention. */
export const MIN_CROP_PX = 24;

export const fullCrop = (width: number, height: number): CropRect => ({ x: 0, y: 0, width, height });

const clampNumber = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/**
 * Put a rectangle back inside the picture.
 *
 * Width and height are settled first, because a box wider than the image
 * cannot then be moved into it - and a box that keeps a stale width would
 * silently crop past the right edge, where canvas quietly draws nothing.
 */
export function clampCrop(rect: CropRect, imageW: number, imageH: number, min = MIN_CROP_PX): CropRect {
  // The upper bound wins over the lower one, so a picture smaller than the
  // minimum comes back whole rather than as an impossible crop of itself.
  const width = clampNumber(rect.width, min, imageW);
  const height = clampNumber(rect.height, min, imageH);
  return {
    width,
    height,
    x: clampNumber(rect.x, 0, imageW - width),
    y: clampNumber(rect.y, 0, imageH - height),
  };
}

/** Dragging the whole box. Its size never changes - it just stops at the edge. */
export function moveCrop(rect: CropRect, dx: number, dy: number, imageW: number, imageH: number): CropRect {
  return {
    width: rect.width,
    height: rect.height,
    x: clampNumber(rect.x + dx, 0, Math.max(0, imageW - rect.width)),
    y: clampNumber(rect.y + dy, 0, Math.max(0, imageH - rect.height)),
  };
}

export type CropCorner = "nw" | "ne" | "sw" | "se";

/**
 * Dragging one corner.
 *
 * Worked as two edges rather than as a box: a corner pulled past its opposite
 * must stop dead, not turn the rectangle inside out and crop a negative
 * region - which canvas accepts and renders as nothing at all.
 */
export function resizeCrop(
  rect: CropRect,
  corner: CropCorner,
  dx: number,
  dy: number,
  imageW: number,
  imageH: number,
  min = MIN_CROP_PX,
): CropRect {
  let { x, y, width, height } = rect;
  const right = x + width;
  const bottom = y + height;

  if (corner === "nw" || corner === "sw") {
    const nextX = clampNumber(x + dx, 0, right - min);
    width = right - nextX;
    x = nextX;
  } else {
    width = clampNumber(width + dx, min, imageW - x);
  }

  if (corner === "nw" || corner === "ne") {
    const nextY = clampNumber(y + dy, 0, bottom - min);
    height = bottom - nextY;
    y = nextY;
  } else {
    height = clampNumber(height + dy, min, imageH - y);
  }

  return clampCrop({ x, y, width, height }, imageW, imageH, min);
}

/** Quarter turns, always 0-3, whichever way and however many times it was pressed. */
export const normaliseTurns = (turns: number) => ((Math.trunc(turns) % 4) + 4) % 4;

/** What the picture measures after turning: a quarter turn swaps the sides. */
export function rotateSize(width: number, height: number, turns: number): { width: number; height: number } {
  return normaliseTurns(turns) % 2 === 1 ? { width: height, height: width } : { width, height };
}

/**
 * Whether this crop would change anything.
 *
 * "Use full photo" must hand back the ORIGINAL file, untouched. Re-encoding
 * it would cost quality and size for no reason, and on a page of small
 * handwriting that is the difference between legible and not.
 */
export function isWholeImage(rect: CropRect, imageW: number, imageH: number): boolean {
  return (
    Math.round(rect.x) === 0 &&
    Math.round(rect.y) === 0 &&
    Math.round(rect.width) === Math.round(imageW) &&
    Math.round(rect.height) === Math.round(imageH)
  );
}

/**
 * A point on the picture as it is SHOWN, in natural image pixels.
 *
 * `box` is the displayed image's bounding rectangle. An off-by-one here is a
 * crop that lands slightly off everywhere, which looks like the handles being
 * inaccurate rather than like a bug.
 */
export function displayToImage(
  point: { x: number; y: number },
  box: { left: number; top: number; width: number; height: number },
  imageW: number,
  imageH: number,
): { x: number; y: number } {
  if (box.width <= 0 || box.height <= 0) return { x: 0, y: 0 };
  return {
    x: clampNumber(((point.x - box.left) / box.width) * imageW, 0, imageW),
    y: clampNumber(((point.y - box.top) / box.height) * imageH, 0, imageH),
  };
}

/** The scale a drag in screen pixels is multiplied by to become image pixels. */
export function displayScale(box: { width: number; height: number }, imageW: number, imageH: number): { x: number; y: number } {
  return {
    x: box.width > 0 ? imageW / box.width : 1,
    y: box.height > 0 ? imageH / box.height : 1,
  };
}
