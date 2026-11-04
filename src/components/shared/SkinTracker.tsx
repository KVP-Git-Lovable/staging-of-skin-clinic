import { useState, useRef, useCallback, useEffect } from "react";
import { X, SlidersHorizontal, Columns2, Sparkles, Loader2, ZoomIn, ZoomOut, RotateCcw, RotateCw, Undo2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SkinAnalysisResults, type SkinAnalysis } from "./SkinAnalysisResults";
import { saveAiRecord } from "@/lib/aiRepository";
import { useQueryClient } from "@tanstack/react-query";

interface Photo {
  id: string;
  photo_url: string;
  photo_type: string;
  taken_at: string;
  notes?: string | null;
  procedures?: { service_name: string } | null;
}

/** The two photos being compared. "before" is Photo 1, "after" is Photo 2. */
type Side = "before" | "after";

interface SkinTrackerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: Photo[];
  patientName: string;
  patientId?: string;
  appointmentId?: string;
}

export function SkinTracker({ open, onOpenChange, photos, patientName, patientId, appointmentId }: SkinTrackerProps) {
  const qc = useQueryClient();
  const [beforePhoto, setBeforePhoto] = useState<Photo | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<Photo | null>(null);
  const [selecting, setSelecting] = useState<"before" | "after" | null>(null);
  const [compareMode, setCompareMode] = useState<"slider" | "side-by-side">("slider");
  const [sliderPos, setSliderPos] = useState(50);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<SkinAnalysis | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Zoom, pan and tilt all belong to one photo rather than both.
  //
  // Zoom moved the two together until Oct 2026, so that one could not be blown
  // up against the other and a lesion made to look like it had changed. That
  // was half right. Two photos taken months apart are rarely shot from the
  // same distance, so they usually arrive at different scales already, and a
  // shared zoom cannot correct that - it can only preserve the mismatch.
  // Scaling each photo is what brings them to a common size, for the same
  // reason tilt has always been per photo: the correction belongs to one
  // image, not to both.
  //
  // The risk the old rule guarded is now carried out in the open, by the note
  // the toolbar shows whenever the two zooms differ.
  const [zoom, setZoom] = useState({ before: 1, after: 1 });
  const [pan, setPan] = useState({ before: { x: 0, y: 0 }, after: { x: 0, y: 0 } });
  const [tilt, setTilt] = useState({ before: 0, after: 0 });
  const panning = useRef<{ which: Side; x: number; y: number } | null>(null);

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 6;
  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

  const resetView = useCallback(() => {
    setZoom({ before: 1, after: 1 });
    setPan({ before: { x: 0, y: 0 }, after: { x: 0, y: 0 } });
    setTilt({ before: 0, after: 0 });
  }, []);

  const adjustZoom = useCallback((which: Side, delta: number) => {
    setZoom((z) => {
      const next = clampZoom(z[which] + delta);
      // Back at 1x there is nothing to pan to, and leaving an old offset behind
      // would show the photo off-centre with no way to tell why.
      if (next === 1) setPan((p) => ({ ...p, [which]: { x: 0, y: 0 } }));
      return { ...z, [which]: next };
    });
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // The divider handle owns this gesture; without stopping it here the same
    // drag would move the divider AND pan the photos at once.
    e.stopPropagation();
    dragging.current = true;
  }, []);
  const handlePointerUp = useCallback(() => { dragging.current = false; panning.current = null; }, []);

  const startPan = useCallback((which: Side, e: React.PointerEvent) => {
    if (zoom[which] <= 1) return;
    panning.current = { which, x: e.clientX - pan[which].x, y: e.clientY - pan[which].y };
  }, [zoom, pan]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (panning.current) {
      const { which, x, y } = panning.current;
      setPan((p) => ({ ...p, [which]: { x: e.clientX - x, y: e.clientY - y } }));
      return;
    }
    if (!dragging.current || !sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  }, []);

  // Ctrl/Cmd + wheel only, which is also what a trackpad pinch sends. A plain
  // wheel keeps scrolling the dialog: this panel sits inside a scrollable
  // dialog, and grabbing the scroll whenever the pointer crossed a photo would
  // trap the page.
  const handleWheel = useCallback((which: Side, e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    adjustZoom(which, e.deltaY < 0 ? 0.2 : -0.2);
  }, [adjustZoom]);

  /** In Slider the two photos share one box, so the divider decides which one a
   *  gesture belongs to: left of it is Photo 1, right of it Photo 2. That is
   *  what the eye sees, so it is what the hand should get. */
  const sideAt = useCallback((clientX: number): Side => {
    const rect = sliderRef.current?.getBoundingClientRect();
    if (!rect) return "before";
    return clientX - rect.left <= (sliderPos / 100) * rect.width ? "before" : "after";
  }, [sliderPos]);

  /** What a photo's transform should be. Pan is outside scale so dragging moves
   *  the image by the distance the pointer moved, not that distance times the
   *  zoom. */
  const transformFor = (which: Side) =>
    `translate(${pan[which].x}px, ${pan[which].y}px) scale(${zoom[which]}) rotate(${tilt[which]}deg)`;

  /** Either photo magnified, so the drag hint is worth showing. */
  const anyZoomed = zoom.before > 1 || zoom.after > 1;
  /** The two photos are no longer at the same scale, so their sizes cannot be
   *  read against each other. Said out loud rather than left to be noticed. */
  const zoomMismatch = zoom.before !== zoom.after;
  const viewChanged =
    anyZoomed || zoomMismatch || !!tilt.before || !!tilt.after ||
    pan.before.x !== 0 || pan.before.y !== 0 || pan.after.x !== 0 || pan.after.y !== 0;

  useEffect(() => {
    const up = () => { dragging.current = false; panning.current = null; };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  // A new pair is a new comparison; carrying the previous zoom and tilt over
  // would silently apply one photo's correction to another photo.
  useEffect(() => { resetView(); }, [beforePhoto?.id, afterPhoto?.id, resetView]);

  const reset = () => {
    setBeforePhoto(null);
    setAfterPhoto(null);
    setSelecting(null);
    setSliderPos(50);
    setAnalysis(null);
    setAnalyzing(false);
    resetView();
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const runAnalysis = async () => {
    if (!beforePhoto || !afterPhoto) return;
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const { data, error } = await supabase.functions.invoke("skin-analysis", {
        body: { beforeImageUrl: beforePhoto.photo_url, afterImageUrl: afterPhoto.photo_url },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAnalysis(data as SkinAnalysis);
      if (patientId) {
        await saveAiRecord({ patientId, appointmentId, kind: "skin_analysis", title: `AI Photo Analysis - ${patientName}`, content: { ...data, beforePhotoId: beforePhoto.id, afterPhotoId: afterPhoto.id } });
        qc.invalidateQueries({ queryKey: ["ai-repository", patientId] });
      }
    } catch (err: any) {
      console.error("Skin analysis failed:", err);
      toast.error(err?.message || "Failed to analyze skin photos. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  const isCompareReady = beforePhoto && afterPhoto;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="font-display text-lg">Skin Tracker — {patientName}</DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-5">
          {/* Photo Selection */}
          <div className="grid grid-cols-2 gap-4">
            {/* Photo 1 selector */}
            <div>
              {beforePhoto ? (
                <div className="relative group">
                  <img src={beforePhoto.photo_url} alt="Photo 1" className="w-full h-36 object-cover rounded-lg border-2 border-primary" />
                  <Button variant="secondary" size="icon" className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setBeforePhoto(null); setAnalysis(null); }}>
                    <X className="h-3 w-3" />
                  </Button>
                  <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(beforePhoto.taken_at), "MMM d, yyyy")}</p>
                </div>
              ) : (
                <button
                  className="w-full h-36 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setSelecting("before")}
                >
                  <span className="text-2xl mb-1">📷</span>
                  <span className="text-xs font-medium">Select Photo</span>
                </button>
              )}
            </div>

            {/* Photo 2 selector */}
            <div>
              {afterPhoto ? (
                <div className="relative group">
                  <img src={afterPhoto.photo_url} alt="Photo 2" className="w-full h-36 object-cover rounded-lg border-2 border-primary" />
                  <Button variant="secondary" size="icon" className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setAfterPhoto(null); setAnalysis(null); }}>
                    <X className="h-3 w-3" />
                  </Button>
                  <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(afterPhoto.taken_at), "MMM d, yyyy")}</p>
                </div>
              ) : (
                <button
                  className="w-full h-36 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setSelecting("after")}
                >
                  <span className="text-2xl mb-1">📷</span>
                  <span className="text-xs font-medium">Select Photo</span>
                </button>
              )}
            </div>
          </div>

          {/* Photo picker grid */}
          {selecting && (
            <div className="border rounded-lg p-4 bg-muted/20">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold font-display">Select Photo</p>
                <Button variant="ghost" size="sm" onClick={() => setSelecting(null)}>Cancel</Button>
              </div>
              {photos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No photos available. Take photos first.</p>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-60 overflow-y-auto">
                  {photos.map((photo) => (
                    <button
                      key={photo.id}
                      className={`relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer hover:ring-2 hover:ring-primary/50 ${
                        (beforePhoto?.id === photo.id || afterPhoto?.id === photo.id) ? "border-primary opacity-50" : "border-transparent"
                      }`}
                      disabled={beforePhoto?.id === photo.id || afterPhoto?.id === photo.id}
                      onClick={() => {
                        if (selecting === "before") setBeforePhoto(photo);
                        else setAfterPhoto(photo);
                        setSelecting(null);
                        setAnalysis(null);
                      }}
                    >
                      <img src={photo.photo_url} alt="" className="w-full h-20 object-cover" />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5">
                        {format(new Date(photo.taken_at), "MMM d")}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Compare View */}
          {isCompareReady && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Tabs value={compareMode} onValueChange={(v) => setCompareMode(v as "slider" | "side-by-side")}>
                  <TabsList className="h-9">
                    <TabsTrigger value="slider" className="text-xs gap-1.5">
                      <SlidersHorizontal className="h-3.5 w-3.5" /> Slider
                    </TabsTrigger>
                    <TabsTrigger value="side-by-side" className="text-xs gap-1.5">
                      <Columns2 className="h-3.5 w-3.5" /> Side by Side
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <Button
                  size="sm"
                  onClick={runAnalysis}
                  disabled={analyzing}
                  className="gap-1.5"
                >
                  {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {analyzing ? "Analyzing…" : "AI Analysis"}
                </Button>
              </div>

              {/* Zoom and tilt, the same controls whichever way the photos are
                  laid out, and both per photo: one is straightened and scaled
                  against the other until the same piece of skin is the same
                  size and the same way up in each. */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-muted/40 px-3 py-2">
                {(["before", "after"] as const).map((which, i) => (
                  <div key={`zoom-${which}`} className="flex items-center gap-1">
                    <span className="text-[11px] text-muted-foreground mr-1">Zoom {i + 1}</span>
                    <Button type="button" size="icon" variant="outline" className="h-7 w-7"
                      onClick={() => adjustZoom(which, -0.25)} disabled={zoom[which] <= MIN_ZOOM}
                      aria-label={`Zoom photo ${i + 1} out`}>
                      <ZoomOut className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-[11px] tabular-nums w-10 text-center">{zoom[which].toFixed(1)}×</span>
                    <Button type="button" size="icon" variant="outline" className="h-7 w-7"
                      onClick={() => adjustZoom(which, 0.25)} disabled={zoom[which] >= MAX_ZOOM}
                      aria-label={`Zoom photo ${i + 1} in`}>
                      <ZoomIn className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}

                {(["before", "after"] as const).map((which, i) => (
                  <div key={which} className="flex items-center gap-1">
                    <span className="text-[11px] text-muted-foreground mr-1">Tilt {i + 1}</span>
                    <Button type="button" size="icon" variant="outline" className="h-7 w-7"
                      onClick={() => setTilt((t) => ({ ...t, [which]: t[which] - 1 }))}
                      aria-label={`Tilt photo ${i + 1} left`}>
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-[11px] tabular-nums w-9 text-center">{tilt[which]}°</span>
                    <Button type="button" size="icon" variant="outline" className="h-7 w-7"
                      onClick={() => setTilt((t) => ({ ...t, [which]: t[which] + 1 }))}
                      aria-label={`Tilt photo ${i + 1} right`}>
                      <RotateCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}

                <Button type="button" size="sm" variant="ghost" className="h-7 gap-1.5 text-xs ml-auto"
                  onClick={resetView} disabled={!viewChanged}>
                  <Undo2 className="h-3.5 w-3.5" /> Reset view
                </Button>
              </div>
              {zoomMismatch && (
                <p className="text-[10px] text-amber-600 dark:text-amber-500 -mt-1">
                  Photos are at different zoom — sizes are not comparable.
                </p>
              )}
              {anyZoomed && (
                <p className="text-[10px] text-muted-foreground -mt-1">Drag a photo to move around it.</p>
              )}

              <Tabs value={compareMode} onValueChange={(v) => setCompareMode(v as "slider" | "side-by-side")}>
                {/* Slider Compare */}
                <TabsContent value="slider" className="mt-3">
                  <div
                    ref={sliderRef}
                    className={`relative w-full aspect-[4/3] rounded-xl overflow-hidden border select-none touch-none bg-neutral-900 ${anyZoomed ? "cursor-grab active:cursor-grabbing" : "cursor-col-resize"}`}
                    onPointerMove={handlePointerMove}
                    onPointerDown={(e) => startPan(sideAt(e.clientX), e)}
                    onPointerUp={handlePointerUp}
                    onWheel={(e) => handleWheel(sideAt(e.clientX), e)}
                  >
                    <img src={afterPhoto.photo_url} alt="After" className="absolute inset-0 w-full h-full object-cover"
                      style={{ transform: transformFor("after"), transformOrigin: "center" }} draggable={false} />
                    <div className="absolute inset-0 overflow-hidden" style={{ width: `${sliderPos}%` }}>
                      <img src={beforePhoto.photo_url} alt="Before" className="absolute inset-0 w-full h-full object-cover"
                        style={{
                          width: sliderRef.current ? `${sliderRef.current.offsetWidth}px` : "100%",
                          transform: transformFor("before"),
                          transformOrigin: "center",
                        }} draggable={false} />
                    </div>
                    <div className="absolute top-0 bottom-0 w-1 bg-white shadow-lg cursor-col-resize z-10" style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }} onPointerDown={handlePointerDown}>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-xl flex items-center justify-center border-2 border-primary">
                        <SlidersHorizontal className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                    <div className="absolute top-0 bottom-0 w-px bg-white/80 z-[5]" style={{ left: `${sliderPos}%` }} />
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                    <span>{format(new Date(beforePhoto.taken_at), "MMM d, yyyy")}</span>
                    <span>{format(new Date(afterPhoto.taken_at), "MMM d, yyyy")}</span>
                  </div>
                </TabsContent>

                {/* Side by Side */}
                <TabsContent value="side-by-side" className="mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div
                        className={`relative rounded-xl overflow-hidden border bg-neutral-900 ${zoom.before > 1 ? "touch-none cursor-grab active:cursor-grabbing" : ""}`}
                        onPointerDown={(e) => startPan("before", e)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onWheel={(e) => handleWheel("before", e)}
                      >
                        <img src={beforePhoto.photo_url} alt="Photo 1" className="w-full aspect-[3/4] object-cover"
                          style={{ transform: transformFor("before"), transformOrigin: "center" }} draggable={false} />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                        {format(new Date(beforePhoto.taken_at), "MMM d, yyyy")}
                        {beforePhoto.procedures?.service_name && ` · ${beforePhoto.procedures.service_name}`}
                      </p>
                    </div>
                    <div>
                      <div
                        className={`relative rounded-xl overflow-hidden border bg-neutral-900 ${zoom.after > 1 ? "touch-none cursor-grab active:cursor-grabbing" : ""}`}
                        onPointerDown={(e) => startPan("after", e)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onWheel={(e) => handleWheel("after", e)}
                      >
                        <img src={afterPhoto.photo_url} alt="Photo 2" className="w-full aspect-[3/4] object-cover"
                          style={{ transform: transformFor("after"), transformOrigin: "center" }} draggable={false} />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                        {format(new Date(afterPhoto.taken_at), "MMM d, yyyy")}
                        {afterPhoto.procedures?.service_name && ` · ${afterPhoto.procedures.service_name}`}
                      </p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Analysis Results */}
              {analyzing && (
                <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Analyzing skin changes with AI…</span>
                </div>
              )}
              {analysis && <SkinAnalysisResults analysis={analysis} />}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
