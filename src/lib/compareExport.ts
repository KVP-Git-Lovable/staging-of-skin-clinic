import { cleanFilePart, fileDate } from "@/lib/photoDownload";

/**
 * Saving a Skin Tracker comparison as one picture.
 *
 * ── Why this is not a screenshot ──
 *
 * The comparison on screen is not two photos side by side. Each one carries a
 * zoom, a pan and a tilt that the doctor set BY HAND so that the same piece of
 * skin is the same size and the same way up in both - that alignment is the
 * whole value of the view, and it exists nowhere but in React state. Saving
 * the two original files loses it completely, which is why "download" here has
 * to mean "redraw what is on the screen", not "fetch the originals".
 *
 * So the CSS transform is reproduced on a canvas. Everything about how that is
 * done lives in this file rather than in the component, because a canvas
 * context cannot be rendered in a test but its calls can be recorded - which is
 * how compareExport.test.ts proves the canvas and the browser apply the same
 * transform in the same order. Get the order wrong and the saved picture is
 * subtly, silently different from the one the doctor approved.
 *
 * The patient's name is deliberately NOT drawn into the image. It goes in the
 * filename, where it helps whoever files the picture, and not into the pixels,
 * where it would travel with every copy of a photo that is often shared.
 */

export interface ViewTransform {
  zoom: number;
  tiltDeg: number;
  pan: { x: number; y: number };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The subset of a 2D context this module uses, so a test can record it. */
export interface DrawTarget {
  save(): void;
  restore(): void;
  beginPath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate(angle: number): void;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
}

export const EXPORT_BACKGROUND = "#ffffff";
/** Matches the `bg-neutral-900` the photo boxes sit on. */
export const EXPORT_PHOTO_BACKGROUND = "#171717";
export const EXPORT_CAPTION_COLOR = "#525252";

/**
 * Where an image lands inside a box under `object-fit: cover`.
 *
 * The browser scales by the LARGER of the two ratios so the box is filled and
 * the overflow is cropped evenly. Using the smaller ratio - `contain` - would
 * letterbox the saved picture and, worse, change which part of the skin is
 * visible compared to what was on screen.
 */
export function coverRect(imgW: number, imgH: number, box: Box): Box {
  if (!(imgW > 0) || !(imgH > 0)) return { ...box };
  const scale = Math.max(box.w / imgW, box.h / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/**
 * Apply one photo's zoom/pan/tilt about the centre of its box.
 *
 * The component writes `translate(...) scale(...) rotate(...)` with
 * `transform-origin: center`, and CSS applies that list left to right about
 * that origin. Canvas composes in call order, so the same list, bracketed by a
 * move to the box centre and back, is the same matrix.
 *
 * `panScale` converts the pan, which was recorded in on-screen CSS pixels as
 * the pointer moved, into the export's pixels. Without it a photo dragged 40px
 * on a 420px-wide box moves 40px on a 900px-wide canvas - half as far - and
 * the alignment the doctor set is quietly lost.
 */
export function applyViewTransform(ctx: DrawTarget, box: Box, view: ViewTransform, panScale: number): void {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  ctx.translate(cx + view.pan.x * panScale, cy + view.pan.y * panScale);
  ctx.scale(view.zoom, view.zoom);
  ctx.rotate((view.tiltDeg * Math.PI) / 180);
  ctx.translate(-cx, -cy);
}

/**
 * One photo, cropped to its box, with its corrections applied.
 *
 * The clip comes first and the transform second: a photo zoomed to 3x is three
 * times the size of its box, and without the clip it would paint straight over
 * the other half of the comparison.
 */
export function drawPhoto(
  ctx: DrawTarget,
  image: CanvasImageSource & { width: number; height: number },
  box: Box,
  view: ViewTransform,
  panScale: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.fillStyle = EXPORT_PHOTO_BACKGROUND;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  applyViewTransform(ctx, box, view, panScale);
  const r = coverRect(image.width, image.height, box);
  ctx.drawImage(image, r.x, r.y, r.w, r.h);
  ctx.restore();
}

export type CompareMode = "slider" | "side-by-side";

export interface CompareLayout {
  width: number;
  height: number;
  /** Where photo 1 is drawn. In slider mode this is the whole photo area. */
  before: Box;
  after: Box;
  /** Slider only: the x of the divider, in export pixels. */
  dividerX: number | null;
  captionY: number;
  captionFont: number;
}

/** Each photo box in the export, in pixels on the long edge. */
export const EXPORT_PHOTO_WIDTH = 900;

/**
 * The shape of the saved picture, matching the shape on screen.
 *
 * Slider mode shares one 4:3 box between the two photos; side by side gives
 * each its own 3:4 box with a gap. Those are the aspect ratios the component
 * uses, and a saved picture at a different ratio would crop differently from
 * the one the doctor was looking at.
 */
export function compareLayout(mode: CompareMode, sliderPercent = 50): CompareLayout {
  const pad = 24;
  const captionFont = 26;
  const captionBand = captionFont + pad;

  if (mode === "slider") {
    const w = Math.round(EXPORT_PHOTO_WIDTH * (4 / 3));
    const h = EXPORT_PHOTO_WIDTH;
    const box = { x: pad, y: pad, w, h };
    const clamped = Math.min(100, Math.max(0, sliderPercent));
    return {
      width: w + pad * 2,
      height: h + pad * 2 + captionBand,
      before: box,
      after: box,
      dividerX: pad + (clamped / 100) * w,
      captionY: pad + h + pad * 0.6,
      captionFont,
    };
  }

  const w = EXPORT_PHOTO_WIDTH;
  const h = Math.round(EXPORT_PHOTO_WIDTH * (4 / 3));
  const gap = 18;
  return {
    width: w * 2 + gap + pad * 2,
    height: h + pad * 2 + captionBand,
    before: { x: pad, y: pad, w, h },
    after: { x: pad + w + gap, y: pad, w, h },
    dividerX: null,
    captionY: pad + h + pad * 0.6,
    captionFont,
  };
}

/**
 * What the saved file is called.
 *
 * Built from the same two primitives photoFileName uses, so a comparison and a
 * single photo saved from the same patient sort together in the folder rather
 * than under two different spellings of the same name.
 */
export function compareFileName(parts: {
  patientName?: string | null;
  beforeAt?: string | null;
  afterAt?: string | null;
}): string {
  const name = cleanFilePart(String(parts.patientName ?? ""));
  const from = fileDate(parts.beforeAt);
  const to = fileDate(parts.afterAt);
  const span = from && to ? `${from} vs ${to}` : from || to;
  // "comparison" is never filtered out, so the name is never empty and never a
  // bare ".png" - which is a hidden file on macOS and Linux. An earlier
  // `|| "comparison"` fallback here could not fire for that same reason, and a
  // branch no input can reach is a branch no test can hold.
  return `${[name, "comparison", span].filter(Boolean).join(" - ")}.png`;
}
