import { useState, useRef, useEffect } from "react";
import { Camera, Image, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CameraDialog } from "@/components/shared/CameraDialog";
import { photoBatchMessage, photoFileName } from "@/lib/photoBatch";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface CameraCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientName: string;
  context: "patient" | "appointment" | "procedure";
  contextId?: string; // appointment_id or procedure_id
}

interface Shot {
  file: File;
  /** An object URL, so a ten-photo set is not held twice as base64 as well. */
  url: string;
}

export function CameraCapture({ open, onOpenChange, patientId, patientName, context, contextId }: CameraCaptureProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  /** "Uploading 2 of 5" - a batch takes long enough to need saying. */
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // Open the live camera straight away when the capture dialog is opened.
  useEffect(() => {
    if (open && shots.length === 0) setCameraOpen(true);
    if (!open) setCameraOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const addFiles = (files: File[]) =>
    setShots((prev) => [...prev, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))]);

  const removeShot = (index: number) =>
    setShots((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.url);
      return next;
    });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (shots.length === 0) throw new Error("No photo selected");
      setProgress({ done: 0, total: shots.length });

      // One at a time, keeping whichever fail. A batch that half worked is the
      // case worth getting right: the ones that went in must not be sent
      // again, and the ones that did not must not be quietly lost - see
      // photoBatch.ts.
      const failed: Shot[] = [];
      let uploaded = 0;
      const startedAt = Date.now();

      for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];
        try {
          const fileName = photoFileName(patientId, shot.file.name, i, startedAt);
          const { error: uploadError } = await supabase.storage
            .from("patient-photos")
            .upload(fileName, shot.file);
          if (uploadError) throw uploadError;

          const record: any = {
            patient_id: patientId,
            photo_url: `${SUPABASE_URL}/storage/v1/object/public/patient-photos/${fileName}`,
            notes: notes || null,
          };
          if (context === "appointment" && contextId) record.appointment_id = contextId;
          if (context === "procedure" && contextId) record.procedure_id = contextId;

          const { error } = await supabase.from("patient_photos").insert(record);
          if (error) throw error;
          uploaded++;
        } catch (e) {
          console.error("Photo upload failed", e);
          failed.push(shot);
        }
        setProgress({ done: i + 1, total: shots.length });
      }

      return { uploaded, failed };
    },
    onSuccess: ({ uploaded, failed }) => {
      queryClient.invalidateQueries({ queryKey: ["patient-photos"] });
      setProgress(null);
      const message = photoBatchMessage({ uploaded, failed: failed.length });
      if (failed.length) {
        toast.error(message);
        // The ones that went in are released; the rest stay on screen so they
        // can be sent again without photographing the patient twice.
        setShots((prev) => {
          prev.filter((s) => !failed.includes(s)).forEach((s) => URL.revokeObjectURL(s.url));
          return failed;
        });
        return;
      }
      toast.success(message);
      resetForm();
      onOpenChange(false);
    },
    onError: (e: Error) => {
      setProgress(null);
      toast.error(e.message);
    },
  });

  const resetForm = () => {
    setNotes("");
    setShots((prev) => {
      prev.forEach((s) => URL.revokeObjectURL(s.url));
      return [];
    });
  };

  const uploading = uploadMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) resetForm(); onOpenChange(next); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Take Photo — {patientName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Photos{shots.length > 0 ? ` (${shots.length})` : ""}</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="hidden"
              onChange={handleFileSelect}
            />

            {shots.length > 0 && (
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {shots.map((shot, i) => (
                  <div key={shot.url} className="relative">
                    <img src={shot.url} alt={`Photo ${i + 1}`} className="h-24 w-full object-cover rounded-lg border" />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6"
                      aria-label={`Remove photo ${i + 1}`}
                      disabled={uploading}
                      onClick={() => removeShot(i)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Always offered, so more can be added to a set already taken. */}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={uploading}
                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors disabled:opacity-50"
                onClick={() => setCameraOpen(true)}
              >
                <Camera className="h-7 w-7 mx-auto text-primary mb-1.5" />
                <p className="text-xs font-medium">{shots.length > 0 ? "Take more" : "Camera"}</p>
              </button>
              <button
                type="button"
                disabled={uploading}
                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors disabled:opacity-50"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.removeAttribute("capture");
                    fileInputRef.current.click();
                  }
                }}
              >
                <Image className="h-7 w-7 mx-auto text-muted-foreground mb-1.5" />
                <p className="text-xs font-medium">Gallery</p>
              </button>
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            {/* One note for the set: they are the same visit and the same area,
                and asking for one per photo would undo the point of batching. */}
            <Textarea
              className="mt-1.5"
              placeholder="Area treated, observations..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              disabled={uploading}
            />
            {shots.length > 1 && (
              <p className="mt-1 text-[11px] text-muted-foreground">Saved against all {shots.length} photos.</p>
            )}
          </div>

          <Button className="w-full" onClick={() => uploadMutation.mutate()} disabled={shots.length === 0 || uploading}>
            {uploading
              ? progress
                ? `Uploading ${progress.done} of ${progress.total}…`
                : "Uploading…"
              : shots.length > 1
                ? `Upload ${shots.length} Photos`
                : "Upload Photo"}
          </Button>
        </div>
        <CameraDialog
          open={cameraOpen}
          onOpenChange={setCameraOpen}
          multiple
          onCapture={(file) => addFiles([file])}
          onCaptureMany={addFiles}
        />
      </DialogContent>
    </Dialog>
  );
}
