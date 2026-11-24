import { describe, expect, it } from "vitest";
import {
  applyViewTransform,
  compareFileName,
  compareLayout,
  coverRect,
  drawPhoto,
  EXPORT_PHOTO_BACKGROUND,
  type Box,
  type DrawTarget,
  type ViewTransform,
} from "./compareExport";

/**
 * The saved comparison has to be the comparison that was on screen.
 *
 * jsdom has no 2D context, so the context is recorded instead: every call is
 * captured, the matrix it builds is multiplied out, and that matrix is checked
 * against the one the CSS transform defines - worked out here by hand, from
 * the CSS rules, rather than by calling the code under test.
 */

type Op = { op: string; args: number[] };

interface Recorder extends DrawTarget {
  ops: Op[];
  drawn: { x: number; y: number; w: number; h: number } | null;
  texts: { text: string; x: number; y: number; align: CanvasTextAlign }[];
}

function recorder(): Recorder {
  const r: Recorder = {
    ops: [],
    drawn: null,
    texts: [],
    fillStyle: "",
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    save() { r.ops.push({ op: "save", args: [] }); },
    restore() { r.ops.push({ op: "restore", args: [] }); },
    beginPath() { r.ops.push({ op: "beginPath", args: [] }); },
    rect(x, y, w, h) { r.ops.push({ op: "rect", args: [x, y, w, h] }); },
    clip() { r.ops.push({ op: "clip", args: [] }); },
    translate(x, y) { r.ops.push({ op: "translate", args: [x, y] }); },
    scale(x, y) { r.ops.push({ op: "scale", args: [x, y] }); },
    rotate(a) { r.ops.push({ op: "rotate", args: [a] }); },
    drawImage(_img, x, y, w, h) {
      r.ops.push({ op: "drawImage", args: [x, y, w, h] });
      r.drawn = { x, y, w, h };
    },
    fillRect(x, y, w, h) { r.ops.push({ op: "fillRect", args: [x, y, w, h] }); },
    fillText(text, x, y) { r.texts.push({ text, x, y, align: r.textAlign }); },
    measureText: (t: string) => ({ width: t.length * 8 }),
  };
  return r;
}

/** [a, b, c, d, e, f] as canvas orders them, i.e. the DOMMatrix 2D form. */
type M = [number, number, number, number, number, number];
const IDENTITY: M = [1, 0, 0, 1, 0, 0];

function mul(m: M, n: M): M {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
const T = (x: number, y: number): M => [1, 0, 0, 1, x, y];
const S = (k: number): M => [k, 0, 0, k, 0, 0];
const R = (deg: number): M => {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
};

/** Replay the recorded ops into a matrix, the way a canvas would. */
function matrixOf(ops: Op[]): M {
  let m = IDENTITY;
  for (const { op, args } of ops) {
    if (op === "translate") m = mul(m, T(args[0], args[1]));
    else if (op === "scale") m = mul(m, S(args[0]));
    else if (op === "rotate") m = mul(m, R((args[0] * 180) / Math.PI));
  }
  return m;
}

const apply = (m: M, x: number, y: number) => ({
  x: m[0] * x + m[2] * y + m[4],
  y: m[1] * x + m[3] * y + m[5],
});

const BOX: Box = { x: 10, y: 20, w: 400, h: 300 };
const flat: ViewTransform = { zoom: 1, tiltDeg: 0, pan: { x: 0, y: 0 } };

describe("object-cover, as the browser computes it", () => {
  it("fills a wider box by cropping the top and bottom", () => {
    // 100x100 into 400x300: scale 4, so 400x400 centred vertically.
    const r = coverRect(100, 100, BOX);
    expect(r.w).toBeCloseTo(400);
    expect(r.h).toBeCloseTo(400);
    expect(r.x).toBeCloseTo(10);
    expect(r.y).toBeCloseTo(20 - 50);
  });

  it("fills a taller box by cropping the sides", () => {
    const r = coverRect(100, 100, { x: 0, y: 0, w: 300, h: 400 });
    expect(r.w).toBeCloseTo(400);
    expect(r.h).toBeCloseTo(400);
    expect(r.x).toBeCloseTo(-50);
    expect(r.y).toBeCloseTo(0);
  });

  it("covers, never contains - the box is always filled", () => {
    for (const [iw, ih] of [[4000, 3000], [300, 1200], [16, 9], [1, 400]]) {
      const r = coverRect(iw, ih, BOX);
      expect(r.w, `${iw}x${ih} leaves a gap horizontally`).toBeGreaterThanOrEqual(BOX.w - 0.001);
      expect(r.h, `${iw}x${ih} leaves a gap vertically`).toBeGreaterThanOrEqual(BOX.h - 0.001);
    }
  });

  it("never divides by a zero dimension", () => {
    expect(coverRect(0, 0, BOX)).toEqual(BOX);
  });
});

describe("the canvas matrix equals the CSS matrix", () => {
  const view: ViewTransform = { zoom: 2.5, tiltDeg: 7, pan: { x: 30, y: -12 } };
  const cx = BOX.x + BOX.w / 2;
  const cy = BOX.y + BOX.h / 2;

  // transform: translate(pan) scale(z) rotate(t), transform-origin: center.
  // CSS reads that list left to right about the origin, which is this product.
  const expected = (panScale: number) =>
    [T(cx, cy), T(view.pan.x * panScale, view.pan.y * panScale), S(view.zoom), R(view.tiltDeg), T(-cx, -cy)]
      .reduce(mul, IDENTITY);

  it("matches at 1:1", () => {
    const ctx = recorder();
    applyViewTransform(ctx, BOX, view, 1);
    const got = matrixOf(ctx.ops);
    expected(1).forEach((v, i) => expect(got[i]).toBeCloseTo(v, 6));
  });

  it("matches when the export is bigger than the screen was", () => {
    const ctx = recorder();
    applyViewTransform(ctx, BOX, view, 2.1);
    const got = matrixOf(ctx.ops);
    expected(2.1).forEach((v, i) => expect(got[i]).toBeCloseTo(v, 6));
  });

  it("puts rotate INSIDE scale, not after it", () => {
    // Order matters the moment both are non-default. A tilted-then-scaled
    // photo and a scaled-then-tilted one differ, and the difference is a
    // lesion that appears to have moved.
    const ctx = recorder();
    applyViewTransform(ctx, BOX, view, 1);
    const names = ctx.ops.map((o) => o.op);
    expect(names).toEqual(["translate", "scale", "rotate", "translate"]);
  });

  it("holds the box centre still when only zoom changes", () => {
    const ctx = recorder();
    applyViewTransform(ctx, BOX, { zoom: 3, tiltDeg: 0, pan: { x: 0, y: 0 } }, 1);
    const p = apply(matrixOf(ctx.ops), cx, cy);
    expect(p.x).toBeCloseTo(cx);
    expect(p.y).toBeCloseTo(cy);
  });

  it("moves the centre by the pan, rescaled", () => {
    const ctx = recorder();
    applyViewTransform(ctx, BOX, { zoom: 1, tiltDeg: 0, pan: { x: 40, y: 10 } }, 2);
    const p = apply(matrixOf(ctx.ops), cx, cy);
    expect(p.x).toBeCloseTo(cx + 80);
    expect(p.y).toBeCloseTo(cy + 20);
  });

  it("a flat view is the identity - an untouched photo is untouched", () => {
    const ctx = recorder();
    applyViewTransform(ctx, BOX, flat, 1);
    matrixOf(ctx.ops).forEach((v, i) => expect(v).toBeCloseTo(IDENTITY[i], 9));
  });
});

describe("drawing one photo", () => {
  const img = { width: 1000, height: 1000 } as unknown as CanvasImageSource & { width: number; height: number };

  it("clips to the box BEFORE transforming, so a zoomed photo cannot escape", () => {
    // Without this a photo at 3x paints over the other half of the comparison.
    const ctx = recorder();
    drawPhoto(ctx, img, BOX, { zoom: 3, tiltDeg: 0, pan: { x: 0, y: 0 } }, 1);
    const names = ctx.ops.map((o) => o.op);
    expect(names.indexOf("clip")).toBeGreaterThan(-1);
    expect(names.indexOf("clip")).toBeLessThan(names.indexOf("scale"));
    expect(names[0]).toBe("save");
    expect(names[names.length - 1]).toBe("restore");
  });

  it("clips to exactly the box", () => {
    const ctx = recorder();
    drawPhoto(ctx, img, BOX, flat, 1);
    const rect = ctx.ops.find((o) => o.op === "rect");
    expect(rect?.args).toEqual([BOX.x, BOX.y, BOX.w, BOX.h]);
  });

  it("paints the box backing so a tilted photo shows no transparent corner", () => {
    const ctx = recorder();
    drawPhoto(ctx, img, BOX, { zoom: 1, tiltDeg: 10, pan: { x: 0, y: 0 } }, 1);
    expect(ctx.ops.some((o) => o.op === "fillRect")).toBe(true);
    expect(EXPORT_PHOTO_BACKGROUND).toBe("#171717");
  });

  it("draws the image at its cover rect", () => {
    const ctx = recorder();
    drawPhoto(ctx, img, BOX, flat, 1);
    const r = coverRect(1000, 1000, BOX);
    expect(ctx.drawn!.x).toBeCloseTo(r.x);
    expect(ctx.drawn!.y).toBeCloseTo(r.y);
    expect(ctx.drawn!.w).toBeCloseTo(r.w);
    expect(ctx.drawn!.h).toBeCloseTo(r.h);
  });
});

describe("the shape of the saved picture", () => {
  it("slider mode is one landscape box, matching the 4:3 on screen", () => {
    const l = compareLayout("slider");
    expect(l.before).toEqual(l.after);
    expect(l.before.w / l.before.h).toBeCloseTo(4 / 3, 2);
    expect(l.dividerX).not.toBeNull();
  });

  it("side by side is two portrait boxes that do not overlap", () => {
    const l = compareLayout("side-by-side");
    expect(l.before.w / l.before.h).toBeCloseTo(3 / 4, 2);
    expect(l.after.x).toBeGreaterThan(l.before.x + l.before.w);
    expect(l.dividerX).toBeNull();
  });

  it("the divider sits where the slider was left", () => {
    const l = compareLayout("slider", 25);
    expect(l.dividerX! - l.before.x).toBeCloseTo(l.before.w * 0.25);
    expect(compareLayout("slider", 0).dividerX).toBeCloseTo(compareLayout("slider").before.x);
  });

  it("a divider position outside 0-100 is clamped rather than drawn off-canvas", () => {
    const l = compareLayout("slider", 140);
    expect(l.dividerX!).toBeLessThanOrEqual(l.before.x + l.before.w);
    expect(compareLayout("slider", -20).dividerX!).toBeGreaterThanOrEqual(l.before.x);
  });

  it("leaves room below the photos for the dates", () => {
    for (const mode of ["slider", "side-by-side"] as const) {
      const l = compareLayout(mode);
      expect(l.captionY, mode).toBeGreaterThan(l.before.y + l.before.h);
      expect(l.captionY + l.captionFont, mode).toBeLessThanOrEqual(l.height);
      // Both boxes fit inside the canvas.
      expect(l.after.x + l.after.w, mode).toBeLessThanOrEqual(l.width);
    }
  });
});

describe("what the file is called", () => {
  it("names the patient and both dates", () => {
    expect(
      compareFileName({ patientName: "Divyani Singh", beforeAt: "2026-07-10", afterAt: "2026-11-06" }),
    ).toBe("Divyani Singh - comparison - 10-07-2026 vs 06-11-2026.png");
  });

  it("strips what a filesystem will not take", () => {
    // Windows refuses these outright, and the clinic has names with them.
    const name = compareFileName({ patientName: "A/B: C?", beforeAt: "2026-07-10", afterAt: "2026-07-10" });
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
  });

  it("still produces a usable name with nothing to go on", () => {
    expect(compareFileName({})).toBe("comparison.png");
    // Never a bare extension: ".png" is a hidden file on macOS and Linux.
    expect(compareFileName({}).startsWith(".")).toBe(false);
  });

  it("is a PNG, because JPEG smears the skin texture being compared", () => {
    expect(compareFileName({ patientName: "X" }).endsWith(".png")).toBe(true);
  });
});
