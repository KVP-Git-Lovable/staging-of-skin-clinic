import { useState, useRef, useMemo, createContext, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { shortPatientId } from "@/lib/utils";
import { ArrowLeft, Camera, Calendar, ClipboardList, Pill, Receipt, User, Loader2, Share2, Copy, Check, ScanEye, FileText, Users, Plus, Save, Edit2, Info, Paperclip, Upload, X, ClipboardCheck, Trash2, ChevronDown, Eye, KeyRound, Megaphone, Search, Sparkles, ImageOff } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { EngagementScoreCard } from "@/components/patients/EngagementScoreCard";
import { PatientEngagementRollups } from "@/components/patients/PatientEngagementRollups";
import { SystemRecordSection } from "@/components/shared/SystemRecordSection";
import { RecordOwnerField } from "@/components/shared/RecordOwnerField";
import { FieldHistorySection } from "@/components/shared/FieldHistorySection";
import { Patient360 } from "@/components/patients/Patient360";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MicButton } from "@/components/shared/MicButton";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

import { SkinTracker } from "@/components/shared/SkinTracker";
import { CaseAnalysis } from "@/components/shared/CaseAnalysis";
import { CameraDialog } from "@/components/shared/CameraDialog";
import { FamilyMembers } from "@/components/patients/FamilyMembers";
import { ProcedureFormDialog } from "@/components/procedures/ProcedureFormDialog";
import { ProcedureDetailSheet } from "@/components/procedures/ProcedureDetailSheet";
import { AppointmentDetailSheet } from "@/components/appointments/AppointmentDetailSheet";
import { QuickAppointmentDialog } from "@/components/appointments/QuickAppointmentDialog";
import { toast } from "sonner";
import { SurveyFill } from "@/components/surveys/SurveyFill";
import { approveSurveyResponse, enrichAiProducts, enrichAiServices } from "@/lib/surveyApproval";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// Details-tab field context — components must live at module scope so React does not
// remount (and blur) inputs on every keystroke.
type DetailsCtx = {
  readOnly: boolean;
  upd: (field: string, value: any) => void;
  elaboratingField: string | null;
  elaborate: (field: string, label: string, currentText: string) => void;
};
const DetailsFieldContext = createContext<DetailsCtx>({
  readOnly: true,
  upd: () => {},
  elaboratingField: null,
  elaborate: () => {},
});

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-sm font-semibold text-foreground border-b pb-1.5 mb-3">{children}</h3>
);

const Field = ({ label, value, field, type = "text" }: { label: string; value: any; field: string; type?: string }) => {
  const { readOnly, upd } = useContext(DetailsFieldContext);
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {readOnly ? (
        <p className="text-sm mt-1">{
          value
            ? (type === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
                ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`
                : value)
            : <span className="text-muted-foreground/50">—</span>
        }</p>
      ) : (
        <Input type={type} value={value || ""} onChange={(e) => upd(field, e.target.value)} className="mt-1 h-8 text-sm" />
      )}
    </div>
  );
};

const TextareaField = ({ label, value, field, ai }: { label: string; value: any; field: string; ai?: boolean }) => {
  const { readOnly, upd, elaboratingField, elaborate } = useContext(DetailsFieldContext);
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {ai && !readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] gap-1 text-primary hover:text-primary"
            disabled={elaboratingField === field}
            onClick={() => elaborate(field, label, value || "")}
          >
            {elaboratingField === field ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Elaborate with AI
          </Button>
        )}
      </div>
      {readOnly ? (
        <p className="text-sm mt-1 whitespace-pre-wrap">{value || <span className="text-muted-foreground/50">—</span>}</p>
      ) : (
        <Textarea value={value || ""} onChange={(e) => upd(field, e.target.value)} className="mt-1 text-sm" rows={3} />
      )}
    </div>
  );
};

function SurveyAnswersView({ surveyId, answers, templateId }: { surveyId: string; answers: Record<string, any>; templateId: string }) {
  const { data: questions = [] } = useQuery({
    queryKey: ["survey-questions", templateId],
    queryFn: async () => {
      const { data, error } = await supabase.from("survey_questions").select("*").eq("template_id", templateId).order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!templateId,
  });

  // Match answers: try by question ID first, then fall back to sort-order matching
  const answerKeys = Object.keys(answers);
  const getAnswer = (q: any, idx: number) => {
    if (answers[q.id] !== undefined) return answers[q.id];
    // Fallback: match by position if IDs don't match (seeded data)
    if (answerKeys.length > 0 && answerKeys[idx] !== undefined) return answers[answerKeys[idx]];
    return null;
  };

  if (questions.length === 0) return <p className="text-sm text-muted-foreground">Loading questions...</p>;
  return (
    <div className="space-y-4 mt-2">
      {questions.map((q: any, i: number) => {
        const answer = getAnswer(q, i);
        return (
          <div key={q.id} className="space-y-1">
            <p className="text-sm font-medium">{i + 1}. {q.question_text}</p>
            <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
              {answer == null ? "—" : Array.isArray(answer) ? answer.join(", ") : (answer ?? "—")}
            </p>
          </div>
        );
      })}
    </div>
  );
}

const PatientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const photoCameraRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [failedPhotoIds, setFailedPhotoIds] = useState<Set<string>>(new Set());
  const [attachmentCameraOpen, setAttachmentCameraOpen] = useState(false);
  const [skinTrackerOpen, setSkinTrackerOpen] = useState(false);
  const [otpCode, setOtpCode] = useState<string | null>(null);
  const [otpCopied, setOtpCopied] = useState(false);
  const [procedureFormOpen, setProcedureFormOpen] = useState(false);
  const [detailsEditing, setDetailsEditing] = useState(false);
  const [elaboratingField, setElaboratingField] = useState<string | null>(null);
  const [detailsForm, setDetailsForm] = useState<any>(null);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [addRxOpen, setAddRxOpen] = useState(false);
  const [rxForm, setRxForm] = useState({ medicine_name: "", dosage: "", frequency: "", duration: "", quantity: 1, instructions: "", procedure_id: "" });
  const [selectedProcedureId, setSelectedProcedureId] = useState<string | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [quickApptOpen, setQuickApptOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [pendingAttachmentFile, setPendingAttachmentFile] = useState<File | null>(null);
  const [docTypeDialogOpen, setDocTypeDialogOpen] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState<any>(null);
  const [selectedDocType, setSelectedDocType] = useState<string>("Prescription");
  const [attachmentFilter, setAttachmentFilter] = useState<string>("all");
  const [surveyTemplateSelectOpen, setSurveyTemplateSelectOpen] = useState(false);
  const [selectedSurveyTemplateId, setSelectedSurveyTemplateId] = useState<string | null>(null);
  const [surveyFillOpen, setSurveyFillOpen] = useState(false);
  const [addSurveyMode, setAddSurveyMode] = useState<"choice" | "fill" | "assign" | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);


  const { data: patient, isLoading } = useQuery({
    queryKey: ["patient", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("patients").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: procedures = [] } = useQuery({
    queryKey: ["patient-procedures", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("procedures")
        .select("*, staff:staff!procedures_staff_id_fkey(first_name, last_name)")
        .eq("patient_id", id!)
        .order("procedure_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: prescriptions = [] } = useQuery({
    queryKey: ["patient-prescriptions", id],
    queryFn: async () => {
      const procIds = procedures.map((p) => p.id);
      // Fetch prescriptions linked to procedures OR to survey responses for this patient
      const queries = [];
      if (procIds.length > 0) {
        queries.push(
          supabase
            .from("prescriptions")
            .select("*, procedures(service_name, procedure_date)")
            .in("procedure_id", procIds)
        );
      }
      // Also fetch survey-linked prescriptions
      const surveyIds = (surveyResponses || []).map((s: any) => s.id);
      if (surveyIds.length > 0) {
        queries.push(
          supabase
            .from("prescriptions")
            .select("*, procedures(service_name, procedure_date)")
            .in("survey_response_id", surveyIds)
            .is("procedure_id", null)
        );
      }
      const results = await Promise.all(queries);
      const allRx = results.flatMap(r => r.data || []);
      // Deduplicate by id
      const seen = new Set<string>();
      return allRx.filter((rx: any) => { if (seen.has(rx.id)) return false; seen.add(rx.id); return true; })
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    enabled: !!id,
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ["patient-appointments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, staff(first_name, last_name)")
        .eq("patient_id", id!)
        .order("start_time", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: pharmaProducts = [] } = useQuery({
    queryKey: ["pharma-products-lookup-rx"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pharma_products").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["patient-invoices", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("patient_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Live roll-ups: a "visit" is an appointment that actually happened.
  const visitCount = useMemo(
    () => (appointments as any[]).filter((a) => ["Completed", "Checked-in", "In Progress"].includes(a.status)).length,
    [appointments]
  );
  const lifetimeValue = useMemo(
    () => (invoices as any[]).reduce((sum, inv) => sum + (Number(inv.total_amount ?? inv.grand_total ?? 0) || 0), 0),
    [invoices]
  );

  const { data: photos = [] } = useQuery({
    queryKey: ["patient-photos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_photos")
        .select("*, procedures(service_name)")
        .eq("patient_id", id!)
        .order("taken_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: attachments = [], refetch: refetchAttachments } = useQuery({
    queryKey: ["patient-attachments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("procedure_attachments")
        .select("*, procedures(service_name)")
        .eq("patient_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: surveyResponses = [] } = useQuery({
    queryKey: ["patient-surveys", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("survey_responses")
        .select("*, survey_templates(name, description), appointments(start_time, service)")
        .eq("patient_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: patientCampaigns = [], refetch: refetchPatientCampaigns } = useQuery({
    queryKey: ["patient-campaigns", id],
    queryFn: async () => {
      const { data, error } = await (supabase.from("patient_campaigns") as any)
        .select("id, linked_date, linked_by, notes, campaigns(id, name, type, status)")
        .eq("patient_id", id!)
        .order("linked_date", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!id,
  });

  const linkedByIds = Array.from(new Set((patientCampaigns as any[]).map((pc: any) => pc.linked_by).filter(Boolean)));
  const { data: linkedByMap = {} } = useQuery({
    queryKey: ["staff-by-auth-user", linkedByIds.sort().join(",")],
    queryFn: async () => {
      if (linkedByIds.length === 0) return {} as Record<string, string>;
      const { data, error } = await supabase
        .from("staff")
        .select("auth_user_id, first_name, last_name")
        .in("auth_user_id", linkedByIds as string[]);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((s: any) => {
        if (s.auth_user_id) map[s.auth_user_id] = `${s.first_name || ""} ${s.last_name || ""}`.trim() || "—";
      });
      return map;
    },
    enabled: linkedByIds.length > 0,
  });

  const { data: allCampaignsForLink = [] } = useQuery({
    queryKey: ["campaigns-for-patient-link"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns" as any).select("id, name, status").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const [linkCampaignOpen, setLinkCampaignOpen] = useState(false);
  const [linkCampaignSearch, setLinkCampaignSearch] = useState("");

  const linkCampaignToPatient = async (campaignId: string) => {
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await (supabase.from("patient_campaigns") as any).insert({
        patient_id: id,
        campaign_id: campaignId,
        linked_by: userRes?.user?.id || null,
      });
      if (error) throw error;
      toast.success("Campaign linked");
      setLinkCampaignOpen(false);
      setLinkCampaignSearch("");
      refetchPatientCampaigns();
      queryClient.invalidateQueries({ queryKey: ["campaign-patients", campaignId] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const unlinkCampaignFromPatient = async (linkId: string, campaignId: string) => {
    try {
      const { error } = await (supabase.from("patient_campaigns") as any).delete().eq("id", linkId);
      if (error) throw error;
      toast.success("Campaign unlinked");
      refetchPatientCampaigns();
      queryClient.invalidateQueries({ queryKey: ["campaign-patients", campaignId] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const { data: surveyTemplates = [] } = useQuery({
    queryKey: ["survey-templates-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("survey_templates").select("id, name").eq("is_active", true).eq("approval_status", "approved").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: surveyAssignments = [] } = useQuery({
    queryKey: ["patient-survey-assignments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("survey_assignments")
        .select("*, survey_templates(name)")
        .eq("patient_id", id!)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const assignTemplate = async (templateId: string) => {
    if (!id) return;
    setAssigning(true);
    try {
      const { error } = await supabase.from("survey_assignments").insert({
        patient_id: id,
        template_id: templateId,
        status: "pending",
      });
      if (error) throw error;
      toast.success("Survey assigned. Patient will see it in their portal.");
      setAddSurveyMode(null);
      queryClient.invalidateQueries({ queryKey: ["patient-survey-assignments", id] });
    } catch (e: any) {
      toast.error(e.message || "Failed to assign");
    } finally {
      setAssigning(false);
    }
  };

  const changeSurveyStatus = async (sr: any, newLabel: "Pending" | "Reviewed") => {
    const currentLabel =
      sr.dr_status === "approved" || sr.dr_status === "reviewed" ? "Reviewed" : "Pending";
    if (currentLabel === newLabel) return;
    try {
      if (newLabel === "Reviewed") {
        // Fetch template product/service config so we can enrich AI items with dosage/frequency/duration/instructions
        const [{ data: tplProducts }, { data: tplServices }] = await Promise.all([
          supabase
            .from("survey_template_products")
            .select("*, pharma_products(name, category)")
            .eq("template_id", sr.template_id),
          supabase
            .from("survey_template_services")
            .select("*, services(name, category)")
            .eq("template_id", sr.template_id),
        ]);
        const enrichedProducts = enrichAiProducts(sr.ai_products || [], tplProducts || []);
        const enrichedServices = enrichAiServices(sr.ai_services || [], tplServices || []);
        const { rxCount, procCount } = await approveSurveyResponse(sr, {
          selectedProducts: enrichedProducts,
          selectedServices: enrichedServices,
          newStatus: "approved",
          queryClient,
        });
        toast.success(
          `Marked Reviewed · ${rxCount} Rx, ${procCount} procedure${procCount === 1 ? "" : "s"} synced`,
        );
      } else {
        // Revert to Pending — remove auto-created Rx + procedures from this survey
        await supabase.from("prescriptions").delete().eq("survey_response_id", sr.id);
        await supabase
          .from("procedures")
          .delete()
          .eq("survey_response_id", sr.id)
          .eq("status", "Recommended");
        const { error } = await supabase
          .from("survey_responses")
          .update({ dr_status: "pending_review", reviewed_at: null, reviewed_by: null })
          .eq("id", sr.id);
        if (error) throw error;
        toast.success("Marked Pending · synced Rx & procedures removed");
      }
      queryClient.invalidateQueries({ queryKey: ["patient-surveys", id] });
      queryClient.invalidateQueries({ queryKey: ["patient-prescriptions", id] });
      queryClient.invalidateQueries({ queryKey: ["patient-procedures", id] });
    } catch (e: any) {
      toast.error(e.message || "Failed to update status");
    }
  };

  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setPendingAttachmentFile(file);
    setSelectedDocType("Prescription");
    setDocTypeDialogOpen(true);
    e.target.value = "";
  };

  const uploadPendingAttachment = async () => {
    if (!pendingAttachmentFile || !id) return;
    setUploadingAttachment(true);
    const file = pendingAttachmentFile;
    try {
      const ext = file.name.split(".").pop() || "bin";
      const filePath = `${id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("patient-photos").upload(filePath, file);
      if (uploadError) throw uploadError;
      const fileUrl = `${SUPABASE_URL}/storage/v1/object/public/patient-photos/${filePath}`;
      const { error } = await supabase.from("procedure_attachments").insert({
        patient_id: id,
        procedure_id: procedures.length > 0 ? procedures[0].id : null,
        file_name: file.name,
        file_url: fileUrl,
        document_type: selectedDocType,
      } as any);
      if (error) throw error;
      toast.success("Attachment uploaded");
      setDocTypeDialogOpen(false);
      setPendingAttachmentFile(null);
      refetchAttachments();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    e.target.value = "";
    savePhotoFile(file);
  };

  const savePhotoFile = async (file: File) => {
    if (!file || !id) return;
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `${id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("patient-photos").upload(fileName, file);
      if (uploadError) throw uploadError;
      const photoUrl = `${SUPABASE_URL}/storage/v1/object/public/patient-photos/${fileName}`;
      const { error } = await supabase.from("patient_photos").insert({
        patient_id: id,
        photo_url: photoUrl,
        notes: null,
      } as any);
      if (error) throw error;
      toast.success("Photo uploaded");
      queryClient.invalidateQueries({ queryKey: ["patient-photos", id] });
      setPendingPhotoFile(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const deletePhoto = async (photo: any) => {
    if (!confirm("Delete this photo?")) return;
    try {
      const parts = photo.photo_url?.split("/patient-photos/");
      if (parts && parts[1]) {
        await supabase.storage.from("patient-photos").remove([parts[1]]);
      }
      const { error } = await supabase.from("patient_photos").delete().eq("id", photo.id);
      if (error) throw error;
      toast.success("Photo deleted");
      queryClient.invalidateQueries({ queryKey: ["patient-photos", id] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete photo");
    }
  };

  const deleteAttachment = async (att: any) => {
    if (!confirm("Delete this attachment?")) return;
    try {
      const parts = att.file_url?.split("/patient-photos/");
      if (parts && parts[1]) {
        await supabase.storage.from("patient-photos").remove([parts[1]]);
      }
      const { error } = await supabase.from("procedure_attachments").delete().eq("id", att.id);
      if (error) throw error;
      toast.success("Attachment deleted");
      refetchAttachments();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete attachment");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p>Patient not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/patients")}>Back to Patients</Button>
      </div>
    );
  }

  const getAge = (dob: string | null) => {
    if (!dob) return null;
    return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  };

  const statusStyles: Record<string, string> = {
    Paid: "bg-success/10 text-success",
    Partial: "bg-warning/10 text-warning",
    Pending: "bg-destructive/10 text-destructive",
  };

  return (
    <div>
      <div className="page-header">
        <Button variant="ghost" size="sm" className="gap-1 mb-3 md:mb-4" onClick={() => navigate("/patients")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-center gap-3 md:gap-4">
              <div className="h-12 w-12 md:h-16 md:w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-display font-bold text-lg md:text-xl shrink-0">
                {patient.first_name[0]}{patient.last_name[0]}
              </div>
              <div className="min-w-0">
                <h1 className="page-title text-xl md:text-2xl truncate">{patient.first_name} {patient.last_name}</h1>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 md:mt-1 text-xs md:text-sm text-muted-foreground">
                  <span className="font-mono text-primary">{shortPatientId(patient.id)}</span>
                  {patient.gender && <span>{patient.gender}</span>}
                  {getAge(patient.date_of_birth) !== null && <span>• Age {getAge(patient.date_of_birth)}</span>}
                  {patient.blood_group && <span>• {patient.blood_group}</span>}
                  {patient.phone && <span className="hidden sm:inline">• {patient.phone}</span>}
                </div>
                {patient.phone && <p className="text-xs text-muted-foreground sm:hidden mt-0.5">{patient.phone}</p>}
              </div>
            </div>
            <div className="flex flex-col items-stretch sm:items-end gap-2">
            <RecordOwnerField
              variant="inline"
              objectType="patients"
              objectLabel="Patient"
              recordId={id!}
              recordLabel={`${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim() || "Patient"}
              ownerId={(patient as any).owner_id}
              link={`/patients/${id}`}
              onChanged={() => queryClient.invalidateQueries({ queryKey: ["patient", id] })}
            />
            <div className="flex gap-2 flex-wrap sm:justify-end">

              <Patient360 patientId={id!} patientName={`${patient.first_name} ${patient.last_name}`} />
              <CaseAnalysis patientId={id!} patientName={`${patient.first_name} ${patient.last_name}`} />
              <Button variant="outline" size="sm" className="gap-1 h-8 text-xs" onClick={() => setCameraOpen(true)}>
                <Camera className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Take</span> Photo
              </Button>
              <Button variant="outline" size="sm" className="gap-1 h-8 text-xs" onClick={() => setSkinTrackerOpen(true)}>
                <ScanEye className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Skin</span> Tracker
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 h-8 text-xs"
                onClick={async () => {
                  const code = Math.floor(100000 + Math.random() * 900000).toString();
                  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                  const { error } = await supabase.rpc("create_patient_portal_token" as any, {
                    _patient_id: id,
                    _otp_code: code,
                    _phone: patient.phone,
                    _expires_at: expiresAt,
                  });
                  if (error) {
                    toast.error("Failed to generate OTP");
                    return;
                  }
                  setOtpCode(code);
                  toast.success("Portal access code generated!");
                }}
              >
                <Share2 className="h-3.5 w-3.5" /> Portal
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 h-8 text-xs"
                onClick={async () => {
                  if (!confirm("Reset this patient's portal PIN? They will be asked to set a new PIN on next login.")) return;
                  const { error } = await supabase
                    .from("patients")
                    .update({
                      portal_pin_hash: null,
                      portal_pin_failed_attempts: 0,
                      portal_pin_locked_until: null,
                    } as any)
                    .eq("id", id!);
                  if (error) {
                    toast.error("Failed to reset PIN");
                    return;
                  }
                  toast.success("Portal PIN reset. Patient will set a new PIN on next login.");
                }}
              >
                <KeyRound className="h-3.5 w-3.5" /> Reset Portal PIN
              </Button>
              <Badge className={`h-8 ${patient.status === "Active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                {patient.status}
              </Badge>
            </div>
            </div>

          </div>
        </motion.div>
      </div>

      {/* OTP Code Display */}
      {otpCode && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="bg-primary/5 border border-primary/20 rounded-xl p-3 md:p-4 mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-primary">Portal Access Code</p>
            <p className="text-xl md:text-2xl font-mono font-bold tracking-widest mt-1">{otpCode}</p>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              Portal: <span className="font-medium">https://clinic.quickapp.ai/portal</span>
            </p>
            <p className="text-xs text-muted-foreground">Expires in 24 hours</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 shrink-0"
            onClick={() => {
              navigator.clipboard.writeText(`Access your The Skin Clinic portal: https://clinic.quickapp.ai/portal\nPhone: ${patient.phone}\nAccess Code: ${otpCode}`);
              setOtpCopied(true);
              toast.success("Copied to clipboard!");
              setTimeout(() => setOtpCopied(false), 2000);
            }}
          >
            {otpCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {otpCopied ? "Copied" : "Copy"}
          </Button>
        </motion.div>
      )}

      <div className="space-y-4 mb-4">
        <EngagementScoreCard patientId={id!} />
      </div>

      <Tabs defaultValue="details" className="mt-2">
        <div className="overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
          <TabsList className="w-max md:w-full md:flex-wrap md:h-auto md:justify-start">
            <TabsTrigger value="details" title="Details" aria-label="Details" className="gap-1 text-xs md:text-sm"><Info className="h-3.5 w-3.5" /> Details</TabsTrigger>
            <TabsTrigger value="appointments" title="Appointments" aria-label="Appointments" className="gap-1 text-xs md:text-sm"><Calendar className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Appts</span> ({appointments.length})</TabsTrigger>
            <TabsTrigger value="invoices" title="Invoices" aria-label="Invoices" className="gap-1 text-xs md:text-sm"><Receipt className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Invoices</span> ({invoices.length})</TabsTrigger>
            <TabsTrigger value="photos" title="Photos" aria-label="Photos" className="gap-1 text-xs md:text-sm"><Camera className="h-3.5 w-3.5" /> ({photos.length})</TabsTrigger>
            <TabsTrigger value="procedures" title="Procedures" aria-label="Procedures" className="gap-1 text-xs md:text-sm"><ClipboardList className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Procedures</span> ({procedures.length})</TabsTrigger>
            <TabsTrigger value="prescriptions" title="Prescriptions" aria-label="Prescriptions" className="gap-1 text-xs md:text-sm"><Pill className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Rx</span> ({prescriptions.length})</TabsTrigger>
            <TabsTrigger value="family" title="Family" aria-label="Family" className="gap-1 text-xs md:text-sm"><Users className="h-3.5 w-3.5" /> Family</TabsTrigger>
            <TabsTrigger value="surveys" title="Surveys" aria-label="Surveys" className="gap-1 text-xs md:text-sm"><ClipboardCheck className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Surveys</span> ({surveyResponses.length + surveyAssignments.length})</TabsTrigger>
            <TabsTrigger value="attachments" title="Attachments" aria-label="Attachments" className="gap-1 text-xs md:text-sm"><Paperclip className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Attachments</span> ({attachments.length})</TabsTrigger>
            <TabsTrigger value="campaigns" title="Campaigns" aria-label="Campaigns" className="gap-1 text-xs md:text-sm"><Megaphone className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Campaigns</span> ({patientCampaigns.length})</TabsTrigger>
          </TabsList>
        </div>

        {/* Details Tab */}
        <TabsContent value="details">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
            <div className="flex justify-end mb-3">
              {detailsEditing ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setDetailsEditing(false); setDetailsForm(null); }}>Cancel</Button>
                  <Button size="sm" className="gap-1.5 h-8 text-xs" disabled={detailsSaving} onClick={async () => {
                    if (!detailsForm) return;
                    setDetailsSaving(true);
                    try {
                      const { error } = await supabase.from("patients").update(detailsForm).eq("id", id!);
                      if (error) throw error;
                      toast.success("Patient details updated");
                      queryClient.invalidateQueries({ queryKey: ["patient", id] });
                      setDetailsEditing(false);
                      setDetailsForm(null);
                    } catch (err: any) {
                      toast.error(err.message);
                    } finally {
                      setDetailsSaving(false);
                    }
                  }}>
                    <Save className="h-3.5 w-3.5" /> Save
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => {
                  setDetailsEditing(true);
                  setDetailsForm({
                    first_name: patient.first_name, last_name: patient.last_name, date_of_birth: patient.date_of_birth,
                    gender: patient.gender, phone: patient.phone, email: patient.email, address: patient.address,
                    city: patient.city, state: patient.state, pincode: patient.pincode,
                    emergency_contact_name: patient.emergency_contact_name, emergency_contact_phone: patient.emergency_contact_phone,
                    blood_group: patient.blood_group, medical_history: patient.medical_history,
                    current_medications: patient.current_medications, allergies: patient.allergies,
                    skin_type: patient.skin_type, skin_concerns: patient.skin_concerns,
                    previous_treatments: patient.previous_treatments, notes: patient.notes, status: patient.status,
                    source: patient.source, source_ad_details: patient.source_ad_details,
                    source_referral_doctor: patient.source_referral_doctor,
                    facebook_url: patient.facebook_url, instagram_url: patient.instagram_url,
                    follows_facebook: patient.follows_facebook, follows_instagram: patient.follows_instagram,
                  });
                }}>
                  <Edit2 className="h-3.5 w-3.5" /> Edit
                </Button>
              )}
            </div>
            {(() => {
              const d = detailsEditing ? detailsForm : patient;
              const upd = (field: string, value: any) => setDetailsForm((prev: any) => ({ ...prev, [field]: value || null }));
              const readOnly = !detailsEditing;

              const elaborate = async (field: string, label: string, currentText: string) => {
                if (!currentText?.trim()) {
                  toast.message("Add a few words first", { description: `Type a short note in ${label} and AI will complete it.` });
                  return;
                }
                setElaboratingField(field);
                try {
                  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elaborate-text`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                    },
                    body: JSON.stringify({
                      serviceName: `Dermatology patient record — ${label}`,
                      fieldType: "symptoms",
                      currentText,
                    }),
                  });
                  if (!res.ok) throw new Error("AI request failed");
                  const { text } = await res.json();
                  if (text) upd(field, text);
                  toast.success("Text elaborated");
                } catch (e: any) {
                  toast.error(e.message || "Failed to elaborate");
                } finally {
                  setElaboratingField(null);
                }
              };

              return (
                <DetailsFieldContext.Provider value={{ readOnly, upd, elaboratingField, elaborate }}>
                <div className="space-y-6">
                  {/* Personal */}
                  <div className="stat-card p-4">
                    <SectionTitle>Personal Information</SectionTitle>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <Field label="First Name" value={d.first_name} field="first_name" />
                      <Field label="Last Name" value={d.last_name} field="last_name" />
                      <Field label="Date of Birth" value={d.date_of_birth} field="date_of_birth" type="date" />
                      <div>
                        <Label className="text-xs text-muted-foreground">Gender</Label>
                        {readOnly ? (
                          <p className="text-sm mt-1">{d.gender || <span className="text-muted-foreground/50">—</span>}</p>
                        ) : (
                          <Select value={d.gender || ""} onValueChange={(v) => upd("gender", v)}>
                            <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Male">Male</SelectItem>
                              <SelectItem value="Female">Female</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <Field label="Phone" value={d.phone} field="phone" />
                      <Field label="Email" value={d.email} field="email" type="email" />
                      <div>
                        <Label className="text-xs text-muted-foreground">Status</Label>
                        {readOnly ? (
                          <p className="text-sm mt-1">{d.status}</p>
                        ) : (
                          <Select value={d.status || "Active"} onValueChange={(v) => upd("status", v)}>
                            <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Active">Active</SelectItem>
                              <SelectItem value="Inactive">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="stat-card p-4">
                    <SectionTitle>Address</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-3">
                        <TextareaField label="Address" value={d.address} field="address" />
                      </div>
                      <Field label="City" value={d.city} field="city" />
                      <Field label="State" value={d.state} field="state" />
                      <Field label="Pincode" value={d.pincode} field="pincode" />
                    </div>
                  </div>

                  {/* Emergency */}
                  <div className="stat-card p-4">
                    <SectionTitle>Emergency Contact</SectionTitle>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Contact Name" value={d.emergency_contact_name} field="emergency_contact_name" />
                      <Field label="Contact Phone" value={d.emergency_contact_phone} field="emergency_contact_phone" />
                    </div>
                  </div>

                  {/* Medical */}
                  <div className="stat-card p-4">
                    <SectionTitle>Medical Information</SectionTitle>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Blood Group</Label>
                        {readOnly ? (
                          <p className="text-sm mt-1">{d.blood_group || <span className="text-muted-foreground/50">—</span>}</p>
                        ) : (
                          <Select value={d.blood_group || ""} onValueChange={(v) => upd("blood_group", v)}>
                            <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <TextareaField label="Medical History" value={d.medical_history} field="medical_history" ai />
                      <TextareaField label="Current Medications" value={d.current_medications} field="current_medications" ai />
                      <TextareaField label="Allergies" value={d.allergies} field="allergies" ai />
                    </div>
                  </div>

                  {/* Derma */}
                  <div className="stat-card p-4">
                    <SectionTitle>Dermatology</SectionTitle>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Skin Type</Label>
                        {readOnly ? (
                          <p className="text-sm mt-1">{d.skin_type || <span className="text-muted-foreground/50">—</span>}</p>
                        ) : (
                          <Select value={d.skin_type || ""} onValueChange={(v) => upd("skin_type", v)}>
                            <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              {["Normal", "Dry", "Oily", "Combination", "Sensitive"].map((st) => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <TextareaField label="Skin Concerns" value={d.skin_concerns} field="skin_concerns" ai />
                      <TextareaField label="Previous Treatments" value={d.previous_treatments} field="previous_treatments" ai />
                    </div>
                  </div>

                  {/* Source & Social */}
                  <div className="stat-card p-4">
                    <SectionTitle>Source & Social</SectionTitle>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Source</Label>
                        {readOnly ? (
                          <p className="text-sm mt-1">{d.source || <span className="text-muted-foreground/50">—</span>}</p>
                        ) : (
                          <Select value={d.source || "Walk-in"} onValueChange={(v) => upd("source", v)}>
                            <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Walk-in">Walk-in</SelectItem>
                              <SelectItem value="Advertisement">Advertisement</SelectItem>
                              <SelectItem value="Other Dr. referral">Other Dr. referral</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      {d.source === "Advertisement" && <Field label="Ad Details" value={d.source_ad_details} field="source_ad_details" />}
                      {d.source === "Other Dr. referral" && <Field label="Referring Doctor" value={d.source_referral_doctor} field="source_referral_doctor" />}
                      <Field label="Facebook URL" value={d.facebook_url} field="facebook_url" />
                      <Field label="Instagram URL" value={d.instagram_url} field="instagram_url" />
                      <div className="flex items-center gap-4 col-span-2">
                        <div className="flex items-center gap-2">
                          <Checkbox id="det-fb" checked={d.follows_facebook || false} disabled={readOnly} onCheckedChange={(c) => upd("follows_facebook", !!c)} />
                          <Label htmlFor="det-fb" className="text-xs">Follows Facebook</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox id="det-ig" checked={d.follows_instagram || false} disabled={readOnly} onCheckedChange={(c) => upd("follows_instagram", !!c)} />
                          <Label htmlFor="det-ig" className="text-xs">Follows Instagram</Label>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Patient Engagement (automated roll-ups) */}
                  <PatientEngagementRollups
                    patient={patient}
                    visitsOverride={visitCount}
                    lifetimeValueOverride={lifetimeValue}
                  />

                  {/* Notes */}
                  <div className="stat-card p-4">
                    <SectionTitle>Notes</SectionTitle>
                    <TextareaField label="Additional Notes" value={d.notes} field="notes" />
                  </div>

                  {/* System Record */}
                  <SystemRecordSection
                    record={patient}
                    owner={{
                      objectType: "patients",
                      objectLabel: "Patient",
                      recordLabel: `${patient?.first_name ?? ""} ${patient?.last_name ?? ""}`.trim() || "Patient",
                      link: `/patients/${id}`,
                    }}
                  />

                  {/* History Tracking */}
                  <FieldHistorySection objectType="patients" recordId={id} />
                </div>
                </DetailsFieldContext.Provider>
              );
            })()}
          </motion.div>
        </TabsContent>

        {/* Appointments Tab */}
        <TabsContent value="appointments">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
            <div className="flex justify-end mb-3">
              <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => navigate(`/appointments?new=1&patient_id=${id}`)}>
                <Plus className="h-3.5 w-3.5" /> Book Appointment
              </Button>
            </div>
            <div className="md:hidden space-y-3">
              {appointments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No appointments found</div>
              ) : appointments.map((apt: any) => (
                <div key={apt.id} className="stat-card p-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setSelectedAppointmentId(apt.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{apt.service}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{apt.staff ? `Dr. ${apt.staff.first_name} ${apt.staff.last_name}` : "—"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="secondary" className="text-xs">{apt.status}</Badge>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(apt.start_time).toLocaleDateString()}</p>
                      <p className="text-xs text-muted-foreground">{new Date(apt.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block data-table">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left text-xs font-medium text-muted-foreground p-4">Date & Time</th>
                    <th className="text-left text-xs font-medium text-muted-foreground p-4">Service</th>
                    <th className="text-left text-xs font-medium text-muted-foreground p-4">Doctor</th>
                    <th className="text-left text-xs font-medium text-muted-foreground p-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {appointments.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">No appointments found</td></tr>
                  ) : appointments.map((apt: any) => (
                    <tr key={apt.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelectedAppointmentId(apt.id)}>
                      <td className="p-4 text-sm">
                        <p>{new Date(apt.start_time).toLocaleDateString()}</p>
                        <p className="text-xs text-muted-foreground">{new Date(apt.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </td>
                      <td className="p-4 font-medium text-sm">{apt.service}</td>
                      <td className="p-4 text-sm text-muted-foreground">{apt.staff ? `Dr. ${apt.staff.first_name} ${apt.staff.last_name}` : "—"}</td>
                      <td className="p-4"><Badge variant="secondary" className="text-xs">{apt.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
            <div className="flex justify-end mb-3">
              <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => navigate(`/billing?patientId=${id}&newInvoice=1`)}>
                <Plus className="h-3.5 w-3.5" /> Create Invoice
              </Button>
            </div>
            <div className="md:hidden space-y-3">
              {invoices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No invoices found</div>
              ) : invoices.map((inv: any) => (
                <div key={inv.id} className="stat-card p-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => navigate(`/billing?viewInvoice=${inv.id}`)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{inv.invoice_number}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{new Date(inv.created_at).toLocaleDateString()}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(inv.services || []).slice(0, 2).map((s: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">{s}</Badge>
                        ))}
                        {(inv.services || []).length > 2 && <Badge variant="secondary" className="text-[10px]">+{inv.services.length - 2}</Badge>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-sm">₹{Number(inv.total_amount).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Paid: ₹{Number(inv.paid_amount).toLocaleString()}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${statusStyles[inv.status] || ""}`}>{inv.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block data-table">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left text-xs font-medium text-muted-foreground p-4">Invoice #</th>
                    <th className="text-left text-xs font-medium text-muted-foreground p-4">Date</th>
                    <th className="text-left text-xs font-medium text-muted-foreground p-4">Services</th>
                    <th className="text-right text-xs font-medium text-muted-foreground p-4">Amount</th>
                    <th className="text-left text-xs font-medium text-muted-foreground p-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {invoices.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">No invoices found</td></tr>
                  ) : invoices.map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/billing?viewInvoice=${inv.id}`)}>
                      <td className="p-4 font-medium text-sm">{inv.invoice_number}</td>
                      <td className="p-4 text-sm">{new Date(inv.created_at).toLocaleDateString()}</td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {(inv.services || []).map((s: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <p className="font-semibold text-sm">₹{Number(inv.total_amount).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Paid: ₹{Number(inv.paid_amount).toLocaleString()}</p>
                      </td>
                      <td className="p-4">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusStyles[inv.status] || ""}`}>{inv.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </TabsContent>

        {/* Photos Tab */}
        <TabsContent value="photos">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
            <div className="flex justify-end gap-2 mb-3">
              {/* accept="image/*" with no capture attribute is what makes a phone offer
                  the gallery rather than jumping straight into the camera. */}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoCapture}
              />
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-8 text-xs"
                disabled={uploadingPhoto}
                onClick={() => photoInputRef.current?.click()}
              >
                <Paperclip className="h-3.5 w-3.5" /> {uploadingPhoto ? "Uploading..." : "Attach Photo"}
              </Button>
              <Button
                size="sm"
                className="gap-1.5 h-8 text-xs"
                disabled={uploadingPhoto}
                onClick={() => setCameraOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" /> Take Photo
              </Button>
            </div>
            {photos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Camera className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No photos yet. Take or attach a photo to start documenting.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                {photos.map((photo: any) => (
                  <div key={photo.id} className="stat-card p-0 overflow-hidden">
                    <div className="relative">
                      {failedPhotoIds.has(photo.id) ? (
                        <div className="w-full h-32 md:h-40 flex flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
                          <ImageOff className="h-5 w-5" />
                          <span className="text-[10px]">Photo unavailable</span>
                        </div>
                      ) : (
                        <img
                          src={photo.photo_url}
                          alt=""
                          className="w-full h-32 md:h-40 object-cover"
                          loading="lazy"
                          onError={() => setFailedPhotoIds((prev) => new Set(prev).add(photo.id))}
                        />
                      )}
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-7 w-7 opacity-90"
                        onClick={(e) => { e.stopPropagation(); deletePhoto(photo); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="p-2 md:p-3">
                      {photo.procedures?.service_name && <p className="text-xs text-muted-foreground truncate">{photo.procedures.service_name}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">{new Date(photo.taken_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </TabsContent>

        {/* Procedures Tab */}
        <TabsContent value="procedures">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 space-y-3 md:space-y-0">
            <div className="flex justify-end mb-3">
              <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setProcedureFormOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add Procedure
              </Button>
            </div>
            <div className="md:hidden space-y-3">
              {procedures.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No procedures recorded</div>
              ) : procedures.map((proc: any) => (
                <div key={proc.id} className="stat-card p-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setSelectedProcedureId(proc.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{proc.service_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {proc.staff ? `Dr. ${proc.staff.first_name} ${proc.staff.last_name}` : "—"}
                      </p>
                      {proc.diagnosis && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{proc.diagnosis}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="secondary" className="text-xs">{proc.status}</Badge>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(proc.procedure_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block data-table">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left text-xs font-medium text-muted-foreground p-4">Date</th>
                    <th className="text-left text-xs font-medium text-muted-foreground p-4">Service</th>
                    <th className="text-left text-xs font-medium text-muted-foreground p-4">Doctor</th>
                    <th className="text-left text-xs font-medium text-muted-foreground p-4">Diagnosis</th>
                    <th className="text-left text-xs font-medium text-muted-foreground p-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {procedures.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">No procedures recorded</td></tr>
                  ) : procedures.map((proc: any) => (
                    <tr key={proc.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelectedProcedureId(proc.id)}>
                      <td className="p-4 text-sm">{new Date(proc.procedure_date).toLocaleDateString()}</td>
                      <td className="p-4 font-medium text-sm">{proc.service_name}</td>
                      <td className="p-4 text-sm text-muted-foreground">{proc.staff ? `Dr. ${proc.staff.first_name} ${proc.staff.last_name}` : "—"}</td>
                      <td className="p-4 text-sm text-muted-foreground truncate max-w-[200px]">{proc.diagnosis || "—"}</td>
                      <td className="p-4"><Badge variant="secondary" className="text-xs">{proc.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </TabsContent>

        {/* Prescriptions Tab */}
        <TabsContent value="prescriptions">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
            <div className="flex justify-end mb-3">
              <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setAddRxOpen(!addRxOpen)}>
                <Plus className="h-3.5 w-3.5" /> Add Medicine
              </Button>
            </div>
            {addRxOpen && (
              <div className="stat-card p-4 mb-4 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Procedure *</Label>
                    <Select value={rxForm.procedure_id} onValueChange={(v) => setRxForm(p => ({ ...p, procedure_id: v }))}>
                      <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Select procedure" /></SelectTrigger>
                      <SelectContent>
                        {procedures.map((proc: any) => (
                          <SelectItem key={proc.id} value={proc.id}>{proc.service_name} — {new Date(proc.procedure_date).toLocaleDateString()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Medicine Name *</Label>
                    <Select
                      value={rxForm.medicine_name}
                      onValueChange={(v) => setRxForm(p => ({ ...p, medicine_name: v }))}
                    >
                      <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Select medicine" /></SelectTrigger>
                      <SelectContent>
                        {pharmaProducts.map((prod: any) => (
                          <SelectItem key={prod.id} value={prod.name}>{prod.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs flex items-center justify-between">Dosage <MicButton value={rxForm.dosage} onChange={(v) => setRxForm(p => ({ ...p, dosage: v }))} mode="replace" /></Label>
                    <Input value={rxForm.dosage} onChange={(e) => setRxForm(p => ({ ...p, dosage: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="e.g. 500mg" />
                  </div>
                  <div>
                    <Label className="text-xs flex items-center justify-between">Frequency <MicButton value={rxForm.frequency} onChange={(v) => setRxForm(p => ({ ...p, frequency: v }))} mode="replace" /></Label>
                    <Input value={rxForm.frequency} onChange={(e) => setRxForm(p => ({ ...p, frequency: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="e.g. Twice daily" />
                  </div>
                  <div>
                    <Label className="text-xs flex items-center justify-between">Duration <MicButton value={rxForm.duration} onChange={(v) => setRxForm(p => ({ ...p, duration: v }))} mode="replace" /></Label>
                    <Input value={rxForm.duration} onChange={(e) => setRxForm(p => ({ ...p, duration: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="e.g. 7 days" />
                  </div>
                  <div>
                    <Label className="text-xs">Quantity</Label>
                    <Input type="number" value={rxForm.quantity} onChange={(e) => setRxForm(p => ({ ...p, quantity: parseInt(e.target.value) || 1 }))} className="mt-1 h-8 text-sm" />
                  </div>
                  <div className="col-span-2 md:col-span-3">
                    <Label className="text-xs flex items-center justify-between">Instructions <MicButton value={rxForm.instructions} onChange={(v) => setRxForm(p => ({ ...p, instructions: v }))} /></Label>
                    <Input value={rxForm.instructions} onChange={(e) => setRxForm(p => ({ ...p, instructions: e.target.value }))} className="mt-1 h-8 text-sm" placeholder="e.g. After meals" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAddRxOpen(false)}>Cancel</Button>
                  <Button size="sm" className="h-7 text-xs" onClick={async () => {
                    if (!rxForm.medicine_name.trim()) {
                      toast.error("Medicine name is required");
                      return;
                    }
                    const { error } = await supabase.from("prescriptions").insert({
                      procedure_id: rxForm.procedure_id || null,
                      medicine_name: rxForm.medicine_name,
                      dosage: rxForm.dosage || null,
                      frequency: rxForm.frequency || null,
                      duration: rxForm.duration || null,
                      quantity: rxForm.quantity,
                      instructions: rxForm.instructions || null,
                    });
                    if (error) { toast.error(error.message); return; }
                    toast.success("Medicine added");
                    setRxForm({ medicine_name: "", dosage: "", frequency: "", duration: "", quantity: 1, instructions: "", procedure_id: "" });
                    setAddRxOpen(false);
                    queryClient.invalidateQueries({ queryKey: ["patient-prescriptions", id] });
                  }}>Save</Button>
                </div>
              </div>
            )}
            <div className="space-y-3">
              {prescriptions.length === 0 && !addRxOpen ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No prescriptions found</div>
              ) : prescriptions.map((rx: any) => (
                <div key={rx.id} className="stat-card p-3 md:p-4 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => {
                  if (rx.procedure_id) setSelectedProcedureId(rx.procedure_id);
                  else if (rx.survey_response_id) navigate(`/surveys/${rx.survey_response_id}`);
                }}>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{rx.medicine_name}</p>
                        {rx.survey_response_id && !rx.procedure_id && (
                          <Badge variant="secondary" className="text-[10px]">From Survey</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[rx.dosage, rx.frequency, rx.duration].filter(Boolean).join(" · ")}
                        {rx.quantity > 1 && ` · Qty: ${rx.quantity}`}
                      </p>
                      {rx.instructions && <p className="text-xs text-muted-foreground italic mt-1">{rx.instructions}</p>}
                    </div>
                    <div className="flex items-start gap-2 shrink-0">
                      {rx.procedures && (
                        <div className="text-left sm:text-right text-xs text-muted-foreground">
                          <p>{rx.procedures.service_name}</p>
                          <p>{new Date(rx.procedures.procedure_date).toLocaleDateString()}</p>
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const { error } = await supabase.from("prescriptions").delete().eq("id", rx.id);
                          if (error) { toast.error(error.message); return; }
                          toast.success("Prescription removed");
                          queryClient.invalidateQueries({ queryKey: ["patient-prescriptions", id] });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </TabsContent>

        {/* Family Tab */}
        <TabsContent value="family">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
            <FamilyMembers patientId={id!} patientName={`${patient.first_name} ${patient.last_name}`} />
          </motion.div>
        </TabsContent>

        {/* Surveys Tab */}
        <TabsContent value="surveys">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
            <div className="flex justify-end mb-3 gap-2">
              {!addSurveyMode ? (
                <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setAddSurveyMode("choice")}>
                  <Plus className="h-3.5 w-3.5" /> Add Survey
                </Button>
              ) : addSurveyMode === "choice" ? (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAddSurveyMode("fill")}>Fill Now</Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAddSurveyMode("assign")}>Assign to Patient</Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAddSurveyMode(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Select
                    onValueChange={(val) => {
                      if (addSurveyMode === "fill") {
                        setAddSurveyMode(null);
                        navigate(`/surveys/new?patient=${id}&template=${val}`);
                      } else if (addSurveyMode === "assign") {
                        assignTemplate(val);
                      }
                    }}
                  >
                    <SelectTrigger className="w-[240px] h-8 text-xs" disabled={assigning}>
                      <SelectValue placeholder={addSurveyMode === "fill" ? "Select template to fill..." : "Select template to assign..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {surveyTemplates.map((t: any) => (
                        <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAddSurveyMode(null)} disabled={assigning}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
            {surveyAssignments.length > 0 && (
              <div className="mb-3 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Assigned · Awaiting patient</p>
                {surveyAssignments.map((a: any) => (
                  <div key={a.id} className="stat-card p-3 flex items-center justify-between gap-3">
                    <p className="font-medium text-sm truncate">{a.survey_templates?.name || "Survey"}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px]">Pending patient</Badge>
                      <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {surveyResponses.length === 0 && surveyAssignments.length === 0 && !addSurveyMode ? (
              <div className="text-center py-12 text-muted-foreground">
                <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No survey responses yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {surveyResponses.map((sr: any) => {
                  const template = sr.survey_templates;
                  const currentStatus = sr.dr_status === "approved" || sr.dr_status === "reviewed" ? "Reviewed" : "Pending";
                  return (
                    <div
                      key={sr.id}
                      className="stat-card p-3 flex items-center justify-between gap-3 cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => navigate(`/surveys/${sr.id}`)}
                    >
                      <div className="min-w-0 flex items-center gap-1.5">
                        <p className="font-medium text-sm truncate">{template?.name || "Survey"}</p>
                        <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Badge
                              variant={currentStatus === "Reviewed" ? "default" : "secondary"}
                              className="text-[10px] cursor-pointer hover:opacity-80 gap-1"
                            >
                              {currentStatus}
                              <ChevronDown className="h-2.5 w-2.5" />
                            </Badge>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); changeSurveyStatus(sr, "Pending"); }}>
                              Pending
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); changeSurveyStatus(sr, "Reviewed"); }}>
                              Reviewed
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <p className="text-xs text-muted-foreground">{new Date(sr.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </TabsContent>

        {/* Attachments Tab */}
        <TabsContent value="attachments">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <Select value={attachmentFilter} onValueChange={setAttachmentFilter}>
                <SelectTrigger className="h-8 text-xs w-full sm:w-56"><SelectValue placeholder="Filter by type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="Prescription">Prescription</SelectItem>
                  <SelectItem value="Consent Form">Consent Form</SelectItem>
                  <SelectItem value="Lab Report">Lab Report</SelectItem>
                  <SelectItem value="Previous Doctor Report">Previous Doctor Report</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleAttachmentUpload} />
                <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" disabled={uploadingAttachment} onClick={() => setAttachmentCameraOpen(true)}>
                  <Camera className="h-3.5 w-3.5" /> Take Photo
                </Button>
                <Button size="sm" className="gap-1.5 h-8 text-xs" disabled={uploadingAttachment} onClick={() => fileInputRef.current?.click()}>
                  {uploadingAttachment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Upload File
                </Button>
              </div>
            </div>
            {(() => {
              const filtered = attachmentFilter === "all"
                ? attachments
                : attachments.filter((a: any) => a.document_type === attachmentFilter);
              if (filtered.length === 0) {
                return (
                  <div className="text-center py-12 text-muted-foreground">
                    <Paperclip className="h-10 w-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No attachments {attachmentFilter !== "all" ? `of type "${attachmentFilter}"` : "yet"}. Upload files to attach to this patient.</p>
                  </div>
                );
              }
              return (
                <div className="space-y-3">
                  {filtered.map((att: any) => (
                  <div key={att.id} className="stat-card p-3 md:p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{att.file_name}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {att.document_type && (
                              <Badge variant="default" className="text-[10px]">{att.document_type}</Badge>
                            )}
                            {att.procedures?.service_name && (
                              <Badge variant="secondary" className="text-[10px]">{att.procedures.service_name}</Badge>
                            )}
                            <span className="text-xs text-muted-foreground">{new Date(att.created_at).toLocaleDateString()}</span>
                          </div>
                          {att.notes && <p className="text-xs text-muted-foreground mt-1">{att.notes}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setViewingAttachment(att)}
                        >
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deleteAttachment(att)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  ))}
                </div>
              );
            })()}
          </motion.div>
        </TabsContent>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
            <div className="flex justify-end mb-3">
              <Popover open={linkCampaignOpen} onOpenChange={setLinkCampaignOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" className="gap-1.5 h-8 text-xs">
                    <Plus className="h-3.5 w-3.5" /> Link Campaign
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input value={linkCampaignSearch} onChange={(e) => setLinkCampaignSearch(e.target.value)} placeholder="Search campaigns…" className="h-8" />
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-0.5">
                    {(() => {
                      const linkedIds = new Set(patientCampaigns.map((pc: any) => pc.campaigns?.id));
                      const available = (allCampaignsForLink as any[])
                        .filter((c) => !linkedIds.has(c.id))
                        .filter((c) => c.name.toLowerCase().includes(linkCampaignSearch.toLowerCase()));
                      if (available.length === 0) {
                        return <p className="text-xs text-muted-foreground p-2">No available campaigns</p>;
                      }
                      return available.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent"
                          onClick={() => linkCampaignToPatient(c.id)}
                        >
                          {c.name} {c.status !== "Active" && <span className="text-xs text-muted-foreground">({c.status})</span>}
                        </button>
                      ));
                    })()}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {patientCampaigns.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Megaphone className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No campaigns linked yet.</p>
              </div>
            ) : (
              <div className="data-table">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 px-3 font-medium">Campaign</th>
                      <th className="py-2 px-3 font-medium">Type</th>
                      <th className="py-2 px-3 font-medium">Status</th>
                      <th className="py-2 px-3 font-medium">Date Linked</th>
                      <th className="py-2 px-3 font-medium">Linked By</th>
                      <th className="py-2 px-3 w-[60px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {patientCampaigns.map((pc: any) => (
                      <tr key={pc.id} className="border-b hover:bg-muted/40">
                        <td className="py-2 px-3 font-medium text-primary cursor-pointer" onClick={() => navigate(`/campaigns/${pc.campaigns?.id}`)}>
                          {pc.campaigns?.name || "—"}
                        </td>
                        <td className="py-2 px-3">{pc.campaigns?.type || "—"}</td>
                        <td className="py-2 px-3">{pc.campaigns?.status || "—"}</td>
                        <td className="py-2 px-3">{pc.linked_date ? format(new Date(pc.linked_date), "dd MMM yyyy") : "—"}</td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">{pc.linked_by ? (linkedByMap[pc.linked_by] || "—") : "—"}</td>
                        <td className="py-2 px-3">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => unlinkCampaignFromPatient(pc.id, pc.campaigns?.id)}>
                            <X className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        </TabsContent>
      </Tabs>


      <Dialog open={docTypeDialogOpen} onOpenChange={(o) => { if (!o) { setDocTypeDialogOpen(false); setPendingAttachmentFile(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Document Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {pendingAttachmentFile && (
              <p className="text-xs text-muted-foreground truncate">File: {pendingAttachmentFile.name}</p>
            )}
            <div>
              <Label>Type</Label>
              <Select value={selectedDocType} onValueChange={setSelectedDocType}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Prescription">Prescription</SelectItem>
                  <SelectItem value="Consent Form">Consent Form</SelectItem>
                  <SelectItem value="Lab Report">Lab Report</SelectItem>
                  <SelectItem value="Previous Doctor Report">Previous Doctor Report</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setDocTypeDialogOpen(false); setPendingAttachmentFile(null); }}>Cancel</Button>
              <Button size="sm" disabled={uploadingAttachment} onClick={uploadPendingAttachment}>
                {uploadingAttachment ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CameraDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        title="Take Patient Photo"
        onCapture={(file) => savePhotoFile(file)}
      />
      <CameraDialog
        open={attachmentCameraOpen}
        onOpenChange={setAttachmentCameraOpen}
        title="Capture Attachment"
        onCapture={(file) => {
          setPendingAttachmentFile(file);
          setSelectedDocType("Prescription");
          setDocTypeDialogOpen(true);
        }}
      />

      <SkinTracker
        open={skinTrackerOpen}
        onOpenChange={setSkinTrackerOpen}
        photos={photos}
        patientName={`${patient.first_name} ${patient.last_name}`}
      />

      <ProcedureFormDialog
        open={procedureFormOpen}
        onOpenChange={setProcedureFormOpen}
        defaultPatientId={id}
      />

      <ProcedureDetailSheet
        procedureId={selectedProcedureId}
        onClose={() => {
          setSelectedProcedureId(null);
          queryClient.invalidateQueries({ queryKey: ["patient-procedures", id] });
          queryClient.invalidateQueries({ queryKey: ["patient-prescriptions", id] });
        }}
      />

      <AppointmentDetailSheet
        appointmentId={selectedAppointmentId}
        fullScreen
        onClose={() => {
          setSelectedAppointmentId(null);
          queryClient.invalidateQueries({ queryKey: ["patient-appointments", id] });
        }}
      />

      {patient && (
        <QuickAppointmentDialog
          open={quickApptOpen}
          onOpenChange={setQuickApptOpen}
          patient={{
            id: patient.id,
            first_name: patient.first_name,
            last_name: patient.last_name,
            phone: patient.phone,
            gender: patient.gender,
          }}
        />
      )}

      {/* Survey detail moved to dedicated /surveys/:id route */}

      <Dialog open={!!viewingAttachment} onOpenChange={(o) => { if (!o) setViewingAttachment(null); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="font-display truncate pr-8">{viewingAttachment?.file_name}</DialogTitle>
          </DialogHeader>
          {viewingAttachment && (() => {
            const url: string = viewingAttachment.file_url || "";
            const name: string = viewingAttachment.file_name || url;
            const lower = name.toLowerCase();
            const isImage = /\.(jpe?g|png|gif|webp|bmp|heic|heif|svg)$/i.test(lower) || /\.(jpe?g|png|gif|webp|bmp)$/i.test(url.split("?")[0]);
            const isPdf = /\.pdf$/i.test(lower) || /\.pdf(\?|$)/i.test(url);
            return (
              <div className="space-y-3">
                <div className="bg-muted/40 rounded-lg overflow-hidden flex items-center justify-center" style={{ minHeight: 400 }}>
                  {isImage ? (
                    <img src={url} alt={name} className="max-h-[70vh] w-auto object-contain" />
                  ) : isPdf ? (
                    <iframe src={url} title={name} className="w-full h-[70vh]" />
                  ) : (
                    <div className="p-8 text-center">
                      <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">Preview not available for this file type.</p>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={url} target="_blank" rel="noopener noreferrer">Open in new tab</a>
                  </Button>
                  <Button size="sm" asChild>
                    <a href={url} download={name}>Download</a>
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PatientDetail;
