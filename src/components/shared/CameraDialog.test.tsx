import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CameraDialog } from "./CameraDialog";

/**
 * jsdom has no navigator.mediaDevices, so the dialog lands in exactly the
 * branch a phone lands in when the live camera will not start: the message and
 * the "Choose from device" button. That branch used to hand back one photo and
 * close, which is why taking several worked on the desktop and nowhere else.
 */
beforeEach(() => {
  global.URL.createObjectURL = vi.fn(() => `blob:${Math.random()}`);
  global.URL.revokeObjectURL = vi.fn();
});

const file = (name: string) => new File(["x"], name, { type: "image/jpeg" });

describe("CameraDialog, when the live camera cannot start", () => {
  it("collects photos from the device without closing", async () => {
    const onCaptureMany = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CameraDialog open onOpenChange={onOpenChange} onCapture={vi.fn()} multiple onCaptureMany={onCaptureMany} />,
    );

    // The input is mounted beside the frame rather than inside this block, so
    // that "Phone camera" can reach it too - the two share it.
    await screen.findByText(/choose from device/i);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.multiple).toBe(true);

    fireEvent.change(input, { target: { files: [file("a.jpg"), file("b.jpg")] } });

    // Still open, and nothing handed back yet - the set is still being built.
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onCaptureMany).not.toHaveBeenCalled();

    // Another one, the way a phone camera returns them: one at a time.
    fireEvent.change(input, { target: { files: [file("c.jpg")] } });
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(onCaptureMany).toHaveBeenCalledTimes(1);
    expect(onCaptureMany.mock.calls[0][0]).toHaveLength(3);
  });

  it("shows a preview first rather than submitting the photo blind", async () => {
    // It used to hand the file straight to onCapture and close. On a phone
    // that meant a photo taken through the phone's own camera app went in
    // with no preview and no Retake - and for attendance, where `capture`
    // was hardcoded to the REAR camera, that was a blind shot out of the
    // back of the phone recorded as somebody's check-in.
    const onCapture = vi.fn();
    const onOpenChange = vi.fn();
    render(<CameraDialog open onOpenChange={onOpenChange} onCapture={onCapture} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.multiple).toBe(false);
    fireEvent.change(input, { target: { files: [file("a.jpg")] } });

    // Nothing submitted yet, dialog still open.
    expect(onCapture).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    // Use Photo is what commits it - exactly as the live shutter path does.
    fireEvent.click(await screen.findByTestId("use-photo"));
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("lets the photo be retaken from the preview", () => {
    const onCapture = vi.fn();
    render(<CameraDialog open onOpenChange={vi.fn()} onCapture={onCapture} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file("a.jpg")] } });

    fireEvent.click(screen.getByRole("button", { name: /retake/i }));
    expect(screen.queryByTestId("use-photo")).toBeNull();
    expect(onCapture).not.toHaveBeenCalled();
  });

  it("shows the count on Done from the start, so a set is clearly possible", () => {
    render(<CameraDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} multiple onCaptureMany={vi.fn()} />);
    expect(screen.getByRole("button", { name: /done/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /done/i }).textContent).toContain("(0)");
  });
});

/**
 * The frame shape is where this went wrong three times over. A fixed 4:3 box
 * cut the sides off a desktop webcam; a fixed 16:9 box left a phone as a strip
 * between black bars; and sizing the box to a 9:16 stream inside a stacked
 * dialog squeezed it to about 280 of a 370px-wide phone. The phone gets the
 * screen, the desktop gets a shaped box - and neither should quietly become
 * the other.
 */
describe("the camera frame", () => {
  const widthWas = window.innerWidth;
  const setWidth = (px: number) =>
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: px });
  afterEach(() => setWidth(widthWas));

  it("fills the screen on a phone, with no shape imposed on it", () => {
    setWidth(390);
    render(<CameraDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} multiple onCaptureMany={vi.fn()} />);
    const frame = screen.getByTestId("camera-frame");
    expect(frame.className).toContain("flex-1");
    // No height cap and no aspect box: those are what left bars down the sides.
    expect(frame.style.maxHeight).toBe("");
    expect(frame.style.aspectRatio).toBe("");
  });

  it("stays a shaped box on a desktop, so the dialog is not swallowed", () => {
    setWidth(1280);
    render(<CameraDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} multiple onCaptureMany={vi.fn()} />);
    const frame = screen.getByTestId("camera-frame");
    expect(frame.className).toContain("aspect-video");
    expect(frame.style.maxHeight).not.toBe("");
  });
});

/**
 * The phone's camera and the gallery share one file input, so the `capture`
 * attribute is the only thing telling them apart. Get it wrong and "Phone
 * camera" opens the photo library, or "Choose from device" launches the
 * camera - and the whole point of the phone camera here is that it is the only
 * way to focus an iPhone.
 */
describe("choosing where a photo comes from", () => {
  const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

  it("sets capture for the phone's own camera", async () => {
    render(<CameraDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} multiple onCaptureMany={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /phone camera/i }));
    expect(fileInput().getAttribute("capture")).toBe("environment");
  });

  it("clears it again for the gallery, so the camera does not open instead", async () => {
    render(<CameraDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} multiple onCaptureMany={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /phone camera/i }));
    fireEvent.click(screen.getByRole("button", { name: /choose from device/i }));
    expect(fileInput().hasAttribute("capture")).toBe(false);
  });
});

/**
 * Tapping the viewfinder used to do nothing at all.
 *
 * These mount a camera that actually starts, which the suite above
 * deliberately does not - jsdom has no mediaDevices, so everything there lands
 * in the "camera will not start" branch and never reaches a video track.
 */
describe("tapping the viewfinder to focus", () => {
  const trackWith = (capabilities: unknown) => ({
    stop: vi.fn(),
    getCapabilities: () => capabilities,
    applyConstraints: vi.fn().mockResolvedValue(undefined),
  });

  const mountCamera = (capabilities: unknown) => {
    const track = trackWith(capabilities);
    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [track],
          getVideoTracks: () => [track],
        }),
      },
    });
    return track;
  };

  /** A 200x400 upright viewfinder, so a tap has somewhere to land. */
  const tapCentre = async () => {
    const frame = await screen.findByTestId("camera-frame");
    frame.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.click(frame, { clientX: 100, clientY: 200 });
    return frame;
  };

  const widthWas = window.innerWidth;
  const setWidth = (px: number) =>
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: px });

  beforeEach(() => {
    // A phone, which is where this was reported and the only place the
    // "use Phone camera" message is shown.
    setWidth(390);
    // jsdom does not implement playback; the dialog only ever awaits it.
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    setWidth(widthWas);
    // Put it back, or the suite above stops landing in the branch it tests.
    Reflect.deleteProperty(global.navigator, "mediaDevices");
    vi.restoreAllMocks();
  });

  it("aims the camera at the tapped point where the browser allows it", async () => {
    const track = mountCamera({ focusMode: ["single-shot", "continuous"], pointsOfInterest: {} });
    render(<CameraDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} />);
    await vi.waitFor(() => expect(track.getCapabilities()).toBeTruthy());

    await tapCentre();

    await vi.waitFor(() => expect(track.applyConstraints).toHaveBeenCalled());
    expect(track.applyConstraints).toHaveBeenCalledWith({
      advanced: [{ focusMode: "single-shot", pointsOfInterest: [{ x: 0.5, y: 0.5 }] }],
    });
  });

  it("says so, and names the phone camera, where the browser does not - the iPhone case", async () => {
    // Safari on iOS reports no focus capabilities at all. Nothing can aim the
    // lens there, so the tap has to explain itself instead of looking broken.
    const track = mountCamera({});
    render(<CameraDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} />);
    await vi.waitFor(() => expect(track.getCapabilities()).toBeTruthy());

    await tapCentre();

    const note = await screen.findByTestId("focus-unavailable");
    expect(note.textContent).toMatch(/phone camera/i);
    expect(track.applyConstraints).not.toHaveBeenCalled();
  });

  it("offers the phone camera as something to press, not just read", async () => {
    // Saying "use Phone camera" and leaving somebody to find that button down
    // in the controls was two taps with a hunt in between.
    const track = mountCamera({});
    render(<CameraDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} />);
    await vi.waitFor(() => expect(track.getCapabilities()).toBeTruthy());

    await tapCentre();
    const offer = await screen.findByTestId("focus-unavailable");
    expect(offer.tagName).toBe("BUTTON");
    fireEvent.click(offer);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.getAttribute("capture")).toBe("environment");
  });

  it("pressing the offer is not also another tap on the picture", async () => {
    // Without stopPropagation the press bubbles to the frame, which raises the
    // offer again at the press coordinates - moving it out from under the
    // finger that was reaching for it.
    const track = mountCamera({});
    render(<CameraDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} />);
    await vi.waitFor(() => expect(track.getCapabilities()).toBeTruthy());

    await tapCentre();
    const offer = await screen.findByTestId("focus-unavailable");
    const whereItWas = offer.style.left;
    expect(whereItWas).toBe("50%");

    fireEvent.click(offer, { clientX: 0, clientY: 0 });

    expect((screen.getByTestId("focus-unavailable") as HTMLElement).style.left).toBe(whereItWas);
  });

  it("puts the offer where the finger landed, not pinned to the top", async () => {
    const track = mountCamera({});
    render(<CameraDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} />);
    await vi.waitFor(() => expect(track.getCapabilities()).toBeTruthy());

    const frame = await screen.findByTestId("camera-frame");
    frame.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    // Low in the frame, where the shutter controls sit.
    fireEvent.click(frame, { clientX: 50, clientY: 380 });

    const offer = await screen.findByTestId("focus-unavailable");
    expect(offer.style.left).toBe("25%");
    // Flipped above the tap so the controls do not cover it.
    expect(offer.className).toContain("-translate-y-");
  });

  it("does not claim the camera cannot focus when it can", async () => {
    const track = mountCamera({ focusMode: ["single-shot"], pointsOfInterest: {} });
    render(<CameraDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} />);
    await vi.waitFor(() => expect(track.getCapabilities()).toBeTruthy());

    await tapCentre();

    expect(screen.queryByTestId("focus-unavailable")).toBeNull();
  });

  it("acknowledges the tap on screen, whatever the camera can do", async () => {
    // The whole complaint was that tapping did nothing visible.
    mountCamera({});
    render(<CameraDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} />);

    await tapCentre();

    expect(await screen.findByTestId("focus-ring")).toBeTruthy();
  });

  it("does not throw when there is no camera to focus", async () => {
    render(<CameraDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} />);
    const frame = await screen.findByTestId("camera-frame");
    frame.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    expect(() => fireEvent.click(frame, { clientX: 10, clientY: 10 })).not.toThrow();
  });
});

/**
 * The focus offer must not get in the way of building a set of photos.
 *
 * Multi-capture is the workflow that was fixed earlier - take several shots
 * without leaving the camera - and the offer is drawn over the same viewfinder
 * the shutter and the strip of shots are overlaid on.
 */
describe("the focus offer and multi-capture", () => {
  const trackWith = (capabilities: unknown) => ({
    stop: vi.fn(),
    getCapabilities: () => capabilities,
    applyConstraints: vi.fn().mockResolvedValue(undefined),
  });

  const mountCamera = (capabilities: unknown) => {
    const track = trackWith(capabilities);
    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [track],
          getVideoTracks: () => [track],
        }),
      },
    });
    return track;
  };

  const widthWas = window.innerWidth;
  const setWidth = (px: number) =>
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: px });

  const tapFrame = async (clientX = 100, clientY = 200) => {
    const frame = await screen.findByTestId("camera-frame");
    frame.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.click(frame, { clientX, clientY });
    return frame;
  };

  const photosInStrip = () => screen.queryAllByAltText(/^Photo \d+$/);
  const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

  beforeEach(() => {
    setWidth(390);
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    setWidth(widthWas);
    Reflect.deleteProperty(global.navigator, "mediaDevices");
    vi.restoreAllMocks();
  });

  it("tapping to focus does not take a photo", async () => {
    // A focus tap and a shutter press are different gestures. The shutter is a
    // sibling of the frame rather than inside it, so this also guards the
    // reverse - pressing the shutter is not a focus tap.
    const track = mountCamera({});
    render(
      <CameraDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} multiple onCaptureMany={vi.fn()} />,
    );
    await vi.waitFor(() => expect(track.getCapabilities()).toBeTruthy());

    await tapFrame();

    expect(photosInStrip()).toHaveLength(0);
  });

  it("keeps the offer on the controls' layer, never above them", async () => {
    // The controls overlay is z-10 and comes later in the DOM, so an equal
    // layer means they win. At z-20 the offer painted over the shutter and
    // would have swallowed the press - and the strip makes the controls taller
    // the more photos are in the set, so this bites hardest here.
    const track = mountCamera({});
    render(
      <CameraDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} multiple onCaptureMany={vi.fn()} />,
    );
    await vi.waitFor(() => expect(track.getCapabilities()).toBeTruthy());

    await tapFrame();
    const offer = await screen.findByTestId("focus-unavailable");

    expect(offer.className).toContain("z-10");
    expect(offer.className).not.toContain("z-20");
  });

  it("stays in the upper half when tapped low, where the strip sits", async () => {
    const track = mountCamera({});
    render(
      <CameraDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} multiple onCaptureMany={vi.fn()} />,
    );
    await vi.waitFor(() => expect(track.getCapabilities()).toBeTruthy());

    // Three fifths down a 400px frame - below halfway, but above the old
    // two-thirds flip point, which is exactly the gap where the offer used to
    // land on the controls once the strip had photos in it.
    await tapFrame(100, 240);
    const offer = await screen.findByTestId("focus-unavailable");

    expect(offer.className).toContain("-translate-y-");
  });

  it("photos taken from the offer join the set and the camera stays open", async () => {
    const onOpenChange = vi.fn();
    const track = mountCamera({});
    render(
      <CameraDialog open onOpenChange={onOpenChange} onCapture={vi.fn()} multiple onCaptureMany={vi.fn()} />,
    );
    await vi.waitFor(() => expect(track.getCapabilities()).toBeTruthy());

    await tapFrame();
    fireEvent.click(await screen.findByTestId("focus-unavailable"));
    expect(fileInput().getAttribute("capture")).toBe("environment");

    // The phone's camera hands one photo back at a time; the set grows.
    fireEvent.change(fileInput(), { target: { files: [file("one.jpg")] } });
    expect(photosInStrip()).toHaveLength(1);

    fireEvent.change(fileInput(), { target: { files: [file("two.jpg")] } });
    expect(photosInStrip()).toHaveLength(2);

    // Nothing closed the dialog along the way - that was the original fault.
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

/**
 * The selfie path.
 *
 * Attendance opens this camera with defaultFacing="user" and a face guide.
 * Two things used to go wrong on a phone and both ended with a check-in
 * recorded against a photo nobody intended.
 */
describe("CameraDialog in selfie / live-only mode", () => {
  it("sends the phone's own camera to the FRONT lens, not the back", () => {
    // `capture` was hardcoded to "environment". Attendance asks for "user",
    // so everyone who fell back to the phone camera shot out of the back of
    // the phone while looking at the screen: a blind photo, a failed face
    // match, and one of three attempts gone.
    render(<CameraDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} defaultFacing="user" faceGuide liveOnly />);
    fireEvent.click(screen.getByTestId("phone-camera"));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.getAttribute("capture")).toBe("user");
  });

  it("still uses the rear lens for everything that is not a selfie", () => {
    // Patient skin, attachments, the prescription scanner.
    render(<CameraDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} />);
    fireEvent.click(screen.getByTestId("phone-camera"));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.getAttribute("capture")).toBe("environment");
  });

  it("offers NO gallery route when the capture must be live", () => {
    // A photo picked from the gallery was stamped with the current time and
    // the clinic's address and passed the face check, because it genuinely
    // is their face - so yesterday's selfie could be checked in as today's.
    render(<CameraDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} defaultFacing="user" liveOnly />);
    expect(screen.queryByTestId("choose-from-device")).toBeNull();
    expect(screen.getByText(/needs a photo taken now/i)).toBeInTheDocument();
  });

  it("keeps the gallery for every other caller", () => {
    render(<CameraDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} />);
    expect(screen.getByTestId("choose-from-device")).toBeInTheDocument();
  });
});
