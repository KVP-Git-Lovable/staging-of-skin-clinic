/**
 * Focusing the in-app camera on the spot somebody tapped.
 *
 * The clinic photographs skin, and tapping the viewfinder did nothing at all.
 * Where the browser allows it, a tap can now aim the camera's focus at that
 * point - the same gesture every phone camera app has.
 *
 * WHERE IT WILL NOT WORK, because it matters more than where it will:
 * Safari on iOS exposes no focus control to a web page whatsoever. No
 * focusMode, no pointsOfInterest, nothing. On an iPhone - which is most of
 * this clinic - supportsTapFocus() is false and no constraint written here
 * will ever reach the lens. That is Apple's decision, not a gap to code
 * around; the caller falls back to re-running the camera's own autofocus and
 * points at the phone's own camera, which does focus.
 *
 * None of this touches a browser, so it is all testable from plain values -
 * which matters because the one thing that silently ruins tap-to-focus is
 * getting the coordinates the wrong way round and focusing on the opposite
 * corner.
 */

/** A point on the picture, 0..1 from the top-left - what pointsOfInterest wants. */
export interface FocusPoint {
  x: number;
  y: number;
}

/** Just the part of a DOMRect this needs, so a test can pass a plain object. */
export interface FrameRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * focusMode and pointsOfInterest are real and shipped, but neither is in
 * TypeScript's MediaTrackCapabilities or MediaTrackConstraintSet - so the
 * shapes are stated here rather than cast through `any`, exactly as
 * cameraStream.ts already does for focusMode on the constraints side.
 */
interface FocusCapabilities {
  focusMode?: unknown;
  pointsOfInterest?: unknown;
}

interface AimedFocusConstraints {
  advanced: Array<{ focusMode: string; pointsOfInterest: FocusPoint[] }>;
}

/**
 * Modes that can be pointed somewhere. "continuous" is deliberately not one of
 * them: it focuses on whatever the camera decides, which is the behaviour a
 * tap is trying to override.
 */
const AIMABLE_MODES = ["single-shot", "manual"];

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Where on the picture the tap landed.
 *
 * Clamped, because a touch that starts inside the frame and drifts out still
 * reports its own coordinates - and a negative point is rejected outright by
 * applyConstraints, which would read as the tap doing nothing again.
 *
 * null when the frame has no size, which is what a rect measured before layout
 * gives: there is no meaningful point on a box of zero width.
 */
export function focusPointFromTap(
  rect: FrameRect | null | undefined,
  clientX: number,
  clientY: number,
): FocusPoint | null {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}

/** The aimable mode this camera offers, preferring single-shot, or null. */
function aimableMode(capabilities: unknown): string | null {
  const modes = (capabilities as FocusCapabilities | null)?.focusMode;
  if (!Array.isArray(modes)) return null;
  for (const wanted of AIMABLE_MODES) {
    if (modes.includes(wanted)) return wanted;
  }
  return null;
}

/**
 * Can this camera be told where to focus?
 *
 * Both halves are required. A camera that offers single-shot focus but will
 * not take a point cannot be aimed, and a point with no mode to apply it in
 * goes nowhere - either one alone would have the caller believe tap-to-focus
 * works while nothing moves.
 */
export function supportsTapFocus(capabilities: unknown): boolean {
  if (aimableMode(capabilities) === null) return false;
  return (capabilities as FocusCapabilities).pointsOfInterest !== undefined;
}

/** What to hand applyConstraints, or null if this camera cannot be aimed. */
export function tapFocusConstraints(
  point: FocusPoint,
  capabilities: unknown,
): AimedFocusConstraints | null {
  if (!supportsTapFocus(capabilities)) return null;
  const mode = aimableMode(capabilities);
  if (!mode) return null;
  // advanced[], not a flat constraint: a plain focusMode is a request the
  // browser may quietly drop, whereas an advanced set is applied together or
  // not at all - the point and the mode have to arrive as one instruction.
  return { advanced: [{ focusMode: mode, pointsOfInterest: [{ x: point.x, y: point.y }] }] };
}

/**
 * Where to put the "open phone camera" notice, given where the finger landed.
 *
 * The notice is the button now, so the only thing that really matters here is
 * that it ends up somewhere it can actually be pressed. Two ways it could not:
 * hanging off the side of the screen when the tap was near an edge, and
 * sitting underneath the shutter controls, which overlay the bottom of the
 * viewfinder on a phone.
 *
 * Percentages rather than pixels, because the caller positions it against the
 * frame and the frame is a different size on every device.
 */
export interface NoticePlacement {
  leftPercent: number;
  topPercent: number;
  /** Put it above the tap rather than below, to clear the bottom controls. */
  above: boolean;
}

/** Keeps a pill of roughly 200px fully inside a 390px phone screen. */
const NOTICE_EDGE_MARGIN = 18;
/**
 * Past this the notice goes above the tap rather than below it.
 *
 * Halfway, not two thirds. The bottom of the viewfinder is where the shutter
 * and - in multi-shot mode - the strip of photos taken so far are overlaid,
 * and that strip only exists once shots have been taken: the more photos in
 * the set, the further up the controls reach. Flipping at 0.7 put the notice
 * right where they begin on a full strip, and the notice would have swallowed
 * the press rather than sat behind it. Flipping here keeps it in the upper
 * half whatever the strip is doing, which still leaves it beside the finger.
 */
const NOTICE_FLIP_AT = 0.5;

export function focusNoticePlacement(point: FocusPoint): NoticePlacement {
  const x = Number.isFinite(point?.x) ? point.x : 0.5;
  const y = Number.isFinite(point?.y) ? point.y : 0.5;
  return {
    leftPercent: Math.min(100 - NOTICE_EDGE_MARGIN, Math.max(NOTICE_EDGE_MARGIN, x * 100)),
    topPercent: clamp01(y) * 100,
    above: y > NOTICE_FLIP_AT,
  };
}
