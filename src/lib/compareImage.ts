import {
  compareLayout,
  drawPhoto,
  EXPORT_BACKGROUND,
  EXPORT_CAPTION_COLOR,
  type Box,
  type CompareMode,
  type ViewTransform,
} from "@/lib/compareExport";

/**
 * Draw a Skin Tracker comparison onto a real canvas and hand back a PNG.
 *
 * This file is the part that needs a browser; every decision it makes lives in
 * compareExport.ts, where it can be tested. Same split as stampPhoto.ts, and
 * for the same reason: jsdom has no 2D context, so anything that must be
 * proven has to be provable without one.
 *
 * PNG rather than JPEG. The picture is a clinical before/after that may be
 * zoomed into later, and JPEG would smear exactly the fine texture - pore,
 * follicle, pigment edge - that the comparison was made to show.
 */

export interface ComparePhoto {
  url: string;
  /** Rendered under the photo, as on screen. */
  caption: string;
  view: ViewTransform;
  /**
   * The width of this photo's box ON SCREEN, in CSS pixels, used to rescale
   * the pan. Null falls back to no rescaling, which is right only when the
   * photo was never dragged.
   */
  boxWidthOnScreen: number | null;
}

/**
 * Fetch and decode one photo.
 *
 * Through fetch and a blob URL rather than setting the remote URL on an Image:
 * a cross-origin image taints the canvas, and a tainted canvas throws on
 * toBlob - the export would fail at the very last step, after all the work.
 * A blob URL belongs to this page, so the canvas stays clean. PhotoViewer's
 * download already relies on these same URLs being fetchable.
 */
async function loadPhoto(url: string): Promise<HTMLImageElement> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read the photo (${response.status})`);
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not decode the photo"));
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function panScaleFor(photo: ComparePhoto, box: Box): number {
  if (!photo.boxWidthOnScreen || photo.boxWidthOnScreen <= 0) return 1;
  return box.w / photo.boxWidthOnScreen;
}

export interface CompareRenderOptions {
  mode: CompareMode;
  before: ComparePhoto;
  after: ComparePhoto;
  /** Slider only: where the divider sits, 0-100. */
  sliderPercent?: number;
}

export async function renderComparison(options: CompareRenderOptions): Promise<Blob> {
  const { mode, before, after } = options;
  const layout = compareLayout(mode, options.sliderPercent ?? 50);

  const [beforeImg, afterImg] = await Promise.all([loadPhoto(before.url), loadPhoto(after.url)]);

  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the comparison");

  ctx.fillStyle = EXPORT_BACKGROUND;
  ctx.fillRect(0, 0, layout.width, layout.height);

  if (mode === "slider") {
    const box = layout.before;
    // Photo 2 fills the box and Photo 1 is drawn over its left part, which is
    // the order the component stacks them in. Reversing it would show the
    // wrong photo on each side of the divider.
    drawPhoto(ctx, afterImg, box, after.view, panScaleFor(after, box));

    const cut = layout.dividerX ?? box.x + box.w / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, Math.max(0, cut - box.x), box.h);
    ctx.clip();
    drawPhoto(ctx, beforeImg, box, before.view, panScaleFor(before, box));
    ctx.restore();

    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillRect(cut - 1.5, box.y, 3, box.h);
  } else {
    drawPhoto(ctx, beforeImg, layout.before, before.view, panScaleFor(before, layout.before));
    drawPhoto(ctx, afterImg, layout.after, after.view, panScaleFor(after, layout.after));
  }

  ctx.fillStyle = EXPORT_CAPTION_COLOR;
  ctx.font = `${layout.captionFont}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = "top";

  if (mode === "slider") {
    // Left and right ends, as the component shows them.
    ctx.textAlign = "left";
    ctx.fillText(before.caption, layout.before.x, layout.captionY);
    ctx.textAlign = "right";
    ctx.fillText(after.caption, layout.before.x + layout.before.w, layout.captionY);
  } else {
    ctx.textAlign = "center";
    ctx.fillText(before.caption, layout.before.x + layout.before.w / 2, layout.captionY);
    ctx.fillText(after.caption, layout.after.x + layout.after.w / 2, layout.captionY);
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The comparison could not be saved");
  return blob;
}

/** Hand the finished picture to the browser as a download. */
export function saveBlob(blob: Blob, fileName: string): void {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}
