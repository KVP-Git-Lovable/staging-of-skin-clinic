import { useState, useRef, useCallback, useEffect } from "react";
import { X, SlidersHorizontal, Columns2, Sparkles, Loader2 } from "lucide-react";
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

interface Photo {
  id: string;
  photo_url: string;
  photo_type: string;
  taken_at: string;
  notes?: string | null;
  procedures?: { service_name: string } | null;
}

interface SkinTrackerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: Photo[];
  patientName: string;
}

export function SkinTracker({ open, onOpenChange, photos, patientName }: SkinTrackerProps) {
  const [beforePhoto, setBeforePhoto] = useState<Photo | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<Photo | null>(null);
  const [selecting, setSelecting] = useState<"before" | "after" | null>(null);
  const [compareMode, setCompareMode] = useState<"slider" | "side-by-side">("slider");
  const [sliderPos, setSliderPos] = useState(50);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<SkinAnalysis | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handlePointerDown = useCallback(() => { dragging.current = true; }, []);
  const handlePointerUp = useCallback(() => { dragging.current = false; }, []);
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  }, []);

  useEffect(() => {
    const up = () => { dragging.current = false; };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  const reset = () => {
    setBeforePhoto(null);
    setAfterPhoto(null);
    setSelecting(null);
    setSliderPos(50);
    setAnalysis(null);
    setAnalyzing(false);
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

              <Tabs value={compareMode} onValueChange={(v) => setCompareMode(v as "slider" | "side-by-side")}>
                {/* Slider Compare */}
                <TabsContent value="slider" className="mt-3">
                  <div
                    ref={sliderRef}
                    className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border cursor-col-resize select-none touch-none"
                    onPointerMove={handlePointerMove}
                  >
                    <img src={afterPhoto.photo_url} alt="After" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
                    <div className="absolute inset-0 overflow-hidden" style={{ width: `${sliderPos}%` }}>
                      <img src={beforePhoto.photo_url} alt="Before" className="absolute inset-0 w-full h-full object-cover" style={{ width: sliderRef.current ? `${sliderRef.current.offsetWidth}px` : "100%" }} draggable={false} />
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
                      <div className="relative rounded-xl overflow-hidden border">
                        <img src={beforePhoto.photo_url} alt="Photo 1" className="w-full aspect-[3/4] object-cover" />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                        {format(new Date(beforePhoto.taken_at), "MMM d, yyyy")}
                        {beforePhoto.procedures?.service_name && ` · ${beforePhoto.procedures.service_name}`}
                      </p>
                    </div>
                    <div>
                      <div className="relative rounded-xl overflow-hidden border">
                        <img src={afterPhoto.photo_url} alt="Photo 2" className="w-full aspect-[3/4] object-cover" />
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
