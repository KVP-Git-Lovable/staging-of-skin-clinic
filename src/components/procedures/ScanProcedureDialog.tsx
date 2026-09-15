import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Camera, Image as ImageIcon, ScanLine, Plus, Trash2, Loader2, AlertTriangle, Check } from "lucide-react";
import { CameraDialog } from "@/components/shared/CameraDialog";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Medicine {
  medicine_name: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}

interface Extracted {
  service_name: string;
  symptoms: string;
  diagnosis: string;
  procedure_notes: string;
  recommendations: string;
  medicines: Medicine[];
  confidence?: "high" | "medium" | "low";
  unclear?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  appointmentId: string;
  patientId: string;
  staffId?: string | null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function ScanProcedureDialog({ open, onOpenChange, appointmentId, patientId, staffId }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [data, setData] = useState<Extracted | null>(null);

  const reset = () => {
    setPreview(null);
    setScanning(false);
    setData(null);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const runScan = async (file: File) => {
    setScanning(true);
    try {
      const dataUrl = await fileToBase64(file);
      setPreview(dataUrl);
      const { data: res, error } = await supabase.functions.invoke("scan-procedure", {
        body: { imageBase64: dataUrl, mimeType: file.type },
      });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
      const extracted: Extracted = res as Extracted;
      setData({
        service_name: extracted.service_name || "",
        symptoms: extracted.symptoms || "",
        diagnosis: extracted.diagnosis || "",
        procedure_notes: extracted.procedure_notes || "",
        recommendations: extracted.recommendations || "",
        medicines: extracted.medicines?.length ? extracted.medicines : [],
        confidence: extracted.confidence,
        unclear: extracted.unclear,
      });
    } catch (e: any) {
      toast.error(e.message || "Could not scan image");
      setPreview(null);
    } finally {
      setScanning(false);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) await runScan(f);
    if (fileRef.current) fileRef.current.value = "";
  };

  const updateMed = (i: number, patch: Partial<Medicine>) => {
    if (!data) return;
    const next = [...data.medicines];
    next[i] = { ...next[i], ...patch };
    setData({ ...data, medicines: next });
  };
  const removeMed = (i: number) => {
    if (!data) return;
    setData({ ...data, medicines: data.medicines.filter((_, idx) => idx !== i) });
  };
  const addMed = () => {
    if (!data) return;
    setData({ ...data, medicines: [...data.medicines, { medicine_name: "" }] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("No data");
      if (!data.service_name.trim()) throw new Error("Service / Procedure name is required");
      const { data: proc, error } = await supabase
        .from("procedures")
        .insert({
          appointment_id: appointmentId,
          patient_id: patientId,
          staff_id: staffId || null,
          service_name: data.service_name.trim(),
          symptoms: data.symptoms || null,
          diagnosis: data.diagnosis || null,
          procedure_notes: data.procedure_notes || null,
          recommendations: data.recommendations || null,
          status: "Completed",
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      const procId = proc.id as string;
      const meds = data.medicines.filter((m) => m.medicine_name?.trim());
      if (meds.length) {
        const { error: pErr } = await supabase.from("prescriptions").insert(
          meds.map((m) => ({
            procedure_id: procId,
            medicine_name: m.medicine_name.trim(),
            dosage: m.dosage || null,
            frequency: m.frequency || null,
            duration: m.duration || null,
            instructions: m.instructions || null,
          })),
        );
        if (pErr) throw pErr;
      }
    },
    onSuccess: () => {
      toast.success("Procedure created from scan");
      qc.invalidateQueries({ queryKey: ["appointment-procedures", appointmentId] });
      qc.invalidateQueries({ queryKey: ["procedures"] });
      handleClose(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" /> Scan Procedure Notes
          </DialogTitle>
        </DialogHeader>

        {!data && !scanning && (
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              Capture or upload a photo of handwritten procedure notes. AI will extract structured fields for review.
            </p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors"
                onClick={() => setCameraOpen(true)}
              >
                <Camera className="h-8 w-8 mx-auto text-primary mb-2" />
                <p className="text-sm font-medium">Camera</p>
              </button>
              <button
                type="button"
                className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Upload</p>
              </button>
            </div>
          </div>
        )}

        {scanning && (
          <div className="py-10 flex flex-col items-center gap-3">
            {preview && <img src={preview} alt="" className="max-h-40 rounded border" />}
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Reading notes…</p>
          </div>
        )}

        {data && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-3">
              {preview && <img src={preview} alt="" className="h-16 w-16 object-cover rounded border" />}
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">Confidence: {data.confidence || "—"}</Badge>
                  {data.unclear && (
                    <Badge variant="outline" className="text-xs bg-warning/15 text-warning border-warning/30 gap-1">
                      <AlertTriangle className="h-3 w-3" /> Could not read clearly. Please review and edit manually.
                    </Badge>
                  )}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={reset}>Re-scan</Button>
            </div>

            <div>
              <Label>Service / Procedure Name *</Label>
              <Input className="mt-1.5" value={data.service_name} onChange={(e) => setData({ ...data, service_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Symptoms</Label>
                <Textarea className="mt-1.5" rows={3} value={data.symptoms} onChange={(e) => setData({ ...data, symptoms: e.target.value })} />
              </div>
              <div>
                <Label>Diagnosis</Label>
                <Textarea className="mt-1.5" rows={3} value={data.diagnosis} onChange={(e) => setData({ ...data, diagnosis: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Procedure Notes</Label>
              <Textarea className="mt-1.5" rows={3} value={data.procedure_notes} onChange={(e) => setData({ ...data, procedure_notes: e.target.value })} />
            </div>
            <div>
              <Label>Recommendations</Label>
              <Textarea className="mt-1.5" rows={2} value={data.recommendations} onChange={(e) => setData({ ...data, recommendations: e.target.value })} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Medicines / Prescriptions</Label>
                <Button size="sm" variant="outline" onClick={addMed} className="gap-1 h-7">
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </div>
              {data.medicines.length === 0 && (
                <p className="text-xs text-muted-foreground">No medicines extracted.</p>
              )}
              {data.medicines.map((m, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-2 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Medicine name"
                      value={m.medicine_name}
                      onChange={(e) => updateMed(i, { medicine_name: e.target.value })}
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => removeMed(i)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Input placeholder="Dosage" value={m.dosage || ""} onChange={(e) => updateMed(i, { dosage: e.target.value })} />
                    <Input placeholder="Frequency" value={m.frequency || ""} onChange={(e) => updateMed(i, { frequency: e.target.value })} />
                    <Input placeholder="Duration" value={m.duration || ""} onChange={(e) => updateMed(i, { duration: e.target.value })} />
                  </div>
                  <Input placeholder="Instructions (optional)" value={m.instructions || ""} onChange={(e) => updateMed(i, { instructions: e.target.value })} />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-1.5">
                <Check className="h-4 w-4" />
                {saveMutation.isPending ? "Saving…" : "Confirm & Create Procedure"}
              </Button>
            </div>
          </div>
        )}

        <CameraDialog
          open={cameraOpen}
          onOpenChange={setCameraOpen}
          title="Scan Procedure Notes"
          onCapture={(file) => runScan(file)}
        />
      </DialogContent>
    </Dialog>
  );
}