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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CameraDialog } from "@/components/shared/CameraDialog";

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  // Open the live camera straight away when the capture dialog is opened.
  useEffect(() => {
    if (open && !selectedFile) setCameraOpen(true);
    if (!open) setCameraOpen(false);
  }, [open]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No photo selected");

      const ext = selectedFile.name.split(".").pop() || "jpg";
      const fileName = `${patientId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("patient-photos")
        .upload(fileName, selectedFile);
      if (uploadError) throw uploadError;

      const photoUrl = `${SUPABASE_URL}/storage/v1/object/public/patient-photos/${fileName}`;

      const record: any = {
        patient_id: patientId,
        photo_url: photoUrl,
        notes: notes || null,
      };

      if (context === "appointment" && contextId) record.appointment_id = contextId;
      if (context === "procedure" && contextId) record.procedure_id = contextId;

      const { error } = await supabase.from("patient_photos").insert(record);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-photos"] });
      toast.success("Photo uploaded successfully");
      resetForm();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetForm = () => {
    setNotes("");
    setSelectedFile(null);
    setPreview(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Take Photo — {patientName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* File input with camera capture support for mobile */}
          <div>
            <Label>Photo</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileSelect}
            />
            {preview ? (
              <div className="mt-1.5 relative">
                <img src={preview} alt="Preview" className="w-full h-48 object-cover rounded-lg border" />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute top-2 right-2 h-7 w-7"
                  onClick={() => { setSelectedFile(null); setPreview(null); }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setCameraOpen(true)}
                >
                  <Camera className="h-8 w-8 mx-auto text-primary mb-2" />
                  <p className="text-xs font-medium">Camera</p>
                </button>
                <button
                  type="button"
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.removeAttribute("capture");
                      fileInputRef.current.click();
                    }
                  }}
                >
                  <Image className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-xs font-medium">Gallery</p>
                </button>
              </div>
            )}
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea className="mt-1.5" placeholder="Area treated, observations..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <Button className="w-full" onClick={() => uploadMutation.mutate()} disabled={!selectedFile || uploadMutation.isPending}>
            {uploadMutation.isPending ? "Uploading..." : "Upload Photo"}
          </Button>
        </div>
        <CameraDialog
          open={cameraOpen}
          onOpenChange={setCameraOpen}
          onCapture={(file) => {
            setSelectedFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setPreview(reader.result as string);
            reader.readAsDataURL(file);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
