import { describe, it, expect } from "vitest";
import { focusNoticePlacement, focusPointFromTap, supportsTapFocus, tapFocusConstraints } from "./cameraFocus";

/** A 300x400 upright viewfinder sitting 20px in from the top-left. */
const FRAME = { left: 20, top: 20, width: 300, height: 400 };

describe("focusPointFromTap", () => {
  it("puts a tap in the middle at the middle", () => {
    expect(focusPointFromTap(FRAME, 20 + 150, 20 + 200)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("keeps the corners the right way round", () => {
    // The one mistake that ruins tap-to-focus silently: focusing on the
    // opposite corner from the one that was tapped.
    expect(focusPointFromTap(FRAME, 20, 20)).toEqual({ x: 0, y: 0 });
    expect(focusPointFromTap(FRAME, 320, 420)).toEqual({ x: 1, y: 1 });
  });

  it("measures from the frame, not the page", () => {
    // A quarter across and three quarters down.
    expect(focusPointFromTap(FRAME, 20 + 75, 20 + 300)).toEqual({ x: 0.25, y: 0.75 });
  });

  it("clamps a touch that drifted off the picture", () => {
    // applyConstraints rejects a negative point outright, which would read as
    // the tap doing nothing all over again.
    expect(focusPointFromTap(FRAME, -200, -200)).toEqual({ x: 0, y: 0 });
    expect(focusPointFromTap(FRAME, 9999, 9999)).toEqual({ x: 1, y: 1 });
  });

  it("has no point to give for a frame with no size", () => {
    expect(focusPointFromTap({ left: 0, top: 0, width: 0, height: 400 }, 10, 10)).toBeNull();
    expect(focusPointFromTap({ left: 0, top: 0, width: 300, height: 0 }, 10, 10)).toBeNull();
    expect(focusPointFromTap(null, 10, 10)).toBeNull();
    expect(focusPointFromTap(undefined, 10, 10)).toBeNull();
  });

  it("ignores coordinates that are not numbers", () => {
    expect(focusPointFromTap(FRAME, Number.NaN, 100)).toBeNull();
    expect(focusPointFromTap(FRAME, 100, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("supportsTapFocus", () => {
  it("is true only when the camera takes both a mode and a point", () => {
    expect(supportsTapFocus({ focusMode: ["single-shot"], pointsOfInterest: {} })).toBe(true);
    expect(supportsTapFocus({ focusMode: ["manual", "continuous"], pointsOfInterest: {} })).toBe(true);
  });

  it("is false with a mode but nowhere to aim it", () => {
    expect(supportsTapFocus({ focusMode: ["single-shot"] })).toBe(false);
  });

  it("is false with a point but no mode to apply it in", () => {
    expect(supportsTapFocus({ pointsOfInterest: {} })).toBe(false);
  });

  it("does not count continuous, which is what a tap is overriding", () => {
    expect(supportsTapFocus({ focusMode: ["continuous"], pointsOfInterest: {} })).toBe(false);
  });

  it("is false for an iPhone, which reports none of this", () => {
    // Safari on iOS exposes no focus control at all. This is the branch most
    // of the clinic's phones take, and it has to be a clean false rather than
    // a throw.
    expect(supportsTapFocus({})).toBe(false);
    expect(supportsTapFocus(undefined)).toBe(false);
    expect(supportsTapFocus(null)).toBe(false);
  });

  it("is not fooled by a focusMode that is not a list", () => {
    expect(supportsTapFocus({ focusMode: "single-shot", pointsOfInterest: {} })).toBe(false);
  });
});

describe("tapFocusConstraints", () => {
  const point = { x: 0.25, y: 0.75 };

  it("names the point and a mode that can be aimed", () => {
    expect(tapFocusConstraints(point, { focusMode: ["single-shot"], pointsOfInterest: {} })).toEqual({
      advanced: [{ focusMode: "single-shot", pointsOfInterest: [{ x: 0.25, y: 0.75 }] }],
    });
  });

  it("prefers single-shot, and settles for manual", () => {
    const both = tapFocusConstraints(point, { focusMode: ["manual", "single-shot"], pointsOfInterest: {} });
    expect(both?.advanced[0].focusMode).toBe("single-shot");
    const manualOnly = tapFocusConstraints(point, { focusMode: ["manual"], pointsOfInterest: {} });
    expect(manualOnly?.advanced[0].focusMode).toBe("manual");
  });

  it("sends the instruction as one advanced set, not loose constraints", () => {
    // A flat focusMode is a request the browser may quietly drop; an advanced
    // set applies together or not at all, so the point and the mode arrive
    // as one instruction.
    const result = tapFocusConstraints(point, { focusMode: ["single-shot"], pointsOfInterest: {} });
    expect(Array.isArray(result?.advanced)).toBe(true);
    expect(result?.advanced).toHaveLength(1);
  });

  it("has nothing to send to a camera that cannot be aimed", () => {
    expect(tapFocusConstraints(point, {})).toBeNull();
    expect(tapFocusConstraints(point, { focusMode: ["continuous"], pointsOfInterest: {} })).toBeNull();
  });
});

describe("focusNoticePlacement", () => {
  it("sits under a tap in the middle of the picture", () => {
    expect(focusNoticePlacement({ x: 0.5, y: 0.5 })).toEqual({
      leftPercent: 50,
      topPercent: 50,
      above: false,
    });
  });

  it("stays on screen when the tap was near an edge", () => {
    // The failure this prevents is a button rendered half off the side of the
    // phone, where it cannot be pressed at all.
    expect(focusNoticePlacement({ x: 0, y: 0.3 }).leftPercent).toBe(18);
    expect(focusNoticePlacement({ x: 1, y: 0.3 }).leftPercent).toBe(82);
  });

  it("leaves a tap comfortably inside the frame where it is", () => {
    expect(focusNoticePlacement({ x: 0.25, y: 0.3 }).leftPercent).toBe(25);
    expect(focusNoticePlacement({ x: 0.8, y: 0.3 }).leftPercent).toBe(80);
  });

  it("flips above the tap below halfway, clear of the shutter and the strip", () => {
    // The strip of photos taken so far only exists once shots have been taken,
    // so in multi-shot mode the controls reach further up the screen the more
    // photos are in the set. Staying in the upper half clears them whatever
    // the strip is doing.
    expect(focusNoticePlacement({ x: 0.5, y: 0.95 }).above).toBe(true);
    expect(focusNoticePlacement({ x: 0.5, y: 0.71 }).above).toBe(true);
    expect(focusNoticePlacement({ x: 0.5, y: 0.51 }).above).toBe(true);
  });

  it("stays below the tap in the upper half", () => {
    expect(focusNoticePlacement({ x: 0.5, y: 0.5 }).above).toBe(false);
    expect(focusNoticePlacement({ x: 0.5, y: 0.1 }).above).toBe(false);
  });

  it("never puts the notice low enough to reach the controls", () => {
    // The rule that keeps it off the shutter, pinned rather than implied: a
    // notice drawn BELOW its tap can only ever be anchored in the upper half,
    // and the caller offsets it 40px from there.
    for (let y = 0; y <= 1; y += 0.01) {
      const place = focusNoticePlacement({ x: 0.5, y });
      if (!place.above) expect(place.topPercent).toBeLessThanOrEqual(50);
    }
  });

  it("falls back to the middle rather than rendering nowhere", () => {
    expect(focusNoticePlacement({ x: Number.NaN, y: Number.NaN })).toEqual({
      leftPercent: 50,
      topPercent: 50,
      above: false,
    });
  });
});
