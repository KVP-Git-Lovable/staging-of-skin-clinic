import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { attachmentStoragePath } from "@/lib/attachmentPath";
import { uploadFailureMessage, uploadSuccessMessage, type FailedUpload } from "@/lib/uploadSummary";
import { hashImageFile } from "@/lib/photoHashImage";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface Props {
  patientId: string;
  /** Set so the photo lands under "This Appointment" rather than only the patient's pile. */
  appointmentId?: string | null;
  procedureId?: string | null;
  size?: "sm" | "default";
  /** So it sits flush with whatever buttons it is placed beside. */
  className?: string;
}

/**
 * Attach photos already on the machine - several at once.
 *
 * The patient tab could only take one at a time, and the appointment tab had no
 * attach option at all, because the photo UI was copied into three screens
 * instead of shared. This is the one control both now render, so a fourth copy
 * of the upload code is not written the next time a screen needs it.
 *
 * Modelled on PatientAttachments, which already does this well: every file is
 * attempted on its own so one bad photo cannot drop the rest of the batch, and
 * the count on the button says how far through it is.
 */
export function AttachPhotosButton({ patientId, appointmentId, procedureId, size = "default", className }: Props) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const upload = async (files: File[]) => {
    if (files.length === 0 || !patientId) return;
    setUploading(true);
    setProgress({ done: 0, total: files.length });

    // Tracked by position, not by name: two photos can both arrive called
    // "WhatsApp Image.jpeg".
    const failed: FailedUpload[] = [];
    let uploaded = 0;

    for (const [index, file] of files.entries()) {
      try {
        // Not `${patientId}/${Date.now()}.${ext}`, which is what the single-file
        // path used: in a loop several files land in the same millisecond and
        // Supabase rejects the duplicate key. The URL keeps the
        // /patient-photos/ prefix the delete paths split on.
        const filePath = attachmentStoragePath(patientId, file.name, index);
        const { error: uploadError } = await supabase.storage.from("patient-photos").upload(filePath, file);
        if (uploadError) throw uploadError;

        const photoUrl = `${SUPABASE_URL}/storage/v1/object/public/patient-photos/${filePath}`;
        // The photo's fingerprint, so this picture can be found again later
        // from a copy of itself - see src/lib/photoHash.ts. Never allowed to
        // fail an upload: an image the browser cannot decode saves with a null
        // and the backfill in Settings picks it up afterwards.
        const phash = await hashImageFile(file);
        const { error } = await supabase.from("patient_photos").insert({
          patient_id: patientId,
          appointment_id: appointmentId || null,
          procedure_id: procedureId || null,
          photo_url: photoUrl,
          phash,
          notes: null,
          // photo_type is left to the column default, exactly as the patient
          // tab already did - attaching a photo should not grow a new prompt.
        });
        if (error) throw error;
        uploaded += 1;
      } catch (err) {
        failed.push({ index, name: file.name, reason: err instanceof Error ? err.message : "Upload failed" });
      } finally {
        setProgress({ done: index + 1, total: files.length });
      }
    }

    const success = uploadSuccessMessage(uploaded, "Photo", "photos");
    if (success) toast.success(success);
    const failure = uploadFailureMessage(failed, files.length);
    if (failure) toast.error(failure);

    setUploading(false);
    setProgress(null);
    // The bare key prefix-matches what the patient, appointment and procedure
    // screens each listen on, so whichever is open catches up.
    queryClient.invalidateQueries({ queryKey: ["patient-photos"] });
  };

  return (
    <>
      {/* accept="image/*" with no capture attribute is what makes a phone offer
          the gallery rather than jumping straight into the camera. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          // Cleared so picking the same files again still fires change.
          e.target.value = "";
          void upload(files);
        }}
      />
      <Button
        variant="outline"
        size={size === "sm" ? "sm" : "default"}
        className={cn("gap-1.5", className)}
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
        {uploading
          ? progress && progress.total > 1
            ? `Uploading ${progress.done} of ${progress.total}`
            : "Uploading..."
          : "Attach Photo"}
      </Button>
    </>
  );
}
