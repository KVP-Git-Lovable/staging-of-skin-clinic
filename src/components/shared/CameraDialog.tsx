import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X, Check, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cameraConstraints, frameAspectRatio } from "@/lib/cameraStream";
import { focusNoticePlacement, focusPointFromTap, supportsTapFocus, tapFocusConstraints } from "@/lib/cameraFocus";
import { useIsMobile } from "@/hooks/use-mobile";

interface CameraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
  /**
   * Keep shooting without leaving the camera.
   *
   * On a phone each upload takes a few seconds, and the camera closed after
   * every shot - so photographing four areas meant opening it, shooting,
   * waiting and starting again, four times, with the patient sitting there.
   * With this on, a shot joins a strip along the bottom, the view comes
   * straight back, and Done hands the whole set over at once.
   *
   * Off by default: the other three screens that use this camera - patient
   * attachments, the prescription scanner, the patient page - want exactly one
   * picture, and nothing about them changes.
   */
  multiple?: boolean;
  /** Called instead of onCapture when `multiple` is on. */
  onCaptureMany?: (files: File[]) => void;
  title?: string;
  /**
   * Which camera to open on.
   *
   * "environment" by default, which is every existing caller: a patient's
   * skin, an attachment, a prescription to scan - all things in front of the
   * phone. Attendance wants "user", because a selfie taken on the rear camera
   * means turning the phone round and shooting blind.
   */
  defaultFacing?: "environment" | "user";
  /**
   * A dashed circle over the middle of the frame, as the Bharath Builders
   * attendance camera has.
   *
   * It is what tells somebody how far back to stand and where to put their
   * face, which matters when the photo is about to be compared against
   * another one. Off by default - a patient's skin or a prescription being
   * scanned wants the whole frame, not a face-shaped target.
   */
  faceGuide?: boolean;
  /**
   * Refuse anything that is not a live capture.
   *
   * Attendance only. The gallery route handed an existing photo straight to
   * onCapture with no preview, and the check-in then stamped it with the
   * CURRENT time and the clinic's address - so yesterday's selfie could be
   * submitted as today's check-in, carrying a burned-in caption asserting a
   * time and place it was not taken at, and the face match passed because it
   * genuinely was their face.
   *
   * Off by default: patient attachments, the prescription scanner and the
   * patient page all have good reason to pick an existing picture, and
   * nothing about them changes.
   */
  liveOnly?: boolean;
}

/** How much of the screen the live view may take, leaving the shutter on it. */
const FRAME_MAX_HEIGHT = "68vh";

export function CameraDialog({ open, onOpenChange, onCapture, multiple = false, onCaptureMany, title = "Take Photo", defaultFacing = "environment", faceGuide = false, liveOnly = false }: CameraDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileFallbackRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">(defaultFacing);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  /** The shots taken so far in this session, when `multiple` is on. */
  const [shots, setShots] = useState<{ file: File; url: string }[]>([]);
  /**
   * Where the last tap landed, drawn as a ring for a moment.
   *
   * Shown on every device, including the ones that cannot focus at all: the
   * complaint was that tapping did nothing, and a tap that is seen to register
   * is most of the answer even where the lens does not move.
   */
  const [focusRing, setFocusRing] = useState<{ x: number; y: number; at: number } | null>(null);
  /**
   * Where to offer the phone's own camera, once somebody has tapped a camera
   * that cannot be told where to focus.
   *
   * Safari on iOS exposes no focus control to a web page, so on an iPhone -
   * most of this clinic - no tap will ever move the lens. Rather than leave
   * that looking like a fault, the tap says so and names the phone's own
   * camera, which does focus. Only after a tap, so it explains the thing just
   * done instead of sitting on the viewfinder permanently.
   *
   * Phones only, and worded for any camera that cannot be aimed rather than
   * for iPhone by name: a desktop webcam reports no focus control either, and
   * telling someone at a laptop to use their phone camera - a button that
   * opens a file picker there - would be nonsense.
   *
   * It carries the tap's position because it IS the button: it has to appear
   * under the thumb that just tapped, not pinned to the top of the frame. And
   * it deliberately outlives the ring, which clears itself after 900ms - a
   * button that vanishes while somebody reaches for it is worse than no button.
   */
  const [focusNotice, setFocusNotice] = useState<{ x: number; y: number } | null>(null);
  /**
   * The shape of the live picture, once the camera has reported it.
   *
   * Null until then, and again whenever the camera is switched, so the front
   * camera is measured rather than being shown in the back camera's shape.
   */
  const [frameRatio, setFrameRatio] = useState<number | null>(null);
  /**
   * A phone gets the camera full-screen with the controls over the picture.
   *
   * Not decoration. A phone camera sends a 9:16 picture, and a dialog that
   * stacks a title, the frame and a button row leaves the frame about 280 of
   * a 370px-wide screen once its height is capped - the clinic reported that,
   * correctly, as still narrow. There is no arrangement of a stacked layout
   * that fits an upright picture across the width of an upright screen. Over
   * the whole screen, with the controls floating on top of it the way every
   * camera app does it, there is: the picture is as wide as the phone.
   */
  const isMobile = useIsMobile();

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const startStream = async (mode: "environment" | "user") => {
    setError(null);
    setStarting(true);
    stopStream();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        // Browsers have had getUserMedia for a decade. When it is missing on
        // a phone it is almost always an insecure origin - an http LAN or IP
        // build - not a browser that cannot do cameras. Saying "not
        // supported" sent people looking for a different phone.
        throw new Error(
          window.isSecureContext === false
            ? "The camera needs a secure (https) connection. Open the app on its https address and try again."
            : "This browser will not give access to the camera.",
        );
      }
      const stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(mode));
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      const msg =
        err?.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access in your browser."
          : err?.message || "Could not access camera";
      setError(msg);
    } finally {
      setStarting(false);
    }
  };

  /** Not more than one re-acquire in this window, however fast somebody taps. */
  const REFOCUS_GAP_MS = 1500;
  const lastRefocusRef = useRef(0);

  /**
   * Re-run the camera's own autofocus, for a camera that cannot be aimed.
   *
   * On an iPhone there is no way to say WHERE to focus, but a camera runs an
   * autofocus pass as it starts - so acquiring the track again is the one
   * lever left, and it can bring back a subject that has moved closer since
   * the viewfinder opened. Best-effort: on some devices it will not look like
   * much, which is why the message below names the phone's own camera too.
   *
   * The new stream is taken BEFORE the old one is stopped. startStream does it
   * the other way round, which is right when switching between front and back,
   * but here it would blank the picture on every tap. If the new one fails,
   * what is on screen is left exactly as it was.
   */
  const refocusByRestart = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const now = Date.now();
    if (now - lastRefocusRef.current < REFOCUS_GAP_MS) return;
    lastRefocusRef.current = now;

    const previous = streamRef.current;
    try {
      const fresh = await navigator.mediaDevices.getUserMedia(cameraConstraints(facingMode));
      streamRef.current = fresh;
      if (videoRef.current) {
        videoRef.current.srcObject = fresh;
        await videoRef.current.play().catch(() => {});
      }
      previous?.getTracks().forEach((t) => t.stop());
    } catch {
      // A tap that cannot refocus must never cost the viewfinder.
      streamRef.current = previous;
    }
  };

  const handleFrameTap = (e: React.MouseEvent<HTMLDivElement>) => {
    // Nothing to focus on while a shot is being reviewed or the camera failed.
    if (error || previewUrl) return;
    const point = focusPointFromTap(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY);
    if (!point) return;
    // The ring goes up first and regardless: the complaint was that tapping
    // did nothing, and being seen to register is most of the answer even where
    // the lens cannot move.
    setFocusRing({ x: point.x, y: point.y, at: Date.now() });

    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const capabilities =
      typeof track.getCapabilities === "function" ? track.getCapabilities() : undefined;

    if (supportsTapFocus(capabilities)) {
      const constraints = tapFocusConstraints(point, capabilities);
      if (constraints) {
        // Cast: focusMode/pointsOfInterest are shipped but absent from
        // TypeScript's MediaTrackConstraintSet - see cameraFocus.ts.
        track.applyConstraints(constraints as unknown as MediaTrackConstraints).catch(() => {});
        return;
      }
    }
    // Under liveOnly there is no phone-camera offer to make, and on a front
    // camera there is nothing to focus on at arm's length anyway. This is
    // the iOS path: supportsTapFocus() is false for every iOS device, so
    // ANY tap on the viewfinder - the natural gesture while framing your own
    // face - used to raise the "open phone camera" pill AND restart a fresh
    // 1920x1080 stream, stalling the preview for a gesture that cannot work
    // there. One tap on the pill then submitted a blind shot.
    if (liveOnly || facingMode === "user") return;

    setFocusNotice(point);
    void refocusByRestart();
  };

  /** Where the offer sits, so it is reachable wherever the tap landed. */
  const noticePlacement = focusNotice ? focusNoticePlacement(focusNotice) : null;

  // The ring is a moment's acknowledgement, not a marker left on the picture.
  useEffect(() => {
    if (!focusRing) return;
    const timer = setTimeout(() => setFocusRing(null), 900);
    return () => clearTimeout(timer);
  }, [focusRing]);

  useEffect(() => {
    if (open && !capturedFile) {
      startStream(facingMode);
    }
    if (!open) {
      stopStream();
      setCapturedFile(null);
      setPreviewUrl(null);
      setError(null);
      setShots((prev) => {
        prev.forEach((s) => URL.revokeObjectURL(s.url));
        return [];
      });
      setFrameRatio(null);
      setFocusRing(null);
      setFocusNotice(null);
    }
    return () => {
      if (!open) stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facingMode]);

  useEffect(() => () => stopStream(), []);

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      toast.error("Camera not ready yet");
      return;
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
        if (multiple) {
          // The stream is deliberately left running: stopping and restarting
          // it between shots is the couple of seconds that made this slow.
          setShots((prev) => [...prev, { file, url: URL.createObjectURL(blob) }]);
          // The offer belonged to the tap before this shot. Tapping again
          // raises it again, wherever the finger lands next.
          setFocusNotice(null);
          return;
        }
        setCapturedFile(file);
        setPreviewUrl(URL.createObjectURL(blob));
        stopStream();
      },
      "image/jpeg",
      0.9
    );
  };

  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCapturedFile(null);
    setPreviewUrl(null);
    startStream(facingMode);
  };

  const handleUse = () => {
    if (capturedFile) {
      onCapture(capturedFile);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setCapturedFile(null);
      setPreviewUrl(null);
      onOpenChange(false);
    }
  };

  const handleSwitchCamera = () => {
    // The two cameras need not have the same shape, so the frame is measured
    // again rather than keeping the one it already has.
    setFrameRatio(null);
    setFacingMode((m) => (m === "environment" ? "user" : "environment"));
  };

  /**
   * The phone's own camera, which focuses; the shot joins the strip.
   *
   * `capture` follows the camera we are actually asking for. It was
   * hardcoded to "environment", so attendance - which opens with
   * defaultFacing="user" and a face guide - sent people to the camera on the
   * BACK of the phone to take a selfie. They shot blind, the face check
   * failed, and it cost one of their three attempts.
   */
  const openPhoneCamera = () => {
    const input = fileFallbackRef.current;
    if (!input) return;
    input.setAttribute("capture", facingMode === "user" ? "user" : "environment");
    input.click();
  };

  /** The gallery. `capture` must come off, or the phone opens the camera. */
  const openDeviceFiles = () => {
    // Belt and braces - the button is not rendered under liveOnly either.
    if (liveOnly) return;
    const input = fileFallbackRef.current;
    if (!input) return;
    input.removeAttribute("capture");
    input.click();
  };

  const handleFallbackFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) {
      if (multiple) {
        // Joins the strip and the camera stays open, so a phone whose live
        // camera will not start can still build a set - take one, take
        // another, then Done. It used to hand back a single photo and close,
        // which is why "capture multiple photos" was nowhere to be seen on a
        // phone while it worked on the desktop.
        setShots((prev) => [...prev, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
      } else {
        // Was: hand the file straight to onCapture and close. On a phone
        // that meant a photo taken through the phone's own camera app was
        // submitted with no preview and no Retake - and until the fix above
        // it was often a blind shot out of the back of the phone. It now
        // lands in the same preview the live shutter produces, so the
        // Retake / Use Photo step is identical whichever way the photo was
        // taken.
        const file = files[0];
        setCapturedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
        // The pick is the answer to the error above it: without clearing it,
        // the body keeps rendering the error panel over the preview and the
        // photo looks lost, with only a stray "Use Photo" in the footer.
        setError(null);
        // The live stream, if one was somehow running, has no business
        // continuing behind a preview - same as the shutter path.
        stopStream();
      }
    }
    e.target.value = "";
  };

  const removeShot = (index: number) =>
    setShots((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.url);
      return next;
    });

  const handleDone = () => {
    if (!shots.length) return;
    onCaptureMany?.(shots.map((s) => s.file));
    // The urls are revoked by the close effect, after the files have gone.
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          isMobile
            ? "w-screen max-w-none h-[100dvh] max-h-[100dvh] gap-0 p-0 sm:p-0 rounded-none border-0 overflow-hidden bg-black text-white [&>button]:z-20 [&>button]:text-white"
            : "max-w-3xl p-0 overflow-hidden"
        }
      >
        {/* `contents` on a desktop: the wrapper disappears from the layout and
            the dialog is exactly what it was. On a phone it becomes the
            full-screen column everything else is positioned against. */}
        <div className={isMobile ? "absolute inset-0 flex flex-col bg-black" : "contents"}>
        <DialogHeader
          className={
            isMobile
              ? "safe-inset-top absolute inset-x-0 top-0 z-10 px-4 pt-4 pb-10 bg-gradient-to-b from-black/70 to-transparent"
              : "px-4 pt-4"
          }
        >
          <DialogTitle className="font-display">{title}</DialogTitle>
        </DialogHeader>
        {/* The frame takes the shape of the camera, rather than imposing one.
            A fixed shape is wrong on one device or the other: a 4:3 box cut
            the sides off a desktop webcam - reported as not being able to
            take a wide photo - and a 16:9 box left a phone held upright as a
            narrow strip between two black bars. The picture itself was never
            cropped either way (the capture draws videoWidth x videoHeight);
            only the view of it was.

            maxWidth is what removes the bars: capping the height alone would
            leave the box wider than the picture and letterbox it again. Until
            the camera reports its size, the classes guess by device - upright
            on a phone, wide on a desktop. */}
        {/* One input, two intents - the same trick AttachPhotosButton uses.
            With `capture` the phone opens its own camera, which is the only
            way to get an iPhone to focus: Safari ignores every focus
            instruction a web page gives a camera stream, so the in-app
            viewfinder cannot be made to focus there however it is asked.
            Without `capture`, the same input opens the gallery. Either way the
            file lands in the strip through handleFallbackFile and the dialog
            stays open, so a sharp photo can still be one of several. */}
        <input
          ref={fileFallbackRef}
          type="file"
          accept="image/*"
          multiple={multiple}
          className="hidden"
          onChange={handleFallbackFile}
        />
        {/* Tapping aims the focus where the browser allows it, and where it
            does not - an iPhone - re-runs the camera's own autofocus and says
            so. It used to do nothing whatsoever, which read as a fault. */}
        <div
          data-testid="camera-frame"
          onClick={handleFrameTap}
          className={
            isMobile
              ? "relative flex-1 min-h-0 w-full bg-black flex items-center justify-center"
              : `relative bg-black mx-auto w-full flex items-center justify-center ${frameRatio ? "" : "aspect-video"}`
          }
          style={
            isMobile
              ? undefined
              : {
                  aspectRatio: frameRatio ?? undefined,
                  maxHeight: FRAME_MAX_HEIGHT,
                  maxWidth: frameRatio ? `calc(${FRAME_MAX_HEIGHT} * ${frameRatio})` : undefined,
                }
          }
        >
          {error ? (
            <div className="text-center p-6 text-white space-y-3">
              <Camera className="h-10 w-10 mx-auto opacity-60" />
              <p className="text-sm">{error}</p>
              {multiple && (
                <p className="text-xs opacity-80">
                  You can still take them one at a time from the phone&apos;s own camera — they will be
                  collected here and sent together.
                </p>
              )}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="secondary" onClick={openPhoneCamera} className="min-h-11" data-testid="phone-camera">
                  <Camera className="h-4 w-4 mr-1.5" /> Phone camera
                </Button>
                {/* Attendance never offers the gallery: an existing photo
                    would be stamped with the current time and the clinic's
                    address and pass the face check, because it really is
                    their face. */}
                {!liveOnly && (
                  <Button variant="secondary" onClick={openDeviceFiles} className="min-h-11" data-testid="choose-from-device">
                    <Upload className="h-4 w-4 mr-1.5" /> Choose from device
                  </Button>
                )}
              </div>
              {liveOnly && (
                <p className="text-xs opacity-80">
                  Attendance needs a photo taken now. If the camera will not open, ask an admin to
                  record your day.
                </p>
              )}
            </div>
          ) : previewUrl ? (
            <img src={previewUrl} alt="Captured" className="w-full h-full object-contain" />
          ) : (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-contain"
                playsInline
                muted
                /* Mirrored on the front camera, as every selfie view is and
                   as the reference does. Un-mirrored, raising your right hand
                   moves the wrong way on screen and people fight the camera
                   trying to centre themselves. The CAPTURE is not flipped -
                   handleCapture draws the raw video - so the stored photo
                   keeps its real orientation, which is what the face check
                   and an admin reviewing it need. */
                style={facingMode === "user" ? { transform: "scaleX(-1)" } : undefined}
                onLoadedMetadata={(e) =>
                  setFrameRatio(frameAspectRatio(e.currentTarget.videoWidth, e.currentTarget.videoHeight))
                }
              />
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
                  Starting camera…
                </div>
              )}
            </>
          )}
          {/* Where to put your face. Dashed, so it reads as a guide rather
              than a frame the photo will be cropped to. Clinic tokens, not
              the reference's palette. */}
          {faceGuide && !error && (
            <div aria-hidden data-testid="face-guide" className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className={`h-48 w-48 rounded-full border-2 border-dashed ${previewUrl ? "border-primary/50" : "border-white/60"}`} />
            </div>
          )}

          {/* Transform and opacity only, and only when motion is welcome -
              see AGENTS.md. */}
          {focusRing && !previewUrl && !error && (
            <span
              aria-hidden
              data-testid="focus-ring"
              className="pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 ring-1 ring-black/40 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:fade-in"
              style={{ left: `${focusRing.x * 100}%`, top: `${focusRing.y * 100}%` }}
            />
          )}

          {/* The message IS the button. Saying "use Phone camera" and then
              leaving somebody to find that button down in the controls was two
              taps with a hunt in between; this one is under the thumb that
              just tapped. Still a deliberate press rather than wiring the tap
              itself, so a stray brush of the picture never yanks anyone out to
              the phone camera. */}
          {noticePlacement && isMobile && !previewUrl && !error && (
            <button
              type="button"
              data-testid="focus-unavailable"
              // Without this the press also counts as a tap on the frame,
              // which would move the offer out from under the finger.
              onClick={(e) => {
                e.stopPropagation();
                openPhoneCamera();
              }}
              style={{ left: `${noticePlacement.leftPercent}%`, top: `${noticePlacement.topPercent}%` }}
              // z-10, the same layer as the controls overlay below, which
              // comes later in the DOM and therefore wins. With the earlier
              // flip the two should never meet; this settles it the right way
              // round if they ever do. A pill briefly hidden is a nuisance; a
              // shutter that cannot be pressed stops the clinic working.
              className={`absolute z-10 w-max max-w-[80%] -translate-x-1/2 rounded-full bg-black/80 px-3 py-1.5 text-[11px] leading-snug text-white shadow-lg ring-1 ring-white/25 ${
                noticePlacement.above ? "-translate-y-[calc(100%+2.5rem)]" : "translate-y-10"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5 shrink-0" />
                Can&apos;t focus here — open phone camera
              </span>
            </button>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* What has been taken so far, so the doctor can see the set growing
            and drop a bad shot before any of it is sent. */}
        <div className={isMobile ? "absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/60 to-transparent" : "contents"}>
        {multiple && shots.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-4 pt-3 pb-1">
            {shots.map((shot, i) => (
              <div key={shot.url} className="relative shrink-0">
                <img src={shot.url} alt={`Photo ${i + 1}`} className="h-16 w-16 rounded-md object-cover border" />
                <button
                  type="button"
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute -top-1.5 -right-1.5 rounded-full bg-background border p-0.5 shadow-sm"
                  onClick={() => removeShot(i)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {/* Above the controls, never in them: that row is already Cancel,
            switch, shutter and Done, and it has been off the edge of a narrow
            phone once before. */}
        {multiple && !error && (
          <div className="px-4 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`h-7 gap-1.5 text-xs ${isMobile ? "text-white hover:text-white hover:bg-white/10" : ""}`}
              onClick={openPhoneCamera}
            >
              <Camera className="h-3.5 w-3.5" /> Use phone camera for a sharper photo
            </Button>
          </div>
        )}
        <div className={`flex items-center justify-between gap-2 p-4 ${isMobile ? "safe-inset-bottom" : "bg-card"}`}>
          {multiple ? (
            /* Three cells rather than one row: on a 320px phone the old row -
               Cancel, switch, a 56px shutter and "Done (n)" - was wider than
               the dialog, and justify-between pushed Done off the edge, which
               is the one control the whole thing hangs on. The shutter stays
               centred and the two ends shrink. */
            <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2">
              <Button variant="ghost" size="sm" className="justify-self-start px-2" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">Cancel</span>
              </Button>
              <div className="flex items-center gap-2">
                {!error && (
                  <Button variant="outline" size="icon" onClick={handleSwitchCamera} title="Switch camera">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="lg"
                  onClick={handleCapture}
                  disabled={!!error || starting}
                  className="rounded-full h-14 w-14 p-0 shrink-0"
                  title="Take photo"
                  aria-label="Take photo"
                >
                  <Camera className="h-6 w-6" />
                </Button>
              </div>
              {/* Always here, counting, so it is clear more than one can be
                  taken before anything is sent. */}
              <Button size="sm" className="justify-self-end px-2.5" onClick={handleDone} disabled={shots.length === 0}>
                <Check className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Done</span>
                <span className="ml-1">({shots.length})</span>
              </Button>
            </div>
          ) : previewUrl ? (
            /* These two were 36px. "Use Photo" is the press that commits a
               check-in, and it was the smallest control on the screen while
               the shutter above it was 56px. Both are now a 44px target and
               share the width on a phone. */
            <>
              <Button variant="outline" size="sm" onClick={handleRetake} className="min-h-11 flex-1 sm:flex-none">
                <RefreshCw className="h-4 w-4 mr-1.5" /> Retake
              </Button>
              <Button size="sm" onClick={handleUse} className="min-h-11 flex-1 sm:flex-none" data-testid="use-photo">
                <Check className="h-4 w-4 mr-1.5" /> Use Photo
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="min-h-11">
                <X className="h-4 w-4 mr-1.5" /> Cancel
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleSwitchCamera}
                  disabled={!!error}
                  title="Switch camera"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button size="lg" onClick={handleCapture} disabled={!!error || starting} className="rounded-full h-14 w-14 p-0">
                  <Camera className="h-6 w-6" />
                </Button>
              </div>
            </>
          )}
        </div>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
