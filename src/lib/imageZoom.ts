/**
 * Zooming a scanned document.
 *
 * The clinic's attachments are photographs of handwriting - a prescription
 * written on a notepad, a consent form signed in biro. The preview showed
 * them at `max-h-[70vh] object-contain`, which on a laptop is a whole A4
 * page in about 500 pixels of height, and the dose on the second line is not
 * readable at that size. Downloading the file to read it is what staff were
 * doing instead.
 *
 * No library for this: a transform and two numbers. The rules live here so
 * they can be tested without a DOM, and so the component holds no arithmetic.
 */

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 6;
export const ZOOM_STEP = 0.5;
/** What a double-click jumps to, and jumps back from. */
export const ZOOM_DOUBLE = 2.5;

export interface Offset {
  x: number;
  y: number;
}

export const NO_OFFSET: Offset = { x: 0, y: 0 };

export function clampZoom(scale: number): number {
  // NaN compares false against everything, so Math.min/max would carry it
  // straight through into a transform and blank the image. Infinity is just
  // a number that is too big, and clamps like any other.
  if (Number.isNaN(scale)) return ZOOM_MIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

/**
 * One notch in or out.
 *
 * No rounding here: ZOOM_STEP is 0.5, which is exact in binary floating
 * point, so adding it repeatedly cannot drift. A step that is not a power of
 * two - 0.1, say - would need rounding, and a test proving it, at the point
 * somebody changes it.
 */
export function nextZoom(current: number, direction: 1 | -1): number {
  return clampZoom(clampZoom(current) + direction * ZOOM_STEP);
}

/** Double-click: out to the fit if already zoomed, in to a readable size if not. */
export function toggleZoom(current: number): number {
  return clampZoom(current) > ZOOM_MIN ? ZOOM_MIN : ZOOM_DOUBLE;
}

/** Rounded: this takes any scale, not only one the step produced. */
export function zoomLabel(scale: number): string {
  return `${Math.round(clampZoom(scale) * 100)}%`;
}

/** Panning is pointless at the fit, and the image must snap back to centre. */
export function canPan(scale: number): boolean {
  return clampZoom(scale) > ZOOM_MIN;
}

/**
 * Keep the image overlapping its frame.
 *
 * Dragging without a bound lets somebody fling a prescription off the side of
 * the dialog and be left looking at an empty grey box, with no way back but
 * Reset. The limit is how far the scaled image extends past the frame, so at
 * the fit there is no travel at all.
 */
export function clampPan(offset: Offset, scale: number, frame: { width: number; height: number }): Offset {
  const zoom = clampZoom(scale);
  if (!canPan(zoom)) return NO_OFFSET;
  const limitX = Math.max(0, (frame.width * (zoom - 1)) / 2);
  const limitY = Math.max(0, (frame.height * (zoom - 1)) / 2);
  const bound = (value: number, limit: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.min(limit, Math.max(-limit, value));
  };
  return { x: bound(offset.x, limitX), y: bound(offset.y, limitY) };
}

/** The transform for the image, as a style string. */
export function zoomTransform(scale: number, offset: Offset): string {
  const zoom = clampZoom(scale);
  const { x, y } = canPan(zoom) ? offset : NO_OFFSET;
  return `translate(${x}px, ${y}px) scale(${zoom})`;
}
