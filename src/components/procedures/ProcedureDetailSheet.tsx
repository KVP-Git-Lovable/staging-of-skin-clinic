import { useState, useRef, useEffect } from "react";

import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Save, Trash2, Pill, Camera, Plus, Paperclip, X, Sparkles, Loader2, Download, MessageCircle, Repeat, Receipt, HeartPulse, ClipboardList, StickyNote, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { SystemRecordSection } from "@/components/shared/SystemRecordSection";
import { RecordOwnerField } from "@/components/shared/RecordOwnerField";
import { FieldHistorySection } from "@/components/shared/FieldHistorySection";
import { moveToTrash } from "@/lib/trash";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CameraCapture } from "@/components/shared/CameraCapture";
import { MicButton } from "@/components/shared/MicButton";
import { PatientToolsBar } from "@/components/shared/PatientToolsBar";
import { StaffCombobox } from "@/components/shared/StaffCombobox";
import { StaffMultiCombobox } from "@/components/shared/StaffMultiCombobox";
import { SurveyHistoryPanel } from "@/components/surveys/SurveyHistoryPanel";
import { ProcedureStickyNotes } from "@/components/procedures/ProcedureStickyNotes";
import { OTHERS_VALUE } from "@/lib/othersOption";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const statusOptions = ["Completed", "In Progress", "Cancelled"];
// patients.skin_type has a DB check constraint restricting it to these
// exact values - must stay a dropdown, not free text, or saving fails.
const SKIN_TYPE_OPTIONS = ["Normal", "Dry", "Oily", "Combination", "Sensitive"];

interface PrescriptionRow {
  id?: string;
  product_id: string;
  medicine_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  quantity: number;
  _deleted?: boolean;
}

interface ServiceLineRow {
  id?: string;
  key: string;
  service_id: string | null;
  service_name: string;
  procedure_notes: string;
  recommendations: string;
  material_percent: string;
  price: number;
  _deleted?: boolean;
}

interface ProcedureDetailSheetProps {
  procedureId: string | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

export function ProcedureDetailSheet({ procedureId, onClose, onSaved }: ProcedureDetailSheetProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Belt-and-braces scroll lock: Radix's own lock only ever touches
  // document.body (this app's real scroll container is <main
  // overflow-auto> in AppLayout.tsx - see the body[data-scroll-locked]
  // rule in index.css), and relying on that CSS attribute hook alone
  // wasn't reliably taking effect. Lock <main> directly here instead,
  // tied to this sheet's own open/close lifecycle - no dependency on
  // Radix internals or CSS cascade timing.
  useEffect(() => {
    if (!procedureId) return;
    const main = document.querySelector("main");
    if (!main) return;
    const prevOverflow = main.style.overflow;
    main.style.overflow = "hidden";
    return () => {
      main.style.overflow = prevOverflow;
    };
  }, [procedureId]);

  const [cameraOpen, setCameraOpen] = useState(false);

  const [initialized, setInitialized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editable fields
  const [editServiceName, setEditServiceName] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editStaffId, setEditStaffId] = useState("");
  const [medical, setMedical] = useState<Record<string, string>>({});
  const [medicalDirty, setMedicalDirty] = useState(false);
  const [editProcedureNotes, setEditProcedureNotes] = useState("");
  const [editRecommendations, setEditRecommendations] = useState("");
  const [editReviewNotes, setEditReviewNotes] = useState("");
  const [editAssistedByIds, setEditAssistedByIds] = useState<string[]>([]);
  const [editServiceLines, setEditServiceLines] = useState<ServiceLineRow[]>([]);
  const [servicesInitialized, setServicesInitialized] = useState(false);
  const [editPrescriptions, setEditPrescriptions] = useState<PrescriptionRow[]>([]);
  const [attachmentNotes, setAttachmentNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [elaborating, setElaborating] = useState<null | string>(null);

  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [previewingPdf, setPreviewingPdf] = useState(false);
  const [sendingWa, setSendingWa] = useState(false);

  const fetchPrescriptionPdf = async () => {
    if (!procedureId) return null;
    const { data, error } = await supabase.functions.invoke("generate-prescription-pdf", {
      body: { procedureId },
    });
    if (error) throw error;
    if (!data?.base64) throw new Error("No PDF returned");
    const bin = atob(data.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    return { url: URL.createObjectURL(blob), filename: data.filename || "Prescription.pdf" };
  };

  const handleDownloadPrescription = async () => {
    setDownloadingPdf(true);
    try {
      const pdf = await fetchPrescriptionPdf();
      if (!pdf) return;
      const a = document.createElement("a");
      a.href = pdf.url;
      a.download = pdf.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(pdf.url);
      toast.success("Prescription downloaded");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate prescription");
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Opens the same PDF the browser's native viewer instead of forcing a
  // download - lets staff/patients view or print it without a file piling
  // up on their device every time.
  const handlePreviewPrescription = async () => {
    setPreviewingPdf(true);
    try {
      const pdf = await fetchPrescriptionPdf();
      if (!pdf) return;
      window.open(pdf.url, "_blank");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate prescription");
    } finally {
      setPreviewingPdf(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!procedureId) return;
    setSendingWa(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-prescription-whatsapp", {
        body: { procedureId },
      });
      if (error) throw error;
      toast.success(data?.message || "Prescription queued for WhatsApp");
      refetchAttachments();
    } catch (e: any) {
      toast.error(e.message || "Failed to send via WhatsApp");
    } finally {
      setSendingWa(false);
    }
  };

  const elaborateLine = async (lineKey: string, fieldType: "procedure_notes" | "recommendations") => {
    const line = editServiceLines.find((l) => l.key === lineKey);
    if (!line) return;
    const svcName = (line.service_name || editServiceName || "Consultation").trim();
    const currentText = fieldType === "procedure_notes" ? line.procedure_notes : line.recommendations;
    setElaborating(`${lineKey}:${fieldType}`);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/elaborate-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ serviceName: svcName, fieldType, currentText }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "AI request failed" })); throw new Error(err.error || "AI request failed"); }
      const { text } = await res.json();
      setEditServiceLines((prev) => prev.map((l) => (l.key === lineKey ? { ...l, [fieldType]: text } : l)));
      toast.success("Text elaborated");
    } catch (e: any) { toast.error(e.message || "Failed to elaborate"); }
    finally { setElaborating(null); }
  };


  const { data: procedure, isLoading } = useQuery({
    queryKey: ["procedure-detail", procedureId],
    queryFn: async () => {
      if (!procedureId) return null;
      const { data, error } = await supabase
        .from("procedures")
        .select("*, patients(first_name, last_name), staff:staff!procedures_staff_id_fkey(first_name, last_name)")
        .eq("id", procedureId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!procedureId,
  });

  const { data: prescriptions = [] } = useQuery({
    queryKey: ["procedure-prescriptions", procedureId],
    queryFn: async () => {
      if (!procedureId) return [];
      const { data, error } = await supabase.from("prescriptions").select("*").eq("procedure_id", procedureId);
      if (error) throw error;
      return data;
    },
    enabled: !!procedureId,
  });

  const { data: procedureServices = [], isLoading: procedureServicesLoading } = useQuery({
    queryKey: ["procedure-services", procedureId],
    queryFn: async () => {
      if (!procedureId) return [];
      const { data, error } = await supabase
        .from("procedure_services")
        .select("*")
        .eq("procedure_id", procedureId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!procedureId,
  });

  const { data: servicesMaster = [] } = useQuery({
    queryKey: ["services-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("id, name, price, material_percent, procedure_notes, recommendations").order("name");
      if (error) throw error;
      return data;
    },
  });



  const { data: photos = [] } = useQuery({
    queryKey: ["procedure-photos", procedureId],
    queryFn: async () => {
      if (!procedureId) return [];
      const { data, error } = await supabase.from("patient_photos").select("*").eq("procedure_id", procedureId).order("taken_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!procedureId,
  });

  const { data: attachments = [], refetch: refetchAttachments } = useQuery({
    queryKey: ["procedure-attachments", procedureId],
    queryFn: async () => {
      if (!procedureId) return [];
      const { data, error } = await supabase.from("procedure_attachments").select("*").eq("procedure_id", procedureId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!procedureId,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["pharma-products-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pharma_products").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Patient medical snapshot — editable here and synced back to the patient record
  const { data: patientRecord } = useQuery({
    queryKey: ["procedure-detail-patient", procedure?.patient_id],
    enabled: !!procedure?.patient_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, medical_history, current_medications, allergies, skin_type, skin_concerns, previous_treatments")
        .eq("id", procedure!.patient_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (patientRecord && !medicalDirty && Object.keys(medical).length === 0) {
    setMedical({
      symptoms: (procedure as any)?.symptoms || "",
      diagnosis: (procedure as any)?.diagnosis || "",
      lab_tests: (procedure as any)?.lab_tests || "",
      medical_history: patientRecord.medical_history || "",
      current_medications: patientRecord.current_medications || "",
      allergies: patientRecord.allergies || "",
      skin_type: patientRecord.skin_type || "",
      skin_concerns: patientRecord.skin_concerns || "",
      previous_treatments: patientRecord.previous_treatments || "",
    });
  }

  // Initialize form
  if (procedure && !initialized) {
    setEditServiceName(procedure.service_name || "");
    setEditStatus(procedure.status || "Completed");
    setEditStaffId(procedure.staff_id || "");
    setEditProcedureNotes(procedure.procedure_notes || "");
    setEditRecommendations(procedure.recommendations || "");
    setEditReviewNotes(procedure.review_notes || "");
    setEditAssistedByIds(
      ((procedure as any).assisted_by_ids as string[] | null)?.length
        ? ((procedure as any).assisted_by_ids as string[])
        : (procedure as any).assisted_by
          ? [(procedure as any).assisted_by as string]
          : [],
    );
    setInitialized(true);
  }

  // Init service lines - wait for procedure_services to actually finish
  // loading before deciding it's empty, otherwise its [] default (while
  // still fetching) gets mistaken for "no existing services" and a
  // duplicate id-less fallback line is fabricated from the parent
  // procedure's fields, which then inserts a second identical row on save.
  if (procedure && initialized && !servicesInitialized && !procedureServicesLoading) {
    const rows: ServiceLineRow[] = procedureServices.length
      ? procedureServices.map((s: any) => ({
          id: s.id,
          key: s.id,
          service_id: s.service_id,
          service_name: s.service_name || "",
          procedure_notes: s.procedure_notes || "",
          recommendations: s.recommendations || "",
          material_percent:
            s.material_percent === null || s.material_percent === undefined ? "" : String(s.material_percent),
          price: Number((servicesMaster as any[]).find((m: any) => m.id === s.service_id)?.price || 0),
        }))
      : [
          {
            key: `svc-${Date.now()}`,
            service_id: null,
            service_name: procedure.service_name || "",
            procedure_notes: procedure.procedure_notes || "",
            recommendations: procedure.recommendations || "",
            material_percent: "",
            price: 0,
          },
        ];
    setEditServiceLines(rows);
    setServicesInitialized(true);
  }

  const updateLine = (key: string, patch: Partial<ServiceLineRow>) =>
    setEditServiceLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () =>
    setEditServiceLines((prev) => [
      ...prev,
      { key: `svc-${Date.now()}-${prev.length}`, service_id: null, service_name: "", procedure_notes: "", recommendations: "", material_percent: "", price: 0 },
    ]);
  const removeLine = (key: string) =>
    setEditServiceLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, _deleted: true } : l)).filter((l) => l.id || !l._deleted),
    );
  const visibleLines = editServiceLines.filter((l) => !l._deleted);

  // Init prescriptions from fetched data
  if (prescriptions.length > 0 && initialized && editPrescriptions.length === 0) {
    setEditPrescriptions(prescriptions.map((rx: any) => ({
      id: rx.id,
      product_id: rx.product_id || "",
      medicine_name: rx.medicine_name,
      dosage: rx.dosage || "",
      frequency: rx.frequency || "",
      duration: rx.duration || "",
      instructions: rx.instructions || "",
      quantity: rx.quantity || 1,
    })));
  }

  const handleClose = () => {
    setInitialized(false);
    setServicesInitialized(false);
    setEditServiceLines([]);
    setEditPrescriptions([]);
    setAttachmentNotes("");
    setMedical({});
    setMedicalDirty(false);
    onClose();
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const kept = editServiceLines.filter((l) => !l._deleted && (l.service_name || "").trim());
      const combine = (field: "procedure_notes" | "recommendations") =>
        kept
          .filter((l) => (l[field] || "").trim())
          .map((l) => (kept.length > 1 ? `${l.service_name}: ${l[field]}` : l[field]))
          .join("\n\n");

      // Update procedure
      const { error } = await supabase.from("procedures").update({
        service_name: kept.length ? kept.map((l) => l.service_name).join(", ") : editServiceName,
        status: editStatus,
        staff_id: editStaffId && editStaffId.trim() ? editStaffId : null,
        procedure_notes: kept.length ? combine("procedure_notes") : editProcedureNotes,
        recommendations: kept.length ? combine("recommendations") : editRecommendations,
        review_notes: editReviewNotes,
        assisted_by: editAssistedByIds[0] || null,
        assisted_by_ids: editAssistedByIds,
        symptoms: medical.symptoms || null,
        diagnosis: medical.diagnosis || null,
        lab_tests: medical.lab_tests || null,
      } as any).eq("id", procedureId!);
      if (error) throw error;

      // Sync any edits to the patient's medical information back to the patient record
      if (medicalDirty && procedure?.patient_id) {
        const { error: medErr } = await supabase
          .from("patients")
          .update({
            medical_history: medical.medical_history || null,
            current_medications: medical.current_medications || null,
            allergies: medical.allergies || null,
            skin_type: medical.skin_type || null,
            skin_concerns: medical.skin_concerns || null,
            previous_treatments: medical.previous_treatments || null,
          })
          .eq("id", procedure.patient_id);
        if (medErr) throw medErr;
      }

      // Sync procedure_services
      for (const l of editServiceLines.filter((x) => x.id && x._deleted)) {
        await supabase.from("procedure_services").delete().eq("id", l.id!);
      }
      for (const [i, l] of kept.entries()) {
        if (l.id) {
          await supabase.from("procedure_services").update({
            service_id: l.service_id,
            service_name: l.service_name,
            procedure_notes: l.procedure_notes || null,
            recommendations: l.recommendations || null,
            material_percent: l.material_percent.trim() === "" ? null : parseFloat(l.material_percent),
            sort_order: i,
          }).eq("id", l.id);
        } else {
          await supabase.from("procedure_services").insert({
            procedure_id: procedureId!,
            service_id: l.service_id,
            service_name: l.service_name,
            procedure_notes: l.procedure_notes || null,
            recommendations: l.recommendations || null,
            material_percent: l.material_percent.trim() === "" ? null : parseFloat(l.material_percent),
            sort_order: i,
          });
        }
      }


      // Handle prescriptions: delete removed, update existing, insert new
      const existing = editPrescriptions.filter(rx => rx.id && !rx._deleted);
      const deleted = editPrescriptions.filter(rx => rx.id && rx._deleted);
      const newRx = editPrescriptions.filter(rx => !rx.id && !rx._deleted && (rx.medicine_name || (rx.product_id && rx.product_id !== OTHERS_VALUE)));

      for (const rx of deleted) {
        await supabase.from("prescriptions").delete().eq("id", rx.id!);
      }
      for (const rx of existing) {
        await supabase.from("prescriptions").update({
          product_id: rx.product_id && rx.product_id !== OTHERS_VALUE ? rx.product_id : null,
          medicine_name: rx.medicine_name,
          dosage: rx.dosage,
          frequency: rx.frequency,
          duration: rx.duration,
          instructions: rx.instructions,
          quantity: rx.quantity,
        }).eq("id", rx.id!);
      }
      if (newRx.length > 0) {
        await supabase.from("prescriptions").insert(newRx.map(rx => ({
          procedure_id: procedureId!,
          product_id: rx.product_id && rx.product_id !== OTHERS_VALUE ? rx.product_id : null,
          medicine_name: rx.medicine_name,
          dosage: rx.dosage,
          frequency: rx.frequency,
          duration: rx.duration,
          instructions: rx.instructions,
          quantity: rx.quantity,
        })));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedures"] });
      queryClient.invalidateQueries({ queryKey: ["procedure-detail", procedureId] });
      queryClient.invalidateQueries({ queryKey: ["procedure-prescriptions", procedureId] });
      queryClient.invalidateQueries({ queryKey: ["appointment-procedures"] });
      queryClient.invalidateQueries({ queryKey: ["patient", procedure?.patient_id] });
      const savedId = procedureId!;
      handleClose();
      onSaved?.(savedId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await supabase.from("prescriptions").delete().eq("procedure_id", procedureId!);
      await supabase.from("procedure_attachments").delete().eq("procedure_id", procedureId!);
      const error: any = await moveToTrash("procedures", procedureId!).then(() => null).catch((e: any) => e);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedures"] });
      queryClient.invalidateQueries({ queryKey: ["appointment-procedures"] });
      toast.success("Procedure deleted");
      handleClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addPrescription = () => {
    setEditPrescriptions([...editPrescriptions, { product_id: "", medicine_name: "", dosage: "", frequency: "", duration: "", instructions: "", quantity: 1 }]);
  };

  const updateRx = (index: number, field: string, value: any) => {
    const updated = [...editPrescriptions];
    if (field === "product_id") {
      if (value === OTHERS_VALUE) {
        updated[index].product_id = OTHERS_VALUE;
        updated[index].medicine_name = "";
      } else {
        const prod = products.find((p) => p.id === value);
        updated[index].product_id = value;
        updated[index].medicine_name = prod?.name || "";
      }
    } else {
      (updated[index] as any)[field] = value;
    }
    setEditPrescriptions(updated);
  };

  const removeRx = (index: number) => {
    const updated = [...editPrescriptions];
    if (updated[index].id) {
      updated[index]._deleted = true;
    } else {
      updated.splice(index, 1);
    }
    setEditPrescriptions(updated);
  };

  const handleFileUpload = async (files: FileList) => {
    if (!procedureId || !procedure) return;
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split(".").pop();
        const path = `${procedure.patient_id}/${procedureId}/${Date.now()}_${i}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("procedure-attachments").upload(path, file);
        if (uploadErr) throw uploadErr;

        const url = `${SUPABASE_URL}/storage/v1/object/public/procedure-attachments/${path}`;
        const { error: dbErr } = await supabase.from("procedure_attachments").insert({
          procedure_id: procedureId,
          patient_id: procedure.patient_id,
          appointment_id: procedure.appointment_id || null,
          file_url: url,
          file_name: file.name,
          notes: attachmentNotes || null,
        });
        if (dbErr) throw dbErr;
      }
      toast.success("Attachment(s) uploaded");
      setAttachmentNotes("");
      refetchAttachments();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const deleteAttachment = async (id: string) => {
    await supabase.from("procedure_attachments").delete().eq("id", id);
    refetchAttachments();
    toast.success("Attachment removed");
  };

  const patientName = procedure?.patients
    ? `${procedure.patients.first_name} ${procedure.patients.last_name}`
    : "Unknown";

  const visibleRx = editPrescriptions.filter(rx => !rx._deleted);

  // Hand this procedure over to Billing: service + medicine names come from the
  // procedure, prices/HSN/GST are resolved from the masters inside Billing.
  const handleCreateInvoice = () => {
    if (!procedure) return;
    const services = Array.from(
      new Set(
        [
          ...editServiceLines.filter((l) => !l._deleted).map((l) => l.service_name),
          ...(procedureServices as any[]).map((s: any) => s.service_name),
        ].filter(Boolean),
      ),
    );
    if (services.length === 0 && procedure.service_name) {
      services.push(...String(procedure.service_name).split(",").map((n) => n.trim()).filter(Boolean));
    }
    const products = visibleRx
      .filter((rx) => rx.medicine_name || (rx.product_id && rx.product_id !== OTHERS_VALUE))
      .map((rx) => ({
        name: rx.medicine_name,
        product_id: rx.product_id && rx.product_id !== OTHERS_VALUE ? rx.product_id : null,
        quantity: Number(rx.quantity) || 1,
      }));
    // Visit cadence (single/recurring) is intentionally not passed through here -
    // it no longer drives Billing's Payment Type. A recurring visit plan and an
    // installment payment plan are independent; staff picks "Recurring" billing
    // explicitly in Billing when a package needs to be split into payments.
    sessionStorage.setItem(
      "billing_prefill",
      JSON.stringify({
        patientId: procedure.patient_id || "",
        doctorId: procedure.staff_id || "",
        appointmentId: (procedure as any).appointment_id || "",
        services,
        products,
      }),
    );
    handleClose();
    navigate("/billing?newInvoice=1");
  };


  return (
    <>
      <Sheet open={!!procedureId} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <SheetContent className="w-screen max-w-none sm:max-w-none overflow-y-auto p-0">
          {isLoading || !procedure ? (
            <div className="p-6 text-center text-muted-foreground">Loading...</div>
          ) : (
            <>
              <SheetHeader className="p-6 pb-4 border-b bg-muted/30 shadow-sm sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-muted/60">
                <SheetClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </SheetClose>
                <div className="flex items-start justify-between">
                  <div>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground mb-1.5 font-normal">Procedure</Badge>
                    <SheetTitle className="font-display text-lg">{patientName}</SheetTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {format(new Date(procedure.procedure_date), "EEE, MMM d, yyyy · h:mm a")}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant="secondary" className="text-xs">{procedure.status}</Badge>
                    {procedure.id && (
                      <RecordOwnerField
                        variant="inline"
                        objectType="procedures"
                        objectLabel="Procedure"
                        recordId={procedure.id}
                        recordLabel={patientName || "Procedure"}
                        ownerId={procedure.owner_id}
                        link="/procedures"
                        onChanged={() => queryClient.invalidateQueries({ queryKey: ["procedure-detail"] })}
                      />
                    )}
                  </div>

                </div>
                {procedure.patient_id && (
                  <PatientToolsBar
                    patientId={procedure.patient_id}
                    patientName={patientName}
                    context="procedure"
                    contextId={procedure.id}
                    className="pt-3"
                  />
                )}

                {/* Record actions - icon-only and pinned in the sticky header so they
                    never require scrolling to the bottom of a long procedure. */}
                <TooltipProvider delayDuration={200}>
                  <div className="flex flex-wrap items-center justify-end gap-1.5 pt-3">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                          {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Save Changes</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button" variant="outline" size="icon"
                          className="border-primary/40 text-primary hover:bg-primary/5"
                          onClick={handleCreateInvoice}
                        >
                          <Receipt className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Create Invoice</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button" variant="outline" size="icon"
                          onClick={handlePreviewPrescription}
                          disabled={previewingPdf || downloadingPdf || sendingWa}
                        >
                          {previewingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Preview Prescription</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button" variant="outline" size="icon"
                          onClick={handleDownloadPrescription}
                          disabled={downloadingPdf || previewingPdf || sendingWa}
                        >
                          {downloadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Download Prescription</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button" variant="outline" size="icon"
                          className="border-primary/40 text-primary hover:bg-primary/5"
                          onClick={handleSendWhatsApp}
                          disabled={downloadingPdf || previewingPdf || sendingWa}
                        >
                          {sendingWa ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Send via WhatsApp</TooltipContent>
                    </Tooltip>
                    <AlertDialog>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                        </TooltipTrigger>
                        <TooltipContent>Delete Procedure</TooltipContent>
                      </Tooltip>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete procedure?</AlertDialogTitle>
                          <AlertDialogDescription>This will permanently remove this procedure, prescriptions and attachments.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TooltipProvider>
              </SheetHeader>

              <div className="p-6 space-y-4 mx-auto w-full max-w-5xl">
                <Tabs defaultValue="medical" className="w-full">
                  <TabsList>
                    <TabsTrigger value="medical" className="gap-1.5">
                      <HeartPulse className="h-3.5 w-3.5" /> Medical Information
                    </TabsTrigger>
                    <TabsTrigger value="procedure">Procedure</TabsTrigger>
                    <TabsTrigger value="surveys" className="gap-1.5">
                      <ClipboardList className="h-3.5 w-3.5" /> Surveys
                    </TabsTrigger>
                    <TabsTrigger value="notes" className="gap-1.5">
                      <StickyNote className="h-3.5 w-3.5" /> Notes
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="procedure" className="space-y-4 mt-4">
                <div className="rounded-xl border-2 border-primary/25 bg-primary/5 p-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Repeat className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-primary">
                      {(procedure as any).visit_type === "Recurring" ? "Recurring visit" : "Single visit"}
                    </span>
                    {(procedure as any).visit_type === "Recurring" && (
                      <Badge variant="outline" className="text-[10px]">
                        {(procedure as any).recurring_count || ((procedure as any).recurring_dates || []).length} visits
                      </Badge>
                    )}
                  </div>
                  {(procedure as any).visit_type === "Recurring" && (
                    <ul className="mt-2 space-y-0.5">
                      {(((procedure as any).recurring_dates || []) as string[]).map((d, i) => (
                        <li key={i} className="text-xs text-muted-foreground">
                          Visit # {i + 1}: <span className="font-medium text-foreground">{format(new Date(d), "MMM d, yyyy · h:mm a")}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Patient</Label>
                      <Input value={patientName} disabled className="mt-1.5 bg-muted/50" />
                    </div>
                    <div>
                      <Label>Doctor</Label>
                      <StaffCombobox value={editStaffId} onValueChange={setEditStaffId} placeholder="Select doctor" className="mt-1.5" roleFilter={["Doctor"]} />
                    </div>
                    <div>
                      <Label>Assisted By</Label>
                      <StaffMultiCombobox value={editAssistedByIds} onValueChange={setEditAssistedByIds} placeholder="Select assistants" className="mt-1.5" />
                    </div>
                    <div>
                      <Label>Status</Label>
                      <Select value={editStatus} onValueChange={setEditStatus}>
                        <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Services / Procedures */}
                <div className="rounded-xl border-2 border-primary/25 bg-primary/5 p-4 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-display font-semibold text-primary">Services / Procedures</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addLine}>
                      <Plus className="h-3 w-3 mr-1" /> Add Service
                    </Button>
                  </div>
                  {visibleLines.map((line, i) => (
                    <div key={line.key} className="rounded-lg border bg-background p-3 space-y-2 shadow-sm transition-shadow hover:shadow-md">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Service {i + 1}</span>
                        {visibleLines.length > 1 && (
                          <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => removeLine(line.key)}>
                            Remove
                          </Button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          className="flex-1"
                          placeholder="Service / procedure name"
                          value={line.service_name}
                          onChange={(e) => updateLine(line.key, { service_name: e.target.value })}
                        />
                        <Select
                          value={line.service_id || ""}
                          onValueChange={(v) => {
                            const svc: any = servicesMaster.find((s: any) => s.id === v);
                            updateLine(line.key, {
                              service_id: v,
                              service_name: svc?.name || line.service_name,
                              procedure_notes: line.procedure_notes || svc?.procedure_notes || "",
                              recommendations:
                                line.recommendations ||
                                (Array.isArray(svc?.recommendations) ? svc.recommendations.join("\n") : svc?.recommendations || ""),
                              material_percent:
                                svc?.material_percent === null || svc?.material_percent === undefined
                                  ? ""
                                  : String(svc.material_percent),
                              price: Number(svc?.price || 0),
                            });
                          }}
                        >
                          <SelectTrigger className="w-40"><SelectValue placeholder="From master" /></SelectTrigger>
                          <SelectContent>
                            {servicesMaster.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground">Procedure Notes</Label>
                          <div className="flex items-center gap-1">
                            <MicButton value={line.procedure_notes} onChange={(v) => updateLine(line.key, { procedure_notes: v })} />
                            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary" onClick={() => elaborateLine(line.key, "procedure_notes")} disabled={elaborating !== null}>
                              {elaborating === `${line.key}:procedure_notes` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Elaborate AI
                            </Button>
                          </div>
                        </div>
                        <Textarea value={line.procedure_notes} onChange={(e) => updateLine(line.key, { procedure_notes: e.target.value })} className="mt-1" rows={3} />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground">Recommendations</Label>
                          <div className="flex items-center gap-1">
                            <MicButton value={line.recommendations} onChange={(v) => updateLine(line.key, { recommendations: v })} />
                            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary" onClick={() => elaborateLine(line.key, "recommendations")} disabled={elaborating !== null}>
                              {elaborating === `${line.key}:recommendations` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Elaborate AI
                            </Button>
                          </div>
                        </div>
                        <Textarea value={line.recommendations} onChange={(e) => updateLine(line.key, { recommendations: e.target.value })} className="mt-1" rows={3} />
                      </div>
                    </div>
                  ))}
                </div>


                {/* Prescriptions - editable */}
                <div className="rounded-xl border-2 border-primary/25 bg-primary/5 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-base font-display font-semibold flex items-center gap-2">
                      <Pill className="h-4 w-4" /> Prescriptions
                    </Label>
                    <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addPrescription}>
                      <Plus className="h-3 w-3" /> Add Medicine
                    </Button>
                  </div>
                  {visibleRx.length > 0 ? visibleRx.map((rx, idx) => {
                    const realIdx = editPrescriptions.indexOf(rx);
                    return (
                      <div key={realIdx} className="border rounded-lg p-3 mb-3 space-y-2 bg-background shadow-sm transition-shadow hover:shadow-md">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">Medicine {idx + 1}</span>
                          <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => removeRx(realIdx)}>Remove</Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">Medicine *</Label>
                            <Select value={rx.product_id} onValueChange={(v) => updateRx(realIdx, "product_id", v)}>
                              <SelectTrigger className="mt-1"><SelectValue placeholder="Select medicine" /></SelectTrigger>
                              <SelectContent>
                                {products.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                                <SelectItem value={OTHERS_VALUE}>Others (type manually)</SelectItem>
                              </SelectContent>
                            </Select>
                            {rx.product_id === OTHERS_VALUE && (
                              <Input
                                className="mt-1"
                                placeholder="Medicine name"
                                value={rx.medicine_name}
                                onChange={(e) => updateRx(realIdx, "medicine_name", e.target.value)}
                              />
                            )}
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground flex items-center justify-between">Dosage <MicButton value={rx.dosage} onChange={(v) => updateRx(realIdx, "dosage", v)} mode="replace" /></Label>
                            <Input className="mt-1" placeholder="e.g. 500mg" value={rx.dosage} onChange={(e) => updateRx(realIdx, "dosage", e.target.value)} />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground flex items-center justify-between">Frequency <MicButton value={rx.frequency} onChange={(v) => updateRx(realIdx, "frequency", v)} mode="replace" /></Label>
                            <Input className="mt-1" placeholder="e.g. Twice daily" value={rx.frequency} onChange={(e) => updateRx(realIdx, "frequency", e.target.value)} />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground flex items-center justify-between">Duration <MicButton value={rx.duration} onChange={(v) => updateRx(realIdx, "duration", v)} mode="replace" /></Label>
                            <Input className="mt-1" placeholder="e.g. 7 days" value={rx.duration} onChange={(e) => updateRx(realIdx, "duration", e.target.value)} />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Quantity</Label>
                            <Input className="mt-1" type="number" placeholder="1" value={rx.quantity} onChange={(e) => updateRx(realIdx, "quantity", parseInt(e.target.value) || 1)} />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground flex items-center justify-between">Special Instructions <MicButton value={rx.instructions} onChange={(v) => updateRx(realIdx, "instructions", v)} /></Label>
                          <Input className="mt-1" placeholder="e.g. After meals" value={rx.instructions} onChange={(e) => updateRx(realIdx, "instructions", e.target.value)} />
                        </div>
                      </div>
                    );
                  }) : (
                    <p className="text-sm text-muted-foreground text-center py-2">No prescriptions. Click "Add Medicine" to add.</p>
                  )}
                </div>

                {/* Photos */}
                <div className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-base font-display font-semibold flex items-center gap-2">
                      <Camera className="h-4 w-4" /> Photos
                    </Label>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setCameraOpen(true)}>
                      <Plus className="h-3 w-3" /> Take Photo
                    </Button>
                  </div>
                  {photos.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {photos.map((photo: any) => (
                        <div key={photo.id} className="relative group">
                          <img src={photo.photo_url} alt="" className="w-full h-24 object-cover rounded-lg border" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No photos yet.</p>
                  )}
                </div>

                {/* Attachments */}
                <div className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-base font-display font-semibold flex items-center gap-2">
                      <Paperclip className="h-4 w-4" /> Attachments
                    </Label>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      <Plus className="h-3 w-3" /> {uploading ? "Uploading..." : "Add Files"}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => { if (e.target.files) handleFileUpload(e.target.files); e.target.value = ""; }}
                    />
                  </div>
                  <Input
                    placeholder="Notes for attachment (optional)"
                    value={attachmentNotes}
                    onChange={(e) => setAttachmentNotes(e.target.value)}
                    className="mb-3"
                  />
                  {attachments.length > 0 ? (
                    <div className="space-y-2">
                      {attachments.map((att: any) => (
                        <div key={att.id} className="flex items-center gap-2 bg-muted/50 rounded-md p-2">
                          <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline truncate block">
                              {att.file_name}
                            </a>
                            {att.notes && <p className="text-xs text-muted-foreground">{att.notes}</p>}
                            <p className="text-[10px] text-muted-foreground">
                              Linked to patient &amp; {att.appointment_id ? "appointment" : "procedure"}
                            </p>
                          </div>
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => deleteAttachment(att.id)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">No attachments yet.</p>
                  )}
                </div>

                {procedure?.id && (
                  <div className="space-y-4">
                    <SystemRecordSection
                      record={procedure}
                      owner={{
                        objectType: "procedures",
                        objectLabel: "Procedure",
                        recordLabel: patientName || "Procedure",
                        link: `/procedures`,
                        onChanged: () => queryClient.invalidateQueries({ queryKey: ["procedure-detail"] }),
                      }}
                    />
                    <FieldHistorySection objectType="procedures" recordId={procedure.id} />
                  </div>
                )}
                  </TabsContent>

                  <TabsContent value="medical" className="space-y-3 mt-4">
                    <div className="flex items-center gap-2">
                      <HeartPulse className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">Medical Information</span>
                      <span className="text-[11px] text-muted-foreground">(saved back to the patient record)</span>
                    </div>
                    {procedure.patient_id ? (
                      <div className="rounded-xl border bg-card p-4 shadow-sm">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {([
                            ["symptoms", "Symptoms"],
                            ["diagnosis", "Diagnosis"],
                            ["lab_tests", "Lab Tests"],
                            ["medical_history", "Medical History"],
                            ["current_medications", "Current Medications"],
                            ["allergies", "Allergies"],
                            ["previous_treatments", "Previous Treatments"],
                            ["skin_type", "Skin Type"],
                            ["skin_concerns", "Skin Concerns"],
                          ] as [string, string][]).map(([field, label]) => (
                            <div key={field}>
                              <Label className="text-xs text-muted-foreground">{label}</Label>
                              {field === "skin_type" ? (
                                <Select
                                  value={medical[field] || ""}
                                  onValueChange={(v) => { setMedical((m) => ({ ...m, [field]: v })); setMedicalDirty(true); }}
                                >
                                  <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                                  <SelectContent>
                                    {SKIN_TYPE_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Textarea
                                  rows={3}
                                  className="mt-1 text-sm"
                                  value={medical[field] || ""}
                                  onChange={(e) => { setMedical((m) => ({ ...m, [field]: e.target.value })); setMedicalDirty(true); }}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-8 text-center">No patient linked to this procedure.</p>
                    )}
                  </TabsContent>

                  <TabsContent value="surveys" className="space-y-3 mt-4">
                    {procedure.patient_id ? (
                      <SurveyHistoryPanel patientId={procedure.patient_id} appointmentId={(procedure as any).appointment_id || null} />
                    ) : (
                      <p className="text-sm text-muted-foreground">No patient linked to this procedure.</p>
                    )}
                  </TabsContent>

                  <TabsContent value="notes" className="space-y-3 mt-4">
                    {procedure?.id && <ProcedureStickyNotes key={procedure.id} procedureId={procedure.id} />}
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {cameraOpen && procedure?.patient_id && (
        <CameraCapture
          open={cameraOpen}
          onOpenChange={setCameraOpen}
          patientId={procedure.patient_id}
          patientName={patientName}
          context="procedure"
          contextId={procedureId!}
        />
      )}
    </>
  );
}
