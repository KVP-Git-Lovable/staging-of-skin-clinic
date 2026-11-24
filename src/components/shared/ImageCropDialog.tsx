import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, RotateCw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MIN_CROP_PX, clampCrop, displayScale, displayToImage, fullCrop, isWholeImage,
  moveCrop, normaliseTurns, resizeCrop, rotateSize, type CropCorner, type CropRect,
} from "@/lib/imageCrop";
import { cropImageFile, loadImageFile } from "@/lib/cropImageFile";

/**
 * Trimming a photographed page before it is uploaded.
 *
 * The clinic photographs prescriptions and consent forms, and the shot takes
 * in the desk, a hand and the edge of a file. This is where they cut it down.
 *
 * ── Built for a phone ──
 *
 * It is used one-handed with a patient waiting, so the corner handles are
 * large touch targets rather than the few pixels a mouse would need, and the
 * surface sets `touch-action: none` - without it a drag scrolls the page
 * instead of moving the crop. Pointer events throughout, so a finger and a
 * mouse are one code path rather than two that drift.
 *
 * ── Nothing is lost here ──
 *
 * "Use full photo" hands back the ORIGINAL file, not a re-encode of it: on a
 * page of small handwriting that is the difference between legible and not.
 * A picture the browser cannot open - an iPhone .heic is the real case - says
 * so and keeps the original too. Cropping is an improvement, never a gate on
 * the upload.
 */

const CORNERS: { id: CropCorner; label: string; className: string }[] = [
  { id: "nw", label: "Top left", className: "-left-3.5 -top-3.5 cursor-nwse-resize" },
  { id: "ne", label: "Top right", className: "-right-3.5 -top-3.5 cursor-nesw-resize" },
  { id: "sw", label: "Bottom left", className: "-left-3.5 -bottom-3.5 cursor-nesw-resize" },
  { id: "se", label: "Bottom right", className: "-right-3.5 -bottom-3.5 cursor-nwse-resize" },
];

export function ImageCropDialog({
  file, open, onOpenChange, onDone, title = "Crop photo",
}: {
  file: File | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The file to carry on with - cropped, or the original when it was skipped. */
  onDone: (file: File) => void;
  title?: string;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  /**
   * What is on screen: the original, or the original turned.
   *
   * The rotation is BAKED rather than drawn with a CSS transform, because a
   * transformed image keeps its old layout box - the crop overlay would line
   * up with where the picture used to be. Baking keeps every coordinate in
   * this file in one frame of reference: the picture as shown.
   *
   * Always rendered from the ORIGINAL, never from the last rotation, so
   * pressing Right four times is one re-encode and not four.
   */
  const [source, setSource] = useState<{ file: File; url: string; width: number; height: number } | null>(null);
  const [rect, setRect] = useState<CropRect>(fullCrop(0, 0));
  const [turns, setTurns] = useState(0);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const natural = { width: source?.width ?? 0, height: source?.height ?? 0 };
  /** What a drag is doing, and where it started, in image pixels. */
  const drag = useRef<{ corner: CropCorner | "move"; x: number; y: number } | null>(null);

  /** A fresh photo starts unturned and uncropped. */
  useEffect(() => { if (open) { setTurns(0); setFailed(false); } }, [open, file]);

  // Prepare what is shown: the original, or the original turned by `turns`.
  useEffect(() => {
    if (!open || !file) return;
    let cancelled = false;
    let made = "";
    (async () => {
      const img = await loadImageFile(file);
      const quarter = normaliseTurns(turns);
      const shown = quarter === 0
        ? file
        : await cropImageFile(file, fullCrop(img.naturalWidth, img.naturalHeight), quarter);
      const size = rotateSize(img.naturalWidth, img.naturalHeight, quarter);
      if (cancelled) return;
      made = URL.createObjectURL(shown);
      setSource({ file: shown, url: made, width: size.width, height: size.height });
      setRect(fullCrop(size.width, size.height));
    })().catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (made) URL.revokeObjectURL(made); };
  }, [open, file, turns]);

  const box = () => imgRef.current?.getBoundingClientRect();

  const startDrag = (corner: CropCorner | "move") => (e: React.PointerEvent) => {
    const b = box();
    if (!b || !natural.width) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const at = displayToImage({ x: e.clientX, y: e.clientY }, b, natural.width, natural.height);
    drag.current = { corner, x: at.x, y: at.y };
  };

  const onMove = (e: React.PointerEvent) => {
    const state = drag.current;
    const b = box();
    if (!state || !b || !natural.width) return;
    e.preventDefault();
    const scale = displayScale(b, natural.width, natural.height);
    const at = displayToImage({ x: e.clientX, y: e.clientY }, b, natural.width, natural.height);
    const dx = at.x - state.x;
    const dy = at.y - state.y;
    if (Math.abs(dx) < scale.x / 2 && Math.abs(dy) < scale.y / 2) return;
    setRect((current) =>
      state.corner === "move"
        ? moveCrop(current, dx, dy, natural.width, natural.height)
        : resizeCrop(current, state.corner, dx, dy, natural.width, natural.height));
    drag.current = { ...state, x: at.x, y: at.y };
  };

  const endDrag = () => { drag.current = null; };

  const reset = () => { setRect(fullCrop(natural.width, natural.height)); setTurns(0); };

  const finish = async (cropped: boolean) => {
    if (!file) return;
    // Untouched in, untouched out. See isWholeImage.
    const untouched = isWholeImage(rect, natural.width, natural.height) && normaliseTurns(turns) === 0;
    if (!cropped || untouched || !source) {
      onDone(file);
      onOpenChange(false);
      return;
    }
    setWorking(true);
    try {
      // The source carries the rotation already, so the rectangle is in its
      // frame and no further turn is applied here.
      onDone(await cropImageFile(source.file, clampCrop(rect, natural.width, natural.height), 0));
      onOpenChange(false);
    } catch (e) {
      // The upload must still be possible: hand back what we were given.
      toast.error(e instanceof Error ? e.message : "The picture could not be cropped");
      onDone(file);
      onOpenChange(false);
    } finally {
      setWorking(false);
    }
  };

  // The rectangle as a percentage of the picture, which is what the overlay
  // is positioned with - so it stays right at any dialog size without being
  // recomputed on resize.
  const pct = natural.width && natural.height
    ? {
        left: `${(rect.x / natural.width) * 100}%`,
        top: `${(rect.y / natural.height) * 100}%`,
        width: `${(rect.width / natural.width) * 100}%`,
        height: `${(rect.height / natural.height) * 100}%`,
      }
    : { left: "0%", top: "0%", width: "100%", height: "100%" };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!working) onOpenChange(next); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">{title}</DialogTitle>
        </DialogHeader>

        {failed ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            This picture cannot be cropped here. It will be uploaded as it is.
          </p>
        ) : (
          <div className="space-y-3">
            <div
              className="flex justify-center rounded-lg bg-muted p-2"
              style={{ touchAction: "none" }}
              onPointerMove={onMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {/* This wrapper shrink-wraps the picture, so `inset-0` below is
                  the PICTURE and not the space around it. Measured in a
                  browser before this: the overlay was 622px wide over a 370px
                  photo, which put every handle in the wrong place and made
                  dragging do nothing at all. */}
              <div className="relative max-w-full">
                <img
                  ref={imgRef}
                  src={source?.url ?? ""}
                  alt="Photo being cropped"
                  draggable={false}
                  className="block max-h-[55vh] w-auto max-w-full select-none"
                />
                {natural.width > 0 && (
                  <>
                    {/* Two layers on purpose. Everything outside the box is
                        dimmed by the box's own huge shadow, which has to be
                        clipped to the picture - and that same clipping would
                        cut the corner handles in half, so they sit in their
                        own unclipped layer above it. */}
                    <div className="pointer-events-none absolute inset-0 overflow-hidden">
                      <div
                        className="absolute border-2 border-primary shadow-[0_0_0_9999px_hsl(var(--foreground)/0.5)]"
                        style={pct}
                      />
                    </div>
                    <div className="absolute inset-0">
                    <div
                      className="absolute cursor-move"
                      style={pct}
                      onPointerDown={startDrag("move")}
                      role="group"
                      aria-label="Crop area"
                    >
                      {CORNERS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          aria-label={c.label}
                          onPointerDown={startDrag(c.id)}
                          // The dot is 28px so it does not hide the corner it marks; the
                          // invisible ::before takes the hit area out to 48px,
                          // because this is dragged with a thumb.
                          className={`absolute h-7 w-7 touch-none rounded-full border-2 border-background bg-primary shadow-md before:absolute before:-inset-2.5 before:content-[''] ${c.className}`}
                        />
                      ))}
                    </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={working} onClick={() => setTurns((t) => t - 1)}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Left
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={working} onClick={() => setTurns((t) => t + 1)}>
                <RotateCw className="mr-1.5 h-3.5 w-3.5" />Right
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={working} onClick={reset}>
                <Undo2 className="mr-1.5 h-3.5 w-3.5" />Reset
              </Button>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">
              Drag the corners to the edges of the page. Minimum {MIN_CROP_PX}px.
            </p>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={working} onClick={() => void finish(false)}>
            Use full photo
          </Button>
          <Button type="button" disabled={working || failed} onClick={() => void finish(true)}>
            {working ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Crop &amp; Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
