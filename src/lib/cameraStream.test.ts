import { describe, it, expect } from "vitest";
import { cameraConstraints, frameAspectRatio, IDEAL_HEIGHT, IDEAL_WIDTH } from "./cameraStream";

const video = (mode: "environment" | "user") =>
  cameraConstraints(mode).video as MediaTrackConstraints & { focusMode?: unknown };

describe("cameraConstraints", () => {
  it("asks for the back camera, and for the front when switched", () => {
    expect(video("environment").facingMode).toEqual({ ideal: "environment" });
    expect(video("user").facingMode).toEqual({ ideal: "user" });
  });

  it("asks for a full-resolution frame instead of leaving it to the browser", () => {
    expect(video("environment").width).toEqual({ ideal: IDEAL_WIDTH });
    expect(video("environment").height).toEqual({ ideal: IDEAL_HEIGHT });
    expect(IDEAL_WIDTH).toBeGreaterThanOrEqual(1920);
  });

  it("never demands a size, so a camera that cannot manage it still opens", () => {
    // exact would raise OverconstrainedError on an older phone and the camera
    // would not start at all - the one failure worse than a small picture.
    const serialised = JSON.stringify(cameraConstraints("environment"));
    expect(serialised).not.toContain("exact");
  });

  it("never asks for a microphone", () => {
    expect(cameraConstraints("environment").audio).toBe(false);
    expect(cameraConstraints("user").audio).toBe(false);
  });
});

describe("frameAspectRatio", () => {
  it("is the stream's own shape, landscape on a desktop webcam", () => {
    expect(frameAspectRatio(1920, 1080)).toBeCloseTo(16 / 9);
  });

  it("and portrait on a phone held upright - the case that showed as a narrow strip", () => {
    expect(frameAspectRatio(1080, 1920)).toBeCloseTo(9 / 16);
  });

  it("is null before the video has any metadata, rather than dividing by zero", () => {
    expect(frameAspectRatio(0, 0)).toBeNull();
    expect(frameAspectRatio(1920, 0)).toBeNull();
    expect(frameAspectRatio(0, 1080)).toBeNull();
  });

  it("is null for sizes no camera should report", () => {
    expect(frameAspectRatio(-1920, 1080)).toBeNull();
    expect(frameAspectRatio(Number.NaN, 1080)).toBeNull();
    expect(frameAspectRatio(Number.POSITIVE_INFINITY, 1080)).toBeNull();
  });
});

describe("keeping the picture in focus", () => {
  it("asks the camera to keep focusing, rather than locking on the first thing it sees", () => {
    expect(video("environment").focusMode).toEqual({ ideal: "continuous" });
  });

  it("asks, never demands - a phone that cannot do it must still open its camera", () => {
    // Safari on iOS ignores this outright, which is why the dialog also offers
    // the phone's own camera. An exact constraint there would be fatal.
    expect(JSON.stringify(cameraConstraints("user"))).not.toContain("exact");
  });
});
