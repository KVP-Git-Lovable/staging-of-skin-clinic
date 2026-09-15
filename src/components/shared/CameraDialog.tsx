import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X, Check, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface CameraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
  title?: string;
}

export function CameraDialog({ open, onOpenChange, onCapture, title = "Take Photo" }: CameraDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileFallbackRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

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
        throw new Error("Camera API not supported in this browser");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode } },
        audio: false,
      });
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

  useEffect(() => {
    if (open && !capturedFile) {
      startStream(facingMode);
    }
    if (!open) {
      stopStream();
      setCapturedFile(null);
      setPreviewUrl(null);
      setError(null);
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
    setFacingMode((m) => (m === "environment" ? "user" : "environment"));
  };

  const handleFallbackFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onCapture(file);
      onOpenChange(false);
    }
    e.target.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="font-display">{title}</DialogTitle>
        </DialogHeader>
        <div className="relative bg-black aspect-[4/3] flex items-center justify-center">
          {error ? (
            <div className="text-center p-6 text-white space-y-3">
              <Camera className="h-10 w-10 mx-auto opacity-60" />
              <p className="text-sm">{error}</p>
              <input
                ref={fileFallbackRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFallbackFile}
              />
              <Button variant="secondary" size="sm" onClick={() => fileFallbackRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1.5" /> Choose from device
              </Button>
            </div>
          ) : previewUrl ? (
            <img src={previewUrl} alt="Captured" className="w-full h-full object-contain" />
          ) : (
            <>
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
                  Starting camera…
                </div>
              )}
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <div className="flex items-center justify-between gap-2 p-4 bg-card">
          {previewUrl ? (
            <>
              <Button variant="outline" size="sm" onClick={handleRetake}>
                <RefreshCw className="h-4 w-4 mr-1.5" /> Retake
              </Button>
              <Button size="sm" onClick={handleUse}>
                <Check className="h-4 w-4 mr-1.5" /> Use Photo
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
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
      </DialogContent>
    </Dialog>
  );
}
