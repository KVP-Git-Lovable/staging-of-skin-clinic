import { useState } from "react";
import { Camera, ScanEye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Patient360 } from "@/components/patients/Patient360";
import { CaseAnalysis } from "@/components/shared/CaseAnalysis";
import { SkinTracker } from "@/components/shared/SkinTracker";
import { CameraCapture } from "@/components/shared/CameraCapture";

interface PatientToolsBarProps {
  patientId: string;
  patientName: string;
  /** Context the captured photo should be attached to */
  context?: "patient" | "appointment" | "procedure";
  contextId?: string;
  className?: string;
}

/**
 * The same set of patient tools available on the Patient detail page —
 * AI 360, Case Analysis, Take Photo and Skin Tracker.
 * Reused inside procedure forms / detail views (edit and view mode).
 */
export function PatientToolsBar({
  patientId, patientName, context = "patient", contextId, className = "",
}: PatientToolsBarProps) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [skinTrackerOpen, setSkinTrackerOpen] = useState(false);

  const { data: photos = [] } = useQuery({
    queryKey: ["patient-tools-photos", patientId],
    enabled: !!patientId && skinTrackerOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_photos")
        .select("*, procedures(service_name)")
        .eq("patient_id", patientId)
        .order("taken_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  if (!patientId) return null;

  return (
    <>
      <div className={`flex gap-2 flex-wrap ${className}`}>
        <Patient360 patientId={patientId} patientName={patientName} />
        <CaseAnalysis patientId={patientId} patientName={patientName} />
        <Button type="button" variant="outline" size="sm" className="gap-1 h-8 text-xs" onClick={() => setCameraOpen(true)}>
          <Camera className="h-3.5 w-3.5" /> Take Photo
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-1 h-8 text-xs" onClick={() => setSkinTrackerOpen(true)}>
          <ScanEye className="h-3.5 w-3.5" /> Skin Tracker
        </Button>
      </div>

      {cameraOpen && (
        <CameraCapture
          open={cameraOpen}
          onOpenChange={setCameraOpen}
          patientId={patientId}
          patientName={patientName}
          context={context}
          contextId={contextId}
        />
      )}

      {skinTrackerOpen && (
        <SkinTracker
          open={skinTrackerOpen}
          onOpenChange={setSkinTrackerOpen}
          photos={photos as any}
          patientName={patientName}
        />
      )}
    </>
  );
}