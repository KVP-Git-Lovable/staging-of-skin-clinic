import { useState, useRef, useEffect, useMemo } from "react";
import { numVal } from "@/lib/numberInput";
import { applyMedicineDefaults } from "@/lib/medicineDefaults";
import { usePharmaLookup } from "@/hooks/usePharmaLookup";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { renderPdfToImages } from "@/lib/renderPdf";
import { isConsultationService } from "@/lib/consultationLine";
import { isRollUpOf, nextRollUpValue, parentHoldsOwnText as holdsOwnText } from "@/lib/procedureRollup";
import { assertWrote } from "@/lib/rowAccess";
import { clearVisitAt, joinVisitDateTime, removeVisitAt, splitVisitDateTime, toVisitInputValue, visitsNeedingAppointment } from "@/lib/recurringVisits";
import { reservedVisits } from "@/lib/reservedVisits";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useLiveAppointments } from "@/hooks/useLiveAppointments";
import { DateInput } from "@/components/shared/DateInput";
import { TimePicker12h } from "@/components/shared/TimePicker12h";
import { PdfPreviewDialog } from "@/components/shared/PdfPreviewDialog";
import { usePrescriptionPreview } from "@/hooks/usePrescriptionPreview";
import { MAX_DATETIME, MIN_DATETIME, isPlausibleIso } from "@/lib/dateInput";

import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Save, Trash2, Pill, Camera, Plus, Paperclip, X, Sparkles, Loader2, Download, MessageCircle, Repeat, Receipt, HeartPulse, ClipboardList, StickyNote, Eye, FileText, CalendarClock, ExternalLink, Stethoscope } from "lucide-react";

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
import { StickyNotes } from "@/components/shared/StickyNotes";
import { OTHERS_VALUE } from "@/lib/othersOption";
import { droppedMedicineNotice, knownProductIds, losesCatalogueLink, productIdForSave } from "@/lib/prescriptionProducts";
import { parentServiceName, linesToWrite, matchStoredRows, namesFromParent, dedupeByName } from "@/lib/serviceLineSave";
import { patientIdentityLine } from "@/lib/patientIdentity";
import { ServicePicker } from "@/components/procedures/ServicePicker";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { type ServiceOption } from "@/lib/servicePicker";
import { MEDICAL_FIELDS, SKIN_TYPE_OPTIONS } from "@/lib/medicalFields";
import { capitaliseFirstWord } from "@/lib/sentenceCase";
import { partitionVisitMedia } from "@/lib/visitMedia";
import { parsePrescriptionText } from "@/lib/prescriptionText";
import type { Tables } from "@/integrations/supabase/types";
import { procedureDateLabel } from "@/lib/procedureDate";
import { ClinicalGuidelines } from "@/components/knowledge/ClinicalGuidelines";
import { appendCare } from "@/lib/knowledge";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
// The busiest patient has 310 photos; this is a guard, not a limit anyone
// is expected to hit.
const MAX_PATIENT_MEDIA = 500;

type PatientPhoto = Tables<"patient_photos">;
type ProcedureAttachment = Tables<"procedure_attachments">;
const statusOptions = ["Completed", "In Progress", "Cancelled"];
// MEDICAL_FIELDS and SKIN_TYPE_OPTIONS are shared with ProcedureFormDialog:
// this sheet used to hold its own literal copy of the field list, so a field
// renamed on the create form kept its old name here.

interface PrescriptionRow {
  id?: string;
  /**
   * Identity of this row, stable while it exists - the same reason
   * ServiceLineRow above carries one. Keyed by array index, removing a
   * medicine made React re-use each row's component instances for the data
   * that shuffled up into its place, so Remove appeared to delete the wrong
   * one or nothing at all.
   */
  key: string;
  product_id: string;
  medicine_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  quantity: number;
  _deleted?: boolean;
}

let rxSeq = 0;
const newRxKey = () => `rx-${Date.now()}-${rxSeq++}`;

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
  // A patient's images from their other visits stay one click away rather than
  // on screen by default - the busiest patient has 310 of them.
  const [showOtherPhotos, setShowOtherPhotos] = useState(false);
  const [showOtherAttachments, setShowOtherAttachments] = useState(false);

  const [initialized, setInitialized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editable fields
  const [editServiceName, setEditServiceName] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editStaffId, setEditStaffId] = useState("");
  const [medical, setMedical] = useState<Record<string, string>>({});
  const [medicalDirty, setMedicalDirty] = useState(false);
  const [editProcedureNotes, setEditProcedureNotes] = useState("");
  /**
   * The visit plan, editable here rather than only shown.
   *
   * It used to be a read-only badge: a prescription written as a single visit
   * could never become a course without starting again, and a course already
   * written could not have a visit added to it. The dates below are held the
   * way the create form holds them ("YYYY-MM-DDTHH:mm"); what is stored on the
   * row is ISO, so seeding converts and saving converts back.
   */
  const [editVisitType, setEditVisitType] = useState<"Single" | "Recurring">("Single");
  const [editRecurringCount, setEditRecurringCount] = useState(2);
  const [editRecurringDates, setEditRecurringDates] = useState<string[]>(["", ""]);
  // One investigation per visit, indexed alongside the dates - see
  // reservedVisits.ts for why they are paired before blanks are dropped. Only
  // new visits need one; the ones already booked are edited under Follow-up
  // appointments below.
  const [editVisitInvestigations, setEditVisitInvestigations] = useState<string[]>([]);
  const [editRecommendations, setEditRecommendations] = useState("");
  // The medicines a Salesforce visit recorded, read out of the free text they
  // were typed into. Only used when this visit has no structured prescription
  // rows of its own - see the Products/Medications panel below.
  const importedPrescription = parsePrescriptionText(editProcedureNotes);
  const [editReviewNotes, setEditReviewNotes] = useState("");
  const [editAssistedByIds, setEditAssistedByIds] = useState<string[]>([]);
  const [editServiceLines, setEditServiceLines] = useState<ServiceLineRow[]>([]);
  const [servicesInitialized, setServicesInitialized] = useState(false);
  /**
   * Whether this visit's Special Instructions hold anything of their own.
   *
   * Decided once, from the lines as the visit was opened, and left alone while
   * the doctor works. It used to be recomputed from the lines on every
   * keystroke: typing a recommendation onto a service made the stored parent
   * text stop matching the lines, so a Special Instructions box the doctor had
   * never seen appeared mid-sentence, already filled with words they had not
   * typed into it. The box's own save rule compares against these same opening
   * lines, so the two now agree.
   */
  const [parentHoldsOwnText, setParentHoldsOwnText] = useState(false);
  const [editPrescriptions, setEditPrescriptions] = useState<PrescriptionRow[]>([]);
  const [attachmentNotes, setAttachmentNotes] = useState("");
  // Moving from one visit to another without closing the sheet kept the
  // previous visit's services, medicines and medical info on screen. Reset the
  // edit state whenever the visit changes so it reloads from this visit.
  const [loadedFor, setLoadedFor] = useState(procedureId);
  if (loadedFor !== procedureId) {
    setLoadedFor(procedureId);
    setInitialized(false);
    setServicesInitialized(false);
    setParentHoldsOwnText(false);
    setEditServiceLines([]);
    setEditPrescriptions([]);
    setMedical({});
    setMedicalDirty(false);
  }
  const [uploading, setUploading] = useState(false);
  const [elaborating, setElaborating] = useState<null | string>(null);

  // Building, drawing and saving the prescription now live in a hook, because
  // the patient's Prescriptions tab and an appointment's Previous
  // Prescriptions needed the same thing and copying it would have left three
  // versions of the reasoning below to drift apart.
  const prescriptionPdf = usePrescriptionPreview(procedureId);
  const previewingPdf = prescriptionPdf.previewing;
  const downloadingPdf = prescriptionPdf.downloading;
  const handlePreviewPrescription = prescriptionPdf.preview;
  const handleDownloadPrescription = prescriptionPdf.download;
  // The service lines as this visit was opened, so the save can tell a parent
  // value that is merely their roll-up from one holding something of its own.
  const originalServiceLinesRef = useRef<ServiceLineRow[]>([]);
  // Whether procedure_services actually held rows when this visit was opened.
  // Not the same as "the lines on screen": an imported visit is shown a line
  // read from its parent row, and that one was never stored.
  const hadStoredLinesRef = useRef(false);
  const [sendingWa, setSendingWa] = useState(false);

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
        .select("*, patients(first_name, last_name, date_of_birth, gender), staff:staff!procedures_staff_id_fkey(first_name, last_name)")
        .eq("id", procedureId)
        .maybeSingle();
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

  const {
    data: procedureServices = [],
    isLoading: procedureServicesLoading,
    // isLoading is false the moment there is anything in the cache, even a
    // list fetched before this visit's rows were written. Seeding from that
    // is what invented a second copy of a service - so the seed waits for a
    // fetch that has actually come back for THIS visit.
    isFetching: procedureServicesFetching,
  } = useQuery({
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



  // By patient, then split - see src/lib/visitMedia.ts. Asking for
  // procedure_id alone returned nothing for every imported patient, because the
  // Salesforce import kept only the patient link.
  const { data: allPhotos = [] } = useQuery({
    queryKey: ["patient-photos", "procedure", procedure?.patient_id],
    queryFn: async () => {
      if (!procedure?.patient_id) return [];
      const { data, error } = await supabase
        .from("patient_photos")
        .select("*")
        .eq("patient_id", procedure.patient_id)
        .order("taken_at", { ascending: false })
        .limit(MAX_PATIENT_MEDIA);
      if (error) throw error;
      return data;
    },
    enabled: !!procedure?.patient_id,
  });

  const { data: allAttachments = [], refetch: refetchAttachments } = useQuery({
    queryKey: ["patient-attachments-for-procedure", procedure?.patient_id],
    queryFn: async () => {
      if (!procedure?.patient_id) return [];
      const { data, error } = await supabase
        .from("procedure_attachments")
        .select("*")
        .eq("patient_id", procedure.patient_id)
        .order("created_at", { ascending: false })
        .limit(MAX_PATIENT_MEDIA);
      if (error) throw error;
      return data;
    },
    enabled: !!procedure?.patient_id,
  });

  // What this visit is, for deciding which images are its own.
  const visitRef = {
    procedureId: procedureId || null,
    appointmentId: (procedure as any)?.appointment_id || null,
    date: (procedure as any)?.procedure_date || null,
  };
  const { thisVisit: photos, otherVisits: otherPhotos } = partitionVisitMedia<PatientPhoto>(allPhotos, visitRef);
  const { thisVisit: attachments, otherVisits: otherAttachments } = partitionVisitMedia<ProcedureAttachment>(
    allAttachments,
    visitRef,
  );

  const { data: products = [] } = usePharmaLookup();

  // Patient medical snapshot — editable here and synced back to the patient record
  const { data: patientRecord } = useQuery({
    queryKey: ["procedure-detail-patient", procedure?.patient_id],
    enabled: !!procedure?.patient_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, medical_history, current_medications, dietary_advice, skin_type, previous_treatments")
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
      dietary_advice: patientRecord.dietary_advice || "",
      skin_type: patientRecord.skin_type || "",
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
    // Not filtered: a stored date that cannot be read leaves its row on screen
    // blank rather than quietly shrinking a three-visit course to two, where
    // the next save would write the shorter list back as the truth.
    const storedVisits = (((procedure as any).recurring_dates || []) as string[])
      .map(toVisitInputValue);
    setEditVisitType((procedure as any).visit_type === "Recurring" ? "Recurring" : "Single");
    // Two empty rows for a single visit being turned into a course, so there
    // is somewhere to type the moment the doctor picks Recurring.
    setEditRecurringDates(storedVisits.length ? storedVisits : ["", ""]);
    setEditRecurringCount(storedVisits.length || 2);
    setEditVisitInvestigations(storedVisits.map(() => ""));
    setInitialized(true);
  }

  // Init service lines - wait for procedure_services to actually finish
  // loading before deciding it's empty, otherwise its [] default (while
  // still fetching) gets mistaken for "no existing services" and a
  // duplicate id-less fallback line is fabricated from the parent
  // procedure's fields, which then inserts a second identical row on save.
  if (
    procedure &&
    initialized &&
    !servicesInitialized &&
    !procedureServicesLoading &&
    !procedureServicesFetching
  ) {
    const parentTextIsRollUp = (procedure.service_name || "").includes(", ");
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
      : // A visit with no stored rows is shown what its own name says. A name
        // that is a roll-up means several services, so it becomes several
        // lines - putting the whole joined string into one line made that
        // line's name "SPOT RESURFX, SPOT RESURFX, SPOT RESURFX", which was
        // re-joined on every save and grew each time.
        (namesFromParent(procedure.service_name).length
          ? namesFromParent(procedure.service_name)
          : [""]
        ).map((name, i) => ({
          key: `svc-${Date.now()}-${i}`,
          service_id: null,
          service_name: name,
          // The parent's notes belong to a single service. Where it names
          // several, they stay on the parent - folding them into each line
          // would repeat them and re-prefix on save.
          procedure_notes: parentTextIsRollUp ? "" : procedure.procedure_notes || "",
          recommendations: parentTextIsRollUp ? "" : procedure.recommendations || "",
          material_percent: "",
          price: 0,
        }));
    setEditServiceLines(rows);
    hadStoredLinesRef.current = procedureServices.length > 0;
    // What the lines added up to when this visit was opened. The save compares
    // against it to tell "the parent is just these lines" from "the parent
    // holds something of its own".
    originalServiceLinesRef.current = rows;
    setParentHoldsOwnText(holdsOwnText(procedure.recommendations ?? null, rows, "recommendations"));
    setServicesInitialized(true);
  }

  // Keyed by the row's own key, never by its index - see ServicePicker.
  const [serviceMenuOpen, setServiceMenuOpen] = useState<Record<string, boolean>>({});

  // "Others (type manually)" is a picker sentinel, not a service. It must never
  // reach the uuid column - the typed name is what is saved, in service_name.
  // The create form applies the same rule on its own save.
  const serviceIdForSave = (id: string | null) => (id && id !== OTHERS_VALUE ? id : null);

  // Same option list as the new-prescription form, so the two screens search
  // medicines the same way.
  const medicineOptions = useMemo(
    () => [
      ...(products as { id: string; name: string }[]).map((p) => ({ id: p.id, name: p.name })),
      { id: OTHERS_VALUE, name: "Others (type manually)" },
    ],
    [products],
  );

  const updateLine = (key: string, patch: Partial<ServiceLineRow>) =>
    setEditServiceLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () =>
    setEditServiceLines((prev) => [
      ...prev,
      { key: `svc-${Date.now()}-${prev.length}`, service_id: null, service_name: "", procedure_notes: "", recommendations: "", material_percent: "", price: 0 },
    ]);
  const removeLine = (key: string) =>
    setEditServiceLines((prev) => {
      // A stored row is marked for deletion rather than dropped, so the save
      // knows to delete it; one that was never stored simply goes.
      const next = prev
        .map((l) => (l.key === key ? { ...l, _deleted: true } : l))
        .filter((l) => l.id || !l._deleted);
      // Removing the only service leaves a blank line in its place rather
      // than an empty section, so the right one can be picked straight away.
      // The removed row is still in the list, marked, and is deleted on save.
      if (!next.some((l) => !l._deleted)) {
        next.push({
          key: `svc-${Date.now()}`,
          service_id: null,
          service_name: "",
          procedure_notes: "",
          recommendations: "",
          material_percent: "",
          price: 0,
        });
      }
      return next;
    });
  const visibleLines = editServiceLines.filter((l) => !l._deleted);
  // A consultation is not a service (see consultationLine.ts), so it is not
  // listed as one - but it is where much of what the doctor wrote lives, so
  // its notes and recommendations are shown below under their own heading
  // rather than hidden with the label.
  const serviceLines = visibleLines.filter((l) => !isConsultationService(l.service_name));
  const consultationLines = visibleLines.filter((l) => isConsultationService(l.service_name));

  // Init prescriptions from fetched data
  if (prescriptions.length > 0 && initialized && editPrescriptions.length === 0) {
    setEditPrescriptions(prescriptions.map((rx: any) => ({
      id: rx.id,
      key: newRxKey(),
      // A medicine the pharmacy catalogue has no row for - most of the ones
      // imported from Salesforce - has a name but no product_id. Left as "",
      // the picker showed its placeholder and the name input stayed hidden,
      // so the row looked empty even though the name was sitting right there
      // in medicine_name (and printed correctly on the prescription).
      // "Others" is exactly this case: a name we hold as text.
      product_id: rx.product_id || (rx.medicine_name ? OTHERS_VALUE : ""),
      medicine_name: rx.medicine_name,
      dosage: rx.dosage || "",
      frequency: rx.frequency || "",
      duration: rx.duration || "",
      instructions: rx.instructions || "",
      quantity: rx.quantity || 1,
    })));
  }

  /**
   * Drop what is on screen so it is read from the database again.
   *
   * Used when the sheet closes, and after a save - where the screen now stays
   * open. Re-reading rather than leaving the typed values in place is the
   * point: the save normalises what it writes (a service named twice is one
   * service, the roll-up is rebuilt), and the doctor should be looking at what
   * was stored, not at what they typed a moment before it was tidied.
   */
  const resetEditState = () => {
    setInitialized(false);
    setServicesInitialized(false);
    setParentHoldsOwnText(false);
    setEditServiceLines([]);
    setEditPrescriptions([]);
    setAttachmentNotes("");
    setMedical({});
    setMedicalDirty(false);
  };

  const handleClose = () => {
    resetEditState();
    onClose();
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const onScreen = editServiceLines.filter((l) => !l._deleted);
      const kept = onScreen.filter((l) => (l.service_name || "").trim());
      // One service, once - on the screen, in the database and on the printed
      // prescription. A second line of a name already on the visit is a copy
      // that arrived from somewhere else, never a second treatment.
      const toWrite = dedupeByName(linesToWrite(onScreen));
      const original = originalServiceLinesRef.current;

      // Write the roll-up only where the lines account for what is stored. An
      // imported visit can hold Salesforce's Special Instructions AND service
      // lines, and a save on this screen is not permission to destroy the
      // former - which it did, silently, for any visit the treatments move gave
      // its first service lines.
      //
      // Where the parent does hold its own text it is the editable box on
      // screen, so what was typed there is what gets saved. It used to be
      // recomputed from the lines either way, which meant a textarea that
      // accepted typing and threw it away on save.
      const rolled = (field: "procedure_notes" | "recommendations", edited: string) =>
        nextRollUpValue(procedure?.[field] ?? null, original, kept, field, edited);

      // Update procedure
      const { error } = await supabase.from("procedures").update({
        // "Showed services when opened" - stored rows, or the line read off
        // the parent. Removing that line is a decision, and the name on the
        // parent has to follow it, or the next open draws the service again.
        service_name: parentServiceName(
          kept,
          hadStoredLinesRef.current ||
            originalServiceLinesRef.current.some((l) => (l.service_name || "").trim() !== ""),
          editServiceName,
        ),
        status: editStatus,
        staff_id: editStaffId && editStaffId.trim() ? editStaffId : null,
        procedure_notes: kept.length ? rolled("procedure_notes", editProcedureNotes) : editProcedureNotes,
        recommendations: kept.length ? rolled("recommendations", editRecommendations) : editRecommendations,
        review_notes: editReviewNotes,
        assisted_by: editAssistedByIds[0] || null,
        assisted_by_ids: editAssistedByIds,
        symptoms: medical.symptoms || null,
        diagnosis: medical.diagnosis || null,
        lab_tests: medical.lab_tests || null,
        // The visit plan, written the way the create form writes it so one
        // prescription cannot mean two different things depending on which
        // screen last saved it.
        visit_type: editVisitType,
        recurring_count: editVisitType === "Recurring" ? editRecurringCount : null,
        recurring_dates:
          editVisitType === "Recurring"
            ? editRecurringDates.filter(Boolean).map((d) => new Date(d).toISOString())
            : null,
      } as any).eq("id", procedureId!);
      if (error) throw error;

      // Reserve the visits that are new.
      //
      // Only the new ones: a course opened, given a fourth date and saved must
      // book the fourth, not all four again - see visitsNeedingAppointment,
      // which compares to the minute because a stored instant carries seconds
      // a picker never will.
      //
      // Measured against THIS prescription's own stored dates and nothing
      // else. Checking the patient's diary as well would have been one more
      // guard against duplicates, but it would also silently skip a visit
      // whenever the clinic already had the patient in at that minute for
      // something unrelated - and overlapping appointments are deliberately
      // allowed here, not something a save gets to quietly refuse.
      if (editVisitType === "Recurring") {
        const planned = reservedVisits(editRecurringDates, editVisitInvestigations);
        const toBook = visitsNeedingAppointment(
          planned,
          ((procedure as any).recurring_dates || []) as string[],
        );
        // A browser's min/max only discourages a bad year, it does not stop one
        // reaching here - which is how a visit came to be reserved in the year 268.
        if (toBook.some((v) => !isPlausibleIso(v.date))) {
          throw new Error("Check the visit date - that year looks wrong.");
        }
        if (toBook.length > 0 && procedure?.patient_id) {
          const rows = toBook.map(({ date: d, investigation }) => {
            const start = new Date(d);
            return {
              patient_id: procedure.patient_id,
              patient_name: patientName || null,
              staff_id: editStaffId && editStaffId.trim() ? editStaffId : null,
              service: procedure.service_name || "Follow Up",
              start_time: start.toISOString(),
              end_time: new Date(start.getTime() + 30 * 60 * 1000).toISOString(),
              status: "Reserved",
              // Blank stays blank rather than becoming an empty string: the
              // Investigation column treats empty as "nothing recorded".
              reason_for_consultation: investigation || null,
              visit_status: "Recurring visit",
              source: "Procedure",
            };
          });
          const { error: aptErr } = await supabase.from("appointments").insert(rows as any);
          if (aptErr) throw aptErr;
        }
      }

      // Sync any edits to the patient's medical information back to the patient record
      if (medicalDirty && procedure?.patient_id) {
        const { error: medErr } = await supabase
          .from("patients")
          // Only the columns this sheet shows - see ProcedureFormDialog for why
          // listing a column the form no longer has would blank it on save.
          .update({
            medical_history: medical.medical_history || null,
            current_medications: medical.current_medications || null,
            dietary_advice: medical.dietary_advice || null,
            skin_type: medical.skin_type || null,
            previous_treatments: medical.previous_treatments || null,
          })
          .eq("id", procedure.patient_id);
        if (medErr) throw medErr;
      }

      // Sync procedure_services
      for (const l of editServiceLines.filter((x) => x.id && x._deleted)) {
        await supabase.from("procedure_services").delete().eq("id", l.id!);
      }
      // What the visit actually holds right now, read fresh. A line invented
      // from the parent row carries no id, and inserting it blindly is what
      // stored the same service twice - see matchStoredRows.
      const { data: storedRows } = await supabase
        .from("procedure_services")
        .select("id, service_name")
        .eq("procedure_id", procedureId!);
      const writeTo = matchStoredRows(toWrite, (storedRows || []) as { id: string; service_name: string | null }[]);
      for (const [i, l] of toWrite.entries()) {
        const rowId = writeTo[i];
        if (rowId) {
          await supabase.from("procedure_services").update({
            service_id: serviceIdForSave(l.service_id),
            service_name: l.service_name,
            procedure_notes: l.procedure_notes || null,
            recommendations: l.recommendations || null,
            material_percent: l.material_percent.trim() === "" ? null : parseFloat(l.material_percent),
            sort_order: i,
          }).eq("id", rowId);
        } else {
          const { error: insErr } = await supabase.from("procedure_services").insert({
            procedure_id: procedureId!,
            service_id: serviceIdForSave(l.service_id),
            service_name: l.service_name,
            procedure_notes: l.procedure_notes || null,
            recommendations: l.recommendations || null,
            material_percent: l.material_percent.trim() === "" ? null : parseFloat(l.material_percent),
            sort_order: i,
          });
          // The database keeps a visit to one of each service. If a copy gets
          // this far anyway - two saves racing, a page that has been open a
          // while - say so in words rather than showing a constraint name.
          if (insErr) {
            if (insErr.code === "23505") {
              throw new Error(`${l.service_name} is already on this visit.`);
            }
            throw insErr;
          }
        }
      }


      // Handle prescriptions: delete removed, update existing, insert new
      //
      // Every id is checked against the catalogue first. One that is no longer
      // in it is dropped and the medicine kept by name, because sending it
      // rejects the whole write on prescriptions_product_id_fkey - see
      // prescriptionProducts.ts.
      const catalogue = knownProductIds(products as { id: string }[]);
      const droppedMedicines = editPrescriptions
        .filter(rx => !rx._deleted && losesCatalogueLink(rx.product_id, catalogue))
        .map(rx => rx.medicine_name);
      const existing = editPrescriptions.filter(rx => rx.id && !rx._deleted);
      const deleted = editPrescriptions.filter(rx => rx.id && rx._deleted);
      const newRx = editPrescriptions.filter(rx => !rx.id && !rx._deleted && (rx.medicine_name || (rx.product_id && rx.product_id !== OTHERS_VALUE)));

      for (const rx of deleted) {
        await supabase.from("prescriptions").delete().eq("id", rx.id!);
      }
      for (const rx of existing) {
        await supabase.from("prescriptions").update({
          product_id: productIdForSave(rx.product_id, catalogue),
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
          product_id: productIdForSave(rx.product_id, catalogue),
          medicine_name: rx.medicine_name,
          dosage: rx.dosage,
          frequency: rx.frequency,
          duration: rx.duration,
          instructions: rx.instructions,
          quantity: rx.quantity,
        })));
      }
      const droppedNotice = droppedMedicineNotice(droppedMedicines);
      if (droppedNotice) toast.warning(droppedNotice);
    },
    onSuccess: async () => {
      const savedId = procedureId!;
      // Saving used to close the sheet, which dropped the doctor back on the
      // list - so checking what had just been written meant finding the row
      // and opening it again. The visit stays open; only its contents are
      // re-read. The refetches must finish BEFORE resetEditState(): the
      // render-time initialisers fire on whatever is cached, and resetting
      // while the pre-save data is still cached refills the screen with the
      // old values - a second save then writes those stale values back.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["procedures"] }),
        queryClient.invalidateQueries({ queryKey: ["procedure-detail", procedureId] }),
        // Without this the next open reads a list fetched before these rows
        // existed, decides the visit has no services, and invents them again.
        queryClient.invalidateQueries({ queryKey: ["procedure-services", procedureId] }),
        queryClient.invalidateQueries({ queryKey: ["procedure-prescriptions", procedureId] }),
        queryClient.invalidateQueries({ queryKey: ["appointment-procedures"] }),
        queryClient.invalidateQueries({ queryKey: ["patient", procedure?.patient_id] }),
        queryClient.invalidateQueries({ queryKey: ["procedure-detail-patient", procedure?.patient_id] }),
        // A visit added to the course reserves an appointment, so both the
        // Follow-up appointments list on this screen and the Appointments page
        // have to be re-read - otherwise the visit just booked is invisible
        // until a reload, which reads as the save not having worked.
        queryClient.invalidateQueries({ queryKey: ["procedure-followup-appointments", procedure?.patient_id] }),
        queryClient.invalidateQueries({ queryKey: ["appointments"] }),
      ]);
      resetEditState();
      toast.success("Prescription saved");
      onSaved?.(savedId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * The follow-up visits this prescription booked.
   *
   * The prescription form creates them - "Next Appointment Date", or one per
   * recurring visit - as ordinary Reserved appointments. Coming back to edit the
   * prescription a doctor could change everything on it except those dates, and
   * there was nowhere on this screen to change them: the only way was to leave,
   * find the appointment on the Appointments page, and edit it there.
   *
   * Upcoming and not cancelled, so nothing that has already happened can be
   * moved from here - that is the one case the Appointments page deliberately
   * asks about before allowing (see appointmentReschedule.ts), and this screen
   * has no business doing it quietly.
   */
  // The visits listed below are booked and moved at the front desk while the
  // doctor is writing the prescription that reserved them. See
  // APPOINTMENT_QUERY_KEYS: this key was never reached by live updates.
  useLiveAppointments();

  const { data: upcomingAppointments = [] } = useQuery({
    queryKey: ["procedure-followup-appointments", procedure?.patient_id],
    enabled: !!procedure?.patient_id,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, service, start_time, end_time, status, visit_status, reason_for_consultation")
        .eq("patient_id", procedure!.patient_id!)
        .gt("start_time", new Date().toISOString())
        .neq("status", "Cancelled")
        .order("start_time");
      if (error) throw error;
      return data || [];
    },
  });

  const [followUpEdits, setFollowUpEdits] = useState<Record<string, string>>({});
  // What each booked visit is for. Editable here for the same reason the date
  // is: the only other way to correct it was to leave, find the appointment on
  // the Appointments page and edit it there.
  const [followUpReasons, setFollowUpReasons] = useState<Record<string, string>>({});

  const saveFollowUpReason = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      // Blank is stored as null, not "": the Investigation column treats an
      // empty value as nothing recorded, and on a visit this app booked that
      // now shows as blank rather than falling through to the service.
      const { data: written, error } = await supabase
        .from("appointments")
        .update({ reason_for_consultation: reason.trim() || null })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      assertWrote(written);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedure-followup-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Investigation updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * Remove a visit this prescription booked.
   *
   * To the trash rather than deleted outright, like every other record on this
   * screen - a visit removed by mistake is one the patient still turns up for.
   */
  const removeFollowUp = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      await moveToTrash("appointments", id, label);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedure-followup-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Visit removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveFollowUp = useMutation({
    mutationFn: async ({ id, when }: { id: string; when: string }) => {
      const appointment = upcomingAppointments.find((a) => a.id === id);
      const start = new Date(when);
      if (Number.isNaN(start.getTime())) throw new Error("Pick a date and time");
      // The visit keeps the length it was booked with.
      const originalStart = appointment?.start_time ? new Date(appointment.start_time) : null;
      const originalEnd = appointment?.end_time ? new Date(appointment.end_time) : null;
      const durationMs =
        originalStart && originalEnd ? originalEnd.getTime() - originalStart.getTime() : 30 * 60 * 1000;
      const { data: written, error } = await supabase
        .from("appointments")
        .update({ start_time: start.toISOString(), end_time: new Date(start.getTime() + durationMs).toISOString() })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      assertWrote(written);
    },
    onSuccess: (_data, { id }) => {
      setFollowUpEdits((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["procedure-followup-appointments", procedure?.patient_id] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Follow-up appointment moved");
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
    setEditPrescriptions((prev) => [...prev, { key: newRxKey(), product_id: "", medicine_name: "", dosage: "", frequency: "", duration: "", instructions: "", quantity: 1 }]);
  };

  // `[...editPrescriptions]` copies the array but not the rows in it, so
  // assigning to updated[index].field wrote into the object React was
  // already holding: the change never registered until some later keystroke
  // forced a render. Replace the row instead, and find it by key.
  const updateRx = (key: string, field: string, value: any) => {
    setEditPrescriptions((prev) =>
      prev.map((rx) => {
        if (rx.key !== key) return rx;
        if (field !== "product_id") return { ...rx, [field]: value };
        if (value === OTHERS_VALUE) return { ...rx, product_id: OTHERS_VALUE, medicine_name: "" };
        const prod = products.find((p) => p.id === value);
        const previous = products.find((p) => p.id === rx.product_id);
        // Same rule as the new-prescription form: the pharmacy's defaults fill
        // the row, and what the doctor typed stays.
        return { ...rx, product_id: value, medicine_name: prod?.name || "", ...applyMedicineDefaults(rx, prod, previous) };
      }),
    );
  };

  const removeRx = (key: string) => {
    setEditPrescriptions((prev) =>
      prev
        // A saved row is marked deleted so the save can remove it from the
        // database; an unsaved one just goes.
        .map((rx) => (rx.key === key && rx.id ? { ...rx, _deleted: true } : rx))
        .filter((rx) => rx.key !== key || rx.id),
    );
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
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground">Loading...</div>
          ) : !procedure ? (
            <div className="p-8 text-center text-muted-foreground">
              <p className="font-medium text-foreground">This procedure is not available</p>
              <p className="text-sm mt-1">It may have been deleted, or it belongs to another doctor.</p>
            </div>
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
                    {/* The name opens the patient's file, the way it does on
                        an appointment: from a prescription the front desk
                        would otherwise have to go back to Patients and
                        search for someone whose record is right here. */}
                    <SheetTitle className="font-display text-lg flex items-center gap-2">
                      {procedure.patient_id ? (
                        <>
                          <button
                            type="button"
                            className="text-left underline-offset-2 transition-colors hover:text-primary hover:underline"
                            onClick={() => navigate(`/patients/${procedure.patient_id}`)}
                          >
                            {patientName}
                          </button>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        </>
                      ) : (
                        patientName
                      )}
                    </SheetTitle>
                    {/* Same line as the new-prescription form, from the same
                        function, so the two screens cannot disagree. */}
                    {patientIdentityLine(procedure?.patients) && (
                      <p className="text-xs text-muted-foreground">{patientIdentityLine(procedure?.patients)}</p>
                    )}
                    <p className="text-sm text-muted-foreground mt-1">
                      {procedureDateLabel(procedure, "EEE, dd/MM/yyyy · h:mm a")}
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
                {/* The visit plan. Editable here because it could not be
                    changed at all once the prescription was saved: a single
                    visit could never become a course, and a course could not
                    have a visit added to it. Adding a date reserves the
                    appointment on save; taking one off never cancels what is
                    already booked - that is the Appointments page's decision
                    to ask about, not a prescription save's to make quietly. */}
                <div className="rounded-xl border-2 border-primary/25 bg-primary/5 p-3 shadow-sm space-y-3">
                  <div className="flex items-center gap-2">
                    <Repeat className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-primary">Visit Type</span>
                    {editVisitType === "Recurring" && (
                      <Badge variant="outline" className="text-[10px]">
                        {editRecurringDates.filter(Boolean).length} dated
                      </Badge>
                    )}
                  </div>

                  <RadioGroup
                    value={editVisitType}
                    onValueChange={(v) => setEditVisitType(v as "Single" | "Recurring")}
                    className="flex gap-6"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="Single" id="edit-visit-single" />
                      <Label htmlFor="edit-visit-single" className="font-normal cursor-pointer">Single visit</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="Recurring" id="edit-visit-recurring" />
                      <Label htmlFor="edit-visit-recurring" className="font-normal cursor-pointer">Recurring visit</Label>
                    </div>
                  </RadioGroup>

                  {editVisitType === "Recurring" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {editRecurringDates.map((value, i) => {
                          const { date: visitDate, time: visitTime } = splitVisitDateTime(value);
                          const setVisit = (date: string, time: string) => {
                            const next = [...editRecurringDates];
                            next[i] = joinVisitDateTime(date, time);
                            setEditRecurringDates(next);
                          };
                          const hasSomething = Boolean(visitDate || (editVisitInvestigations[i] || "").trim());
                          return (
                            <div key={i} className="rounded-lg border bg-background/60 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <Label className="text-xs text-muted-foreground">Visit # {i + 1}</Label>
                                <div className="flex items-center gap-1">
                                  {hasSomething && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-[11px]"
                                      onClick={() => {
                                        const next = clearVisitAt(
                                          { dates: editRecurringDates, investigations: editVisitInvestigations },
                                          i,
                                        );
                                        setEditRecurringDates(next.dates);
                                        setEditVisitInvestigations(next.investigations);
                                      }}
                                    >
                                      Clear
                                    </Button>
                                  )}
                                  {editRecurringDates.length > 1 && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                      title="Remove this visit"
                                      aria-label={`Remove visit ${i + 1}`}
                                      onClick={() => {
                                        // Both lists spliced together, or the
                                        // visit below inherits this one's
                                        // investigation.
                                        const next = removeVisitAt(
                                          { dates: editRecurringDates, investigations: editVisitInvestigations },
                                          i,
                                        );
                                        setEditRecurringDates(next.dates);
                                        setEditVisitInvestigations(next.investigations);
                                        setEditRecurringCount(next.dates.length);
                                      }}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <DateInput value={visitDate} onChange={(iso) => setVisit(iso, visitTime)} withCalendar className="w-[150px]" />
                                <TimePicker12h value={visitTime} onChange={(next) => setVisit(visitDate, next)} compact />
                              </div>
                              <Input
                                value={editVisitInvestigations[i] || ""}
                                onChange={(e) => {
                                  const next = [...editVisitInvestigations];
                                  while (next.length < editRecurringDates.length) next.push("");
                                  next[i] = e.target.value;
                                  setEditVisitInvestigations(next);
                                }}
                                placeholder="Investigation for this visit (optional)"
                                className="mt-2 h-8 text-xs bg-background"
                              />
                            </div>
                          );
                        })}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => {
                          setEditRecurringDates((prev) => [...prev, ""]);
                          setEditVisitInvestigations((prev) => [...prev, ""]);
                          setEditRecurringCount((c) => c + 1);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add visit
                      </Button>
                      <p className="text-[11px] text-muted-foreground">
                        Saving reserves an appointment for each new date. Dates already booked are
                        left alone — change or cancel those under Follow-up appointments below.
                      </p>
                    </div>
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
                  {serviceLines.map((line, i) => (
                    <div key={line.key} className="rounded-lg border bg-background p-3 space-y-2 shadow-sm transition-shadow hover:shadow-md">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Service {i + 1}</span>
                        {/* Offered on the first service too, as on the
                            prescription form: a service entered by mistake
                            should not have to be typed over. */}
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => removeLine(line.key)}>
                          Remove
                        </Button>
                      </div>
                      <ServicePicker
                        services={servicesMaster as ServiceOption[]}
                        serviceId={line.service_id}
                        serviceName={line.service_name}
                        open={!!serviceMenuOpen[line.key]}
                        onOpenChange={(open) => setServiceMenuOpen((m) => ({ ...m, [line.key]: open }))}
                        onPickMaster={(v) => {
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
                        onChooseOthers={() => updateLine(line.key, { service_id: OTHERS_VALUE, service_name: "" })}
                        onNameChange={(service_name) => updateLine(line.key, { service_name })}
                      />
                      {/* Material Cost % removed here too, so the create form and
                          this sheet agree. It lives in Billing now - see
                          ProcedureFormDialog for the reasoning. Existing values
                          are untouched and still feed the report. */}
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
                        <Textarea value={line.procedure_notes} onChange={(e) => updateLine(line.key, { procedure_notes: capitaliseFirstWord(e.target.value, e.target.selectionStart) })} className="mt-1" rows={3} />
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
                        <Textarea value={line.recommendations} onChange={(e) => updateLine(line.key, { recommendations: capitaliseFirstWord(e.target.value, e.target.selectionStart) })} className="mt-1" rows={3} />
                      </div>
                      {procedure.patient_id && line.service_id && line.service_id !== OTHERS_VALUE && <ClinicalGuidelines patientId={procedure.patient_id} serviceIds={[line.service_id]} onCopyCare={(text) => updateLine(line.key, { recommendations: appendCare(line.recommendations, text) })} />}
                    </div>
                  ))}
                  {/* Repeated at the foot of the list: with several services
                      filled in, the button in the card header is a screenful
                      away and adding another meant scrolling up and back. */}
                  {serviceLines.length > 0 && (
                    <Button type="button" variant="outline" size="sm" className="w-full border-dashed" onClick={addLine}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add another service
                    </Button>
                  )}
                </div>

                {/* What was written against the consultation. Same fields, same
                    editing, same saving - only the "Service" framing is gone,
                    because the clinic does not count a consultation as one. */}
                {consultationLines.length > 0 && (
                  <div className="rounded-xl border-2 border-primary/25 bg-primary/5 p-4 space-y-3 shadow-sm">
                    <Label className="text-base font-display font-semibold text-primary">Visit Notes</Label>
                    {consultationLines.map((line) => (
                      <div key={line.key} className="rounded-lg border bg-background p-3 space-y-2 shadow-sm">
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
                          <Textarea value={line.procedure_notes} onChange={(e) => updateLine(line.key, { procedure_notes: capitaliseFirstWord(e.target.value, e.target.selectionStart) })} className="mt-1" rows={3} />
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
                          <Textarea value={line.recommendations} onChange={(e) => updateLine(line.key, { recommendations: capitaliseFirstWord(e.target.value, e.target.selectionStart) })} className="mt-1" rows={3} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}


                {/* Prescriptions - editable */}
                <div className="rounded-xl border-2 border-primary/25 bg-primary/5 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-base font-display font-semibold flex items-center gap-2">
                      <Pill className="h-4 w-4" /> Products/Medications
                    </Label>
                    <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addPrescription}>
                      <Plus className="h-3 w-3" /> Add Medicine
                    </Button>
                  </div>
                  {visibleRx.length > 0 ? visibleRx.map((rx, idx) => {
                    return (
                      <div key={rx.key} className="border rounded-lg p-3 mb-3 space-y-2 bg-background shadow-sm transition-shadow hover:shadow-md">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">Medicine {idx + 1}</span>
                          <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => removeRx(rx.key)}>Remove</Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">Medicine *</Label>
                            <SearchableSelect
                              className="mt-1"
                              value={rx.product_id}
                              onChange={(v) => updateRx(rx.key, "product_id", v)}
                              options={medicineOptions}
                              placeholder="Select medicine"
                              searchPlaceholder="Search medicine..."
                              emptyText="No medicine found."
                            />
                            {rx.product_id === OTHERS_VALUE && (
                              <Input
                                className="mt-1"
                                placeholder="Medicine name"
                                value={rx.medicine_name}
                                onChange={(e) => updateRx(rx.key, "medicine_name", e.target.value)}
                              />
                            )}
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground flex items-center justify-between">Dosage <MicButton value={rx.dosage} onChange={(v) => updateRx(rx.key, "dosage", v)} mode="replace" /></Label>
                            <Input className="mt-1" placeholder="e.g. 500mg" value={rx.dosage} onChange={(e) => updateRx(rx.key, "dosage", e.target.value)} />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground flex items-center justify-between">Frequency <MicButton value={rx.frequency} onChange={(v) => updateRx(rx.key, "frequency", v)} mode="replace" /></Label>
                            <Input className="mt-1" placeholder="e.g. Twice daily" value={rx.frequency} onChange={(e) => updateRx(rx.key, "frequency", e.target.value)} />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground flex items-center justify-between">Duration <MicButton value={rx.duration} onChange={(v) => updateRx(rx.key, "duration", v)} mode="replace" /></Label>
                            <Input className="mt-1" placeholder="e.g. 7 days" value={rx.duration} onChange={(e) => updateRx(rx.key, "duration", e.target.value)} />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Quantity</Label>
                            <Input className="mt-1" type="number" placeholder="1" value={numVal(rx.quantity)} onChange={(e) => updateRx(rx.key, "quantity", parseInt(e.target.value) || 1)} />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground flex items-center justify-between">Special Instructions <MicButton value={numVal(rx.instructions)} onChange={(v) => updateRx(rx.key, "instructions", v)} /></Label>
                          <Input className="mt-1" placeholder="e.g. After meals" value={rx.instructions} onChange={(e) => updateRx(rx.key, "instructions", e.target.value)} />
                        </div>
                      </div>
                    );
                  }) : (procedure as any)?.sf_id && importedPrescription.length ? (
                    /* The products a doctor prescribed in Salesforce arrive as the
                       free text they typed - 25,346 visits carry them this way -
                       while this panel reads the structured prescriptions table,
                       which holds 31 rows in the whole database. So every imported
                       visit read "Nothing added yet" with the prescription sitting
                       one field away.

                       Listed as rows, matching the Product/Instruction table on the
                       printed prescription, so the screen and the document agree.
                       parsePrescriptionText picks its separator per entry and never
                       drops text - see its own notes for why a single rule would
                       print "1-0-0" as a product on 82 real visits. */
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                        Prescribed on this visit
                      </p>
                      <ol className="space-y-2">
                        {importedPrescription.map((item, i) => (
                          <li key={i} className="flex gap-2 text-sm">
                            <span className="text-muted-foreground tabular-nums shrink-0">{i + 1}.</span>
                            <span className="min-w-0">
                              <span className="whitespace-pre-wrap leading-relaxed">{item.product}</span>
                              {item.instruction && (
                                <span className="block text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">
                                  {item.instruction}
                                </span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ol>
                      <p className="text-[11px] text-muted-foreground mt-2">
                        As recorded at the visit. Use "Add Medicine" to add a product from the catalogue.
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">Nothing added yet. Click "Add Medicine" to add a product or medication.</p>
                  )}
                  {visibleRx.length > 0 && (
                    <Button type="button" variant="outline" size="sm" className="w-full border-dashed mt-1" onClick={addPrescription}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add another medicine
                    </Button>
                  )}
                </div>

                {/* Special Instructions
                    Salesforce's Special_Instructions__c, on 17,581 visits. It was
                    read, saved and printed into a column of the procedure table,
                    but never shown on this screen at all.

                    Shown only when it holds something the service lines do not.
                    The check used to compare a raw line ("1v2") against the
                    prefixed roll-up ("FILLERS: 1v2"), so on any visit with two
                    services it never matched and the doctor was shown her own
                    recommendation twice, the second time under a name she had
                    not typed it into. */}
                {parentHoldsOwnText && (
                  <div className="rounded-xl border bg-card p-4 shadow-sm">
                    <Label className="text-base font-display font-semibold flex items-center gap-2 mb-3">
                      <ClipboardList className="h-4 w-4" /> Special Instructions
                    </Label>
                    <Textarea
                      className="min-h-[80px]"
                      value={editRecommendations}
                      onChange={(e) => setEditRecommendations(e.target.value)}
                      placeholder="Instructions for this visit"
                    />
                  </div>
                )}

                {/* Follow-up appointments booked by this prescription */}
                {upcomingAppointments.length > 0 && (
                  <div className="rounded-xl border bg-card p-4 shadow-sm">
                    <Label className="text-base font-display font-semibold flex items-center gap-2 mb-1">
                      <CalendarClock className="h-4 w-4" /> Follow-up appointments
                    </Label>
                    <p className="text-xs text-muted-foreground mb-3">
                      The visits booked from this prescription. Change the date, say what the visit is for, or
                      remove it - without hunting for it on the Appointments page.
                    </p>
                    <div className="space-y-3">
                      {upcomingAppointments.map((apt) => {
                        const current = format(new Date(apt.start_time), "yyyy-MM-dd'T'HH:mm");
                        const edited = followUpEdits[apt.id] ?? current;
                        const changed = edited !== current;
                        const { date: aptDate, time: aptTime } = splitVisitDateTime(edited);
                        const setWhen = (date: string, time: string) =>
                          setFollowUpEdits((prev) => ({ ...prev, [apt.id]: joinVisitDateTime(date, time) }));
                        const storedReason = (apt as any).reason_for_consultation ?? "";
                        const reason = followUpReasons[apt.id] ?? storedReason;
                        const reasonChanged = reason.trim() !== String(storedReason ?? "").trim();
                        return (
                          <div key={apt.id} className="rounded-lg border bg-background/60 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs text-muted-foreground">
                                {apt.service || "Follow-up"}
                                {apt.visit_status ? ` · ${apt.visit_status}` : ""}
                              </Label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                title="Remove this visit"
                                aria-label="Remove this visit"
                                disabled={removeFollowUp.isPending}
                                onClick={() => removeFollowUp.mutate({
                                  id: apt.id,
                                  label: `${apt.service || "Follow-up"} · ${format(new Date(apt.start_time), "dd/MM/yyyy")}`,
                                })}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            {/* A date box and a 12-hour clock, as the
                                Appointments page books with - datetime-local
                                renders in whatever the browser's locale picks,
                                which is 24-hour here. */}
                            <div className="flex flex-wrap items-center gap-2">
                              <DateInput value={aptDate} onChange={(iso) => setWhen(iso, aptTime)} withCalendar className="w-[150px]" />
                              <TimePicker12h value={aptTime} onChange={(next) => setWhen(aptDate, next)} compact />
                              <Button
                                type="button"
                                size="sm"
                                variant={changed ? "default" : "outline"}
                                disabled={!changed || moveFollowUp.isPending}
                                onClick={() => moveFollowUp.mutate({ id: apt.id, when: edited })}
                              >
                                {moveFollowUp.isPending ? "Saving…" : "Save date"}
                              </Button>
                            </div>
                            <div>
                              <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Stethoscope className="h-3.5 w-3.5" /> Investigation
                              </Label>
                              <div className="mt-1 flex items-start gap-2">
                                <Textarea
                                  value={reason}
                                  onChange={(e) => setFollowUpReasons((prev) => ({ ...prev, [apt.id]: e.target.value }))}
                                  placeholder="What this visit is for — left blank, it stays blank"
                                  rows={2}
                                  className="bg-background"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={reasonChanged ? "default" : "outline"}
                                  disabled={!reasonChanged || saveFollowUpReason.isPending}
                                  onClick={() => saveFollowUpReason.mutate({ id: apt.id, reason })}
                                >
                                  {saveFollowUpReason.isPending ? "Saving…" : "Save"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

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
                      {photos.map((photo) => (
                        <a key={photo.id} href={photo.photo_url} target="_blank" rel="noopener noreferrer" className="relative group">
                          <img src={photo.photo_url} alt="" loading="lazy" className="w-full h-24 object-cover rounded-lg border" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {otherPhotos.length > 0 ? "No photos from this visit." : "No photos yet."}
                    </p>
                  )}
                  {otherPhotos.length > 0 && (
                    <div className="mt-4 border-t pt-3">
                      <button
                        type="button"
                        onClick={() => setShowOtherPhotos((v) => !v)}
                        className="text-sm text-primary hover:underline"
                      >
                        {showOtherPhotos ? "Hide" : "Show"} {otherPhotos.length} photo{otherPhotos.length === 1 ? "" : "s"} from this patient&apos;s other visits
                      </button>
                      {showOtherPhotos && (
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          {otherPhotos.map((photo) => (
                            <a key={photo.id} href={photo.photo_url} target="_blank" rel="noopener noreferrer" className="relative group">
                              <img src={photo.photo_url} alt="" loading="lazy" className="w-full h-24 object-cover rounded-lg border" />
                              <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] text-center py-0.5 rounded-b-lg">
                                {photo.taken_at ? format(new Date(photo.taken_at), "dd/MM/yyyy") : "No date"}
                              </span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
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
                      {attachments.map((att) => (
                        <div key={att.id} className="flex items-center gap-2 bg-muted/50 rounded-md p-2">
                          <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline truncate block">
                              {att.file_name}
                            </a>
                            {att.notes && <p className="text-xs text-muted-foreground">{att.notes}</p>}
                            <p className="text-[10px] text-muted-foreground">
                              {att.procedure_id
                                ? "Linked to this prescription"
                                : att.appointment_id
                                  ? "Linked to the appointment"
                                  : att.created_at
                                    ? `Imported \u2014 ${format(new Date(att.created_at), "dd/MM/yyyy")}`
                                    : "Imported"}
                            </p>
                          </div>
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => deleteAttachment(att.id)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      {otherAttachments.length > 0 ? "No attachments from this visit." : "No attachments yet."}
                    </p>
                  )}
                  {otherAttachments.length > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <button
                        type="button"
                        onClick={() => setShowOtherAttachments((v) => !v)}
                        className="text-sm text-primary hover:underline"
                      >
                        {showOtherAttachments ? "Hide" : "Show"} {otherAttachments.length} document{otherAttachments.length === 1 ? "" : "s"} from this patient&apos;s other visits
                      </button>
                      {showOtherAttachments && (
                        <div className="space-y-2 mt-3">
                          {otherAttachments.map((att) => (
                            <div key={att.id} className="flex items-center gap-2 bg-muted/30 rounded-md p-2">
                              <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0">
                                <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline truncate block">
                                  {att.file_name}
                                </a>
                                <p className="text-[10px] text-muted-foreground">
                                  {att.created_at ? format(new Date(att.created_at), "dd/MM/yyyy") : "No date"}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* The doctor's notes print on the prescription, so they are
                    shown here too - not only behind the Notes tab. */}
                {procedure?.id && (
                  <div className="rounded-xl border bg-card p-4 space-y-2">
                    <h3 className="font-semibold flex items-center gap-2">
                      <StickyNote className="h-4 w-4" /> Notes
                    </h3>
                    <StickyNotes key={`inline-${procedure.id}`} procedureId={procedure.id} />
                  </div>
                )}

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
                          {MEDICAL_FIELDS.map(([field, label]) => (
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
                                  // Capitalised as typed, past the terms the
                                  // clinic writes in lower case - the same
                                  // rule as the prescription form.
                                  onChange={(e) => { setMedical((m) => ({ ...m, [field]: capitaliseFirstWord(e.target.value, e.target.selectionStart) })); setMedicalDirty(true); }}
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
                    {procedure?.id && <StickyNotes key={procedure.id} procedureId={procedure.id} />}
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <PdfPreviewDialog
        open={prescriptionPdf.open}
        onClose={prescriptionPdf.close}
        title="Prescription preview"
        preparing="Preparing the prescription…"
        pages={prescriptionPdf.pages}
        error={prescriptionPdf.error}
        onRetry={handlePreviewPrescription}
        onDownload={handleDownloadPrescription}
        downloading={downloadingPdf}
      />

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
