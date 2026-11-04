import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, ImageIcon, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CameraDialog } from "@/components/shared/CameraDialog";
import { PatientAvatar } from "@/components/patients/PatientAvatar";
import { avatarStoragePath } from "@/lib/patientAvatar";

/**
 * Setting the picture on a patient's record.
 *
 * The app already had two halves of this and no way to join them: PatientAvatar
 * draws a patient's picture, and usePatientAvatars guesses which of their
 * photos it should be, scoring the set for something front-facing. The profile
 * header used neither - it drew raw initials - and nobody could say "no, THIS
 * one".
 *
 * So this is the choosing half. What it writes to patients.avatar_url beats the
 * guess everywhere the guess is used, which is what makes it the patient's
 * picture rather than just this page's.
 *
 * A photo chosen from the patient's own set is REFERENCED where it already
 * lives rather than copied, so the two cannot drift apart. The cost is that
 * deleting that photo leaves this pointing at nothing - PatientAvatar already
 * falls back to initials when an image will not load, which is exactly the
 * behaviour wanted here.
 *
 * A portrait taken here is uploaded to storage and deliberately NOT written to
 * patient_photos: the clinic keeps the Photos tab, Skin Tracker and photo
 * search purely clinical.
 */
interface PatientAvatarEditorProps {
  patientId: string;
  firstName?: string | null;
  lastName?: string | null;
  /** The explicit choice. Null shows initials - not the auto-picked photo,
   *  which would put a clinical close-up at the top of the record nobody asked
   *  to see there. */
  avatarUrl?: string | null;
  /** The patient's photos, already loaded for the Photos tab. */
  photos?: { id: string; photo_url: string }[];
  className?: string;
}

export function PatientAvatarEditor({
  patientId, firstName, lastName, avatarUrl, photos = [], className,
}: PatientAvatarEditorProps) {
  const queryClient = useQueryClient();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const refresh = () => {
    // The picture is the patient's from this moment - no save step. The avatar
    // cache is keyed by the id list, so every list showing them is refreshed.
    queryClient.invalidateQueries({ queryKey: ["patient", patientId] });
    queryClient.invalidateQueries({ queryKey: ["patient-avatars"] });
  };

  const setAvatar = useMutation({
    mutationFn: async (url: string | null) => {
      // `as never` rather than `any`: patients.avatar_url was added by
      // 20261030140000 and the generated types are regenerated on sync, so
      // until then the column is real and the types do not know it.
      const { error } = await supabase
        .from("patients")
        .update({ avatar_url: url } as never)
        .eq("id", patientId);
      if (error) throw error;
      return url;
    },
    onSuccess: (url) => {
      refresh();
      toast.success(url ? "Profile picture updated" : "Profile picture removed");
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const path = avatarStoragePath(patientId, file.name);
      const { error } = await supabase.storage
        .from("patient-photos")
        .upload(path, file, { contentType: file.type || "image/jpeg" });
      if (error) throw error;
      return supabase.storage.from("patient-photos").getPublicUrl(path).data.publicUrl;
    },
    onSuccess: (url) => setAvatar.mutate(url),
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const busy = upload.isPending || setAvatar.isPending;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Change profile picture"
            className="group relative shrink-0 rounded-full ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PatientAvatar
              firstName={firstName}
              lastName={lastName}
              photoUrl={avatarUrl}
              showFallbackIndicator={false}
              className={cn("h-12 w-12 md:h-16 md:w-16 text-lg md:text-xl", className)}
            />
            {/* Only on hover, so the picture is not permanently under a badge. */}
            <span className="absolute inset-0 hidden items-center justify-center rounded-full bg-black/45 text-white group-hover:flex">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem onClick={() => setCameraOpen(true)}>
            <Camera className="h-3.5 w-3.5 mr-2" /> Take photo
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPickerOpen(true)} disabled={photos.length === 0}>
            <ImageIcon className="h-3.5 w-3.5 mr-2" />
            {photos.length === 0 ? "No photos yet" : "Choose from photos"}
          </DropdownMenuItem>
          {avatarUrl && (
            <DropdownMenuItem onClick={() => setAvatar.mutate(null)} className="text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove photo
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <CameraDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        title="Take profile picture"
        onCapture={(file) => { setCameraOpen(false); upload.mutate(file); }}
      />

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose a profile picture</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto">
            {photos.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-label="Use this photo"
                className={cn(
                  "relative aspect-square overflow-hidden rounded-lg border transition hover:ring-2 hover:ring-primary",
                  avatarUrl === p.photo_url && "ring-2 ring-primary",
                )}
                onClick={() => { setPickerOpen(false); setAvatar.mutate(p.photo_url); }}
              >
                <img src={p.photo_url} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default PatientAvatarEditor;
