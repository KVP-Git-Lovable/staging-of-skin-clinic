import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { uploadStaffPhoto } from "@/lib/staffPhoto";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CameraDialog } from "@/components/shared/CameraDialog";

/**
 * The photo a staff member's attendance selfie is checked against.
 *
 * Deliberately self-service and on their own profile page, not something an
 * admin sets for them: the clinic chose the Bharath Builders flow, where the
 * employee registers their own face before they can start checking in.
 *
 * It writes to staff.photo_url, which is the existing column the staff record
 * already has - nothing new is introduced to hold it.
 *
 * The card says in plain words what the photo is for. A picture used to
 * recognise someone's face is biometric use of their image, and finding that
 * out by accident is not consent.
 */
export function StaffPhotoCard({ staffId, photoUrl, name }: { staffId: string; photoUrl: string | null; name: string }) {
  const qc = useQueryClient();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async (file: File) => {
    setBusy(true);
    try {
      // Shared with the attendance page, where somebody registers their face
      // mid-check-in - one upload path, not two that can drift.
      await uploadStaffPhoto(staffId, file);
      await qc.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Profile photo saved. You can check in now.");
      // useAuth reads the staff row once at sign-in, so the page needs to
      // re-read it for the attendance screen to see the new photo.
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the photo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Camera className="h-4 w-4" />Your photo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-4">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border flex items-center justify-center">
            {photoUrl
              ? <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
              : <Camera className="h-6 w-6 text-muted-foreground" />}
          </div>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              This photo is compared against the selfie you take when you check in and out,
              to confirm it is really you. Face a window, look straight at the camera, and
              keep your whole face visible.
            </p>
            {!photoUrl && (
              <p className="text-destructive">
                You need a photo here before you can check in.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setCameraOpen(true)}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
            {photoUrl ? "Retake photo" : "Take photo"}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={busy} asChild>
            <label className="cursor-pointer">
              <Upload className="h-4 w-4 mr-2" />Upload
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void save(file);
                }}
              />
            </label>
          </Button>
        </div>
      </CardContent>

      <CameraDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        title="Take your profile photo"
        defaultFacing="user"
        onCapture={(file) => { setCameraOpen(false); void save(file); }}
      />
    </Card>
  );
}
