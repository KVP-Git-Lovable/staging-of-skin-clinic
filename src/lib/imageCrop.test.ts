import { describe, expect, it } from "vitest";
import {
  MIN_CROP_PX, clampCrop, displayScale, displayToImage, fullCrop, isWholeImage,
  moveCrop, normaliseTurns, resizeCrop, rotateSize,
} from "@/lib/imageCrop";

/**
 * The arithmetic behind trimming a photographed page.
 *
 * The clinic photographs prescriptions and consent forms and the shot takes
 * in the desk. Everything here is in NATURAL IMAGE PIXELS; the picture is
 * shown scaled to fit a dialog, and mixing the two is how a crop comes out
 * shifted.
 */

const W = 4000;
const H = 3000;

describe("the box stays inside the picture", () => {
  it("starts as the whole of it", () => {
    expect(fullCrop(W, H)).toEqual({ x: 0, y: 0, width: W, height: H });
    expect(isWholeImage(fullCrop(W, H), W, H)).toBe(true);
  });

  it("pulls a box back from past the right and bottom edges", () => {
    // Past the edge, canvas quietly draws nothing - a crop that looks fine
    // and uploads a half-empty picture.
    expect(clampCrop({ x: 3900, y: 2900, width: 500, height: 500 }, W, H))
      .toEqual({ x: 3500, y: 2500, width: 500, height: 500 });
  });

  it("pulls a box back from past the left and top edges", () => {
    expect(clampCrop({ x: -200, y: -50, width: 500, height: 500 }, W, H))
      .toEqual({ x: 0, y: 0, width: 500, height: 500 });
  });

  it("will not let a box be bigger than the picture", () => {
    expect(clampCrop({ x: 0, y: 0, width: 9000, height: 9000 }, W, H))
      .toEqual({ x: 0, y: 0, width: W, height: H });
  });

  it("will not let a box be smaller than a deliberate drag", () => {
    const tiny = clampCrop({ x: 10, y: 10, width: 1, height: 1 }, W, H);
    expect(tiny.width).toBe(MIN_CROP_PX);
    expect(tiny.height).toBe(MIN_CROP_PX);
  });

  it("copes with a picture smaller than the minimum", () => {
    // A 10px favicon should not come back as a 24px crop of a 10px image.
    expect(clampCrop({ x: 0, y: 0, width: 10, height: 10 }, 10, 10)).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });
});

describe("dragging the whole box", () => {
  const start = { x: 1000, y: 800, width: 1000, height: 1000 };

  it("moves it without changing its size", () => {
    const moved = moveCrop(start, 200, -300, W, H);
    expect(moved).toEqual({ x: 1200, y: 500, width: 1000, height: 1000 });
  });

  it("stops at the edge rather than shrinking", () => {
    const moved = moveCrop(start, 9000, 9000, W, H);
    expect(moved).toEqual({ x: W - 1000, y: H - 1000, width: 1000, height: 1000 });
  });
});

describe("dragging one corner", () => {
  const start = { x: 1000, y: 1000, width: 1000, height: 1000 };

  it("pulls the top-left corner out, keeping the opposite one still", () => {
    const next = resizeCrop(start, "nw", -400, -200, W, H);
    expect(next).toEqual({ x: 600, y: 800, width: 1400, height: 1200 });
  });

  it("pushes the bottom-right corner out", () => {
    const next = resizeCrop(start, "se", 500, 300, W, H);
    expect(next).toEqual({ x: 1000, y: 1000, width: 1500, height: 1300 });
  });

  it("works the two mixed corners", () => {
    expect(resizeCrop(start, "ne", 300, -300, W, H)).toEqual({ x: 1000, y: 700, width: 1300, height: 1300 });
    expect(resizeCrop(start, "sw", -300, 300, W, H)).toEqual({ x: 700, y: 1000, width: 1300, height: 1300 });
  });

  it("never turns the rectangle inside out", () => {
    // A corner dragged past its opposite must stop dead. A negative width is
    // a region canvas accepts and renders as nothing at all.
    const crossed = resizeCrop(start, "nw", 5000, 5000, W, H);
    expect(crossed.width).toBeGreaterThanOrEqual(MIN_CROP_PX);
    expect(crossed.height).toBeGreaterThanOrEqual(MIN_CROP_PX);
    expect(crossed.x + crossed.width).toBeLessThanOrEqual(start.x + start.width);
  });

  it("will not drag a corner out of the picture", () => {
    const next = resizeCrop(start, "se", 9000, 9000, W, H);
    expect(next.x + next.width).toBeLessThanOrEqual(W);
    expect(next.y + next.height).toBeLessThanOrEqual(H);
  });

  it("leaves the opposite corner exactly where it was", () => {
    // Dragging the bottom-right past the edge must stop the box growing, not
    // slide the whole thing left - which is what happens if the growth is
    // left unbounded and the final clamp has to rescue it.
    const far = resizeCrop(start, "se", 9000, 9000, W, H);
    expect(far.x).toBe(start.x);
    expect(far.y).toBe(start.y);

    const other = resizeCrop(start, "nw", -9000, -9000, W, H);
    expect(other.x + other.width).toBe(start.x + start.width);
    expect(other.y + other.height).toBe(start.y + start.height);
  });
});

describe("turning it", () => {
  it("counts quarter turns whichever way it was pressed", () => {
    expect(normaliseTurns(0)).toBe(0);
    expect(normaliseTurns(4)).toBe(0);
    expect(normaliseTurns(5)).toBe(1);
    expect(normaliseTurns(-1)).toBe(3);
    expect(normaliseTurns(-5)).toBe(3);
  });

  it("swaps the sides on a quarter turn and not on a half", () => {
    expect(rotateSize(W, H, 1)).toEqual({ width: H, height: W });
    expect(rotateSize(W, H, 3)).toEqual({ width: H, height: W });
    expect(rotateSize(W, H, 2)).toEqual({ width: W, height: H });
    expect(rotateSize(W, H, 0)).toEqual({ width: W, height: H });
  });
});

describe("whether anything would actually change", () => {
  it("knows the untouched picture", () => {
    // "Use full photo" must hand back the ORIGINAL file. Re-encoding costs
    // quality on a page of small handwriting.
    expect(isWholeImage({ x: 0, y: 0, width: W, height: H }, W, H)).toBe(true);
    expect(isWholeImage({ x: 0.2, y: 0.4, width: W - 0.1, height: H + 0.3 }, W, H)).toBe(true);
  });

  it("knows a real crop", () => {
    expect(isWholeImage({ x: 0, y: 0, width: W - 2, height: H }, W, H)).toBe(false);
    expect(isWholeImage({ x: 3, y: 0, width: W, height: H }, W, H)).toBe(false);
  });
});

describe("a point on the screen, in image pixels", () => {
  // The picture shown at a quarter of its size, 100px from the top left.
  const box = { left: 100, top: 100, width: 1000, height: 750 };

  it("maps the middle to the middle", () => {
    expect(displayToImage({ x: 600, y: 475 }, box, W, H)).toEqual({ x: 2000, y: 1500 });
  });

  it("maps the corners to the corners", () => {
    expect(displayToImage({ x: 100, y: 100 }, box, W, H)).toEqual({ x: 0, y: 0 });
    expect(displayToImage({ x: 1100, y: 850 }, box, W, H)).toEqual({ x: W, y: H });
  });

  it("keeps a finger dragged off the picture inside it", () => {
    expect(displayToImage({ x: -500, y: -500 }, box, W, H)).toEqual({ x: 0, y: 0 });
    expect(displayToImage({ x: 9000, y: 9000 }, box, W, H)).toEqual({ x: W, y: H });
  });

  it("does not divide by a box that has not been laid out yet", () => {
    expect(displayToImage({ x: 5, y: 5 }, { left: 0, top: 0, width: 0, height: 0 }, W, H)).toEqual({ x: 0, y: 0 });
  });

  it("gives the scale a screen drag is multiplied by", () => {
    expect(displayScale(box, W, H)).toEqual({ x: 4, y: 4 });
    expect(displayScale({ width: 0, height: 0 }, W, H)).toEqual({ x: 1, y: 1 });
  });

  it("handles a picture that is not square", () => {
    // A 4000x3000 page shown in a 1000x750 box is 4x in both directions; a
    // single scale factor would skew every crop on a portrait photo.
    const portrait = { left: 0, top: 0, width: 300, height: 600 };
    expect(displayScale(portrait, 1200, 1800)).toEqual({ x: 4, y: 3 });
  });
});
