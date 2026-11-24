import { useState, useRef, useEffect } from "react";
import { AlertTriangle, Camera, Check, Image, Loader2, X } from "lucide-react";
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
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CameraDialog } from "@/components/shared/CameraDialog";
import { photoBatchMessage, photoFileName } from "@/lib/photoBatch";
import {
  photoQueueAction,
  photoQueueLabel,
  photoQueueSummary,
  savedPhotoIds,
  shotsToRetry,
  type QueuedShot,
  type ShotStatus,
} from "@/lib/photoQueue";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface CameraCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientName: string;
  context: "patient" | "appointment" | "procedure";
  contextId?: string; // appointment_id or procedure_id
}

export function CameraCapture({ open, onOpenChange, patientId, patientName, context, contextId }: CameraCaptureProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState("");
  const [shots, setShots] = useState<QueuedShot[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);

  /** Read inside an upload, so a note typed before the shot goes in with it. */
  const notesRef = useRef("");
  useEffect(() => { notesRef.current = notes; }, [notes]);

  /**
   * The position passed to photoFileName. Uploads now start one at a time
   * rather than inside one loop, so a shared counter is what keeps two
   * photos taken in the same millisecond from overwriting each other.
   */
  const seq = useRef(0);

  // Open the live camera straight away when the capture dialog is opened.
  useEffect(() => {
    if (open && shots.length === 0) setCameraOpen(true);
    if (!open) setCameraOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * An upload outlives the dialog on purpose: closing it, or the phone tearing
   * the page down, must not stop a photo reaching the record. If the component
   * has gone by the time one finishes, this is a no-op and the row is in
   * anyway - which is the whole point of sending them one at a time.
   */
  const setStatus = (url: string, status: ShotStatus, photoId?: string) =>
    setShots((prev) => prev.map((s) => (s.url === url ? { ...s, status, photoId } : s)));

  /**
   * Put one photo on the record, now.
   *
   * The same storage path, the same patient_photos row and the same context
   * columns as before - only the moment has changed.
   */
  const sendOne = async (shot: QueuedShot) => {
    try {
      const fileName = photoFileName(patientId, shot.file.name, seq.current++);
      const { error: uploadError } = await supabase.storage
        .from("patient-photos")
        .upload(fileName, shot.file);
      if (uploadError) throw uploadError;

      const record: any = {
        patient_id: patientId,
        photo_url: `${SUPABASE_URL}/storage/v1/object/public/patient-photos/${fileName}`,
        notes: notesRef.current || null,
      };
      if (context === "appointment" && contextId) record.appointment_id = contextId;
      if (context === "procedure" && contextId) record.procedure_id = contextId;

      const { data, error } = await supabase
        .from("patient_photos")
        .insert(record)
        .select("id")
        .single();
      if (error) throw error;

      setStatus(shot.url, "saved", data?.id);
      queryClient.invalidateQueries({ queryKey: ["patient-photos"] });
    } catch (e) {
      console.error("Photo upload failed", e);
      setStatus(shot.url, "failed");
      toast.error("A photo could not be saved — it is still here to try again");
    }
  };

  /**
   * Every route in - the live camera, the phone's own camera and the gallery -
   * arrives here, and every one of them is sent immediately.
   */
  const addFiles = (files: File[]) => {
    const queued: QueuedShot[] = files.map((file) => ({
      file,
      url: URL.createObjectURL(file),
      status: "uploading",
    }));
    setShots((prev) => [...prev, ...queued]);
    queued.forEach((shot) => { void sendOne(shot); });
  };

  /** Only a failed shot can be dropped: a saved one is on the patient's record. */
  const removeShot = (url: string) =>
    setShots((prev) => {
      const gone = prev.find((s) => s.url === url);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((s) => s.url !== url);
    });

  const retryFailed = () => {
    const again = shotsToRetry(shots);
    setShots((prev) => prev.map((s) => (s.status === "failed" ? { ...s, status: "uploading" } : s)));
    again.forEach((shot) => { void sendOne(shot); });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const resetForm = () => {
    setNotes("");
    setShots((prev) => {
      prev.forEach((s) => URL.revokeObjectURL(s.url));
      return [];
    });
  };

  /**
   * Close, and put the note on what was saved.
   *
   * A note typed before a photo went in with it already; this is for one
   * typed afterwards, and it makes the stored note match what is on screen.
   */
  const finish = async () => {
    const ids = savedPhotoIds(shots);
    const summary = photoQueueSummary(shots);
    if (ids.length) {
      setFinishing(true);
      const { error } = await supabase
        .from("patient_photos")
        .update({ notes: notes || null })
        .in("id", ids);
      setFinishing(false);
      if (error) {
        console.error("Photo note failed", error);
        toast.error("The photos are saved, but the note could not be");
      }
      queryClient.invalidateQueries({ queryKey: ["patient-photos"] });
    }
    if (summary.total > 0) {
      const message = photoBatchMessage({ uploaded: summary.saved, failed: summary.failed });
      if (summary.failed) toast.error(message);
      else toast.success(message);
    }
    resetForm();
    onOpenChange(false);
  };

  const summary = photoQueueSummary(shots);
  const action = photoQueueAction(summary);
  const busy = summary.uploading > 0 || finishing;

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
                    <img
                      src={shot.url}
                      alt={`Photo ${i + 1}`}
                      className={`h-24 w-full object-cover rounded-lg border ${shot.status === "failed" ? "opacity-60" : ""}`}
                    />
                    {/* Each photo says for itself whether it is on the record. */}
                    {shot.status === "uploading" && (
                      <span
                        className="absolute top-1 right-1 h-6 w-6 rounded-md bg-background/90 border grid place-items-center"
                        aria-label={`Saving photo ${i + 1}`}
                      >
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      </span>
                    )}
                    {shot.status === "saved" && (
                      <span
                        className="absolute top-1 right-1 h-6 w-6 rounded-md bg-background/90 border grid place-items-center"
                        aria-label={`Photo ${i + 1} saved`}
                        title="Saved to the patient's record"
                      >
                        <Check className="h-3.5 w-3.5 text-primary" />
                      </span>
                    )}
                    {shot.status === "failed" && (
                      <>
                        <span
                          className="absolute bottom-1 left-1 h-6 w-6 rounded-md bg-background/90 border grid place-items-center"
                          aria-label={`Photo ${i + 1} not saved`}
                          title="Not saved yet"
                        >
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="absolute top-1 right-1 h-6 w-6"
                          aria-label={`Remove photo ${i + 1}`}
                          disabled={busy}
                          onClick={() => removeShot(shot.url)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Always offered, so more can be added to a set already taken. */}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={finishing}
                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors disabled:opacity-50"
                onClick={() => setCameraOpen(true)}
              >
                <Camera className="h-7 w-7 mx-auto text-primary mb-1.5" />
                <p className="text-xs font-medium">{shots.length > 0 ? "Take more" : "Camera"}</p>
              </button>
              <button
                type="button"
                disabled={finishing}
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
              disabled={finishing}
            />
            {shots.length > 1 && (
              <p className="mt-1 text-[11px] text-muted-foreground">Saved against all {shots.length} photos.</p>
            )}
          </div>

          <Button
            className="w-full"
            onClick={() => (action === "retry" ? retryFailed() : void finish())}
            disabled={busy}
          >
            {photoQueueLabel(summary)}
          </Button>
          {summary.saved > 0 && (
            <p className="-mt-2 text-center text-[11px] text-muted-foreground">
              {summary.saved === 1 ? "1 photo is" : `${summary.saved} photos are`} already on the record — closing
              will not lose {summary.saved === 1 ? "it" : "them"}.
            </p>
          )}
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
