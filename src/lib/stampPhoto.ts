/**
 * Burn the time and place into an attendance photo.
 *
 * Both are in the database too, but that only travels with the record. Once a
 * check-in photo is downloaded, forwarded or pasted into a report it is just
 * an image, and when and where it was taken is gone. Drawing it into the
 * pixels keeps it attached to the picture, which is the whole reason for
 * asking for a photo at all.
 *
 * Ported from the Bharath Builders app's geoStamp. The first version here was
 * time-only - I judged that a single-site clinic gained nothing from GPS, and
 * the clinic asked for the location, so it is back.
 *
 * Must never cost somebody their check-in: the caller uploads the unstamped
 * photo if this throws.
 */

export interface StampInfo {
  at: Date;
  /** Reverse-geocoded street address, when one resolved. */
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  /**
   * Shrink the longest edge to at most this many pixels before stamping.
   *
   * OPTIONAL, and omitted by clinical photography on purpose: a skin lesion
   * is photographed at 1920x1080 so it can be compared against next month's
   * picture, and src/lib/cameraStream.ts explains at length why. Shrinking
   * those would be a real loss.
   *
   * An attendance selfie is a different thing. It is only ever compared
   * against a baseline face and shown as an 80x80 thumbnail, and it is taken
   * on a phone at the clinic door, often on mobile data. When somebody falls
   * back to their phone's own camera app the source is a 12MP, 4032x3024,
   * 3-5MB frame - 10-30 seconds of upload, and more canvas than older
   * iPhones will allocate, in which case stampPhoto throws and
   * stampPhotoOrOriginal quietly uploads the photo WITHOUT the caption. The
   * caption is the entire reason the photo is taken, so it disappeared
   * exactly on the devices that needed the fallback.
   */
  maxEdge?: number | null;
}

/**
 * Both size decisions for a stamp, together and testable.
 *
 * They belong together because the caption is sized from the image width,
 * and the image may be about to shrink. Computed separately, it is far too
 * easy to measure the caption against the SOURCE width - which on a 4032px
 * phone photo being capped to 800px draws a 105px caption band onto an
 * 800px image, swallowing an eighth of it. stampPhoto cannot be unit-tested
 * (it needs a real canvas), so the decision lives out here where it can be.
 */
export function stampGeometry(
  sourceWidth: number,
  sourceHeight: number,
  maxEdge?: number | null,
): { width: number; height: number; fontSize: number } {
  const { width, height } = fitWithin(sourceWidth, sourceHeight, maxEdge);
  return { width, height, fontSize: captionFontSize(width) };
}

/**
 * Scale (w, h) down so neither side exceeds max, keeping the aspect ratio.
 *
 * Shrink only. An image already smaller than max is returned untouched
 * rather than blown up - upscaling a 320px webcam frame to 800px invents
 * detail the face matcher would then be reading.
 *
 * A missing, zero or negative max means "no limit", so a caller that passes
 * nothing gets exactly the old behaviour.
 */
export function fitWithin(
  width: number,
  height: number,
  max?: number | null,
): { width: number; height: number } {
  const w = Math.round(width);
  const h = Math.round(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { width: w, height: h };
  }
  if (!max || !Number.isFinite(max) || max <= 0) return { width: w, height: h };

  const longest = Math.max(w, h);
  if (longest <= max) return { width: w, height: h };

  const scale = max / longest;
  // At least 1px on the short edge: a 4000x3 panorama scaled to 800 would
  // otherwise round the height to 0 and give a canvas that cannot be drawn.
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/** "03/11/2026 · 09:42 AM" - the dd/mm/yyyy the rest of the clinic uses. */
export function stampCaption(at: Date): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  const h24 = at.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 < 12 ? "AM" : "PM";
  return `${p2(at.getDate())}/${p2(at.getMonth() + 1)}/${at.getFullYear()} · ${p2(h12)}:${p2(at.getMinutes())} ${ampm}`;
}

/** The coordinate line, or "" when there was no fix. */
export function coordLine(lat?: number | null, lng?: number | null): string {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/**
 * Type size for the caption, from the image width.
 *
 * Scaled rather than fixed so the band reads the same on a 1280px phone
 * upload as on a small one, with a floor so a very small image is still
 * legible rather than having one-pixel text.
 */
export function captionFontSize(imageWidth: number): number {
  return Math.max(11, Math.round(imageWidth * 0.026));
}

/** Greedy word wrap, capped at maxLines with an ellipsis on the last. A full
 *  Nominatim address runs to four lines and would eat a quarter of the photo. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) { line = next; continue; }
    lines.push(line);
    line = w;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    if (ctx.measureText(last).width > maxWidth) {
      let t = last;
      while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
      lines[maxLines - 1] = `${t}…`;
    }
  }
  return lines;
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not decode image for stamping")); };
    img.src = url;
  });
}

/**
 * Returns a new JPEG with the caption drawn across the bottom.
 *
 * A flat dark panel rather than a gradient: it stays readable over a bright
 * window behind somebody and over a dim corridor, and a clinic doorway is
 * usually one or the other.
 */
export async function stampPhoto(blob: Blob, info: StampInfo): Promise<Blob> {
  const img = await loadImage(blob);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) throw new Error("Image has no dimensions");

  // The caption is sized from the FINAL width, so the shrink has to happen
  // before captionFontSize is asked anything - otherwise a 4032px source
  // would get a 105px caption band drawn onto an 800px image.
  const { width: w, height: h, fontSize: geometryFont } = stampGeometry(srcW, srcH, info.maxEdge);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.drawImage(img, 0, 0, w, h);

  const base = geometryFont;
  const pad = Math.round(base * 0.6);
  const gap = Math.round(base * 0.34);
  const maxTextW = w - pad * 2;

  ctx.font = `${base}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const addressLines = info.address ? wrap(ctx, info.address, maxTextW, 2) : [];
  const coords = coordLine(info.lat, info.lng);

  // The time is always there; the place is added when it is known. Gating the
  // whole caption on a GPS fix is how the reference ended up with photos
  // carrying no caption at all - not even the time - whenever somebody stood
  // somewhere with no signal.
  const rows = 1 + addressLines.length + (coords ? 1 : 0);
  const bandH = pad * 2 + rows * base + (rows - 1) * gap;
  const bandY = h - bandH;

  ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
  ctx.fillRect(0, bandY, w, bandH);

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
  ctx.shadowBlur = Math.max(2, Math.round(base * 0.18));
  let y = bandY + pad;

  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${base}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(stampCaption(info.at), pad, y);
  y += base + gap;

  ctx.font = `${base}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  for (const line of addressLines) {
    ctx.fillText(line, pad, y);
    y += base + gap;
  }

  if (coords) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
    ctx.font = `${Math.round(base * 0.85)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(coords, pad, y);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (out) => (out ? resolve(out) : reject(new Error("Stamped encode failed"))),
      "image/jpeg",
      // Higher than the capture's own compression: the caption is fine text
      // on a flat panel, which is exactly what low JPEG quality smears.
      0.85,
    );
  });
}

/**
 * Stamp it, or hand back what we were given.
 *
 * Every caller wants this rather than stampPhoto directly. A caption is worth
 * having; it is not worth refusing somebody's attendance over.
 */
export async function stampPhotoOrOriginal(blob: Blob, info: StampInfo): Promise<Blob> {
  try {
    return await stampPhoto(blob, info);
  } catch {
    return blob;
  }
}

/**
 * Shrink an image without stamping anything onto it.
 *
 * For the face BASELINE, which carries no caption: it is the reference the
 * verifier compares every future selfie against, and it was being stored at
 * whatever the source happened to be - a 4MB gallery pick, kept forever and
 * re-read on every single check-in.
 *
 * Same contract as stampPhotoOrOriginal: never throws, and hands back the
 * original if anything goes wrong. A resize is worth having; it is not worth
 * refusing somebody's face registration over.
 */
export async function shrinkOrOriginal(blob: Blob, maxEdge: number): Promise<Blob> {
  try {
    const img = await loadImage(blob);
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return blob;

    const { width, height } = fitWithin(srcW, srcH, maxEdge);
    // Already small enough - re-encoding would only add a generation of
    // JPEG loss to the image the face matcher reads.
    if (width === srcW && height === srcH) return blob;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(img, 0, 0, width, height);

    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    return out ?? blob;
  } catch {
    return blob;
  }
}
