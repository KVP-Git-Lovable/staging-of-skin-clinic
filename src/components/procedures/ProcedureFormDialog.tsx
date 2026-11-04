import { useState, useEffect, useRef, useMemo } from "react";
import { MAX_DATETIME, MIN_DATETIME, displayDate, isPlausibleIso } from "@/lib/dateInput";
import { dedupeByName } from "@/lib/serviceLineSave";
import { reservedVisits } from "@/lib/reservedVisits";
import { clearVisitAt, joinVisitDateTime, removeVisitAt, splitVisitDateTime } from "@/lib/recurringVisits";
import { DateInput } from "@/components/shared/DateInput";
import { TimePicker12h } from "@/components/shared/TimePicker12h";
import { capitaliseFirstWord } from "@/lib/sentenceCase";
import { numVal } from "@/lib/numberInput";
import { Plus, Pill, Wrench, Check, Sparkles, Loader2, Mic, MicOff, ChevronsUpDown, HeartPulse, ClipboardCheck, CalendarClock, Repeat, StickyNote, Stethoscope, Trash2, BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SurveyHistoryPanel } from "@/components/surveys/SurveyHistoryPanel";
import { StickyNotes, type DraftNote } from "@/components/shared/StickyNotes";
import { ClipboardList } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { PatientToolsBar } from "@/components/shared/PatientToolsBar";
import { StaffCombobox } from "@/components/shared/StaffCombobox";
import { StaffMultiCombobox } from "@/components/shared/StaffMultiCombobox";
import { PatientCombobox } from "@/components/patients/PatientCombobox";
import { fetchAll } from "@/lib/supabasePaginate";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { MicButton } from "@/components/shared/MicButton";
import { OTHERS_VALUE } from "@/lib/othersOption";
import { droppedMedicineNotice, knownProductIds, losesCatalogueLink, productIdForSave } from "@/lib/prescriptionProducts";
import { APPOINTMENT_REMOVED_NOTICE, appointmentDayMismatch, appointmentLinkForSave } from "@/lib/procedureAppointment";
import { applyMedicineDefaults } from "@/lib/medicineDefaults";
import { usePharmaLookup } from "@/hooks/usePharmaLookup";
import { ServicePicker } from "@/components/procedures/ServicePicker";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { type ServiceOption } from "@/lib/servicePicker";
import { blankServiceLine } from "@/lib/procedureFormSeed";
import { patientIdentityLine } from "@/lib/patientIdentity";
import { ClinicalGuidelines } from "@/components/knowledge/ClinicalGuidelines";
import { appendCare } from "@/lib/knowledge";

import {
  MEDICAL_FIELDS,
  ELABORATABLE_MEDICAL_FIELDS,
  SKIN_TYPE_OPTIONS,
} from "@/lib/medicalFields";

interface PrescriptionInput {
  /**
   * Identity of this row, stable for as long as it exists.
   *
   * These rows were keyed by their array index. Removing the second of four
   * medicines then left React re-using the same component instances for what
   * was now different data - the Radix Selects kept the state of the row that
   * had been in that position, so Remove looked as though it had deleted the
   * wrong medicine or done nothing at all, and the section re-rendered on its
   * own as the values shuffled up. A key that belongs to the row rather than
   * its position is what makes a removal remove that row.
   */
  key: string;
  product_id: string;
  medicine_name: string;
  frequency: string;
  duration: string;
  instructions: string;
  quantity: number;
}

let rxSeq = 0;
const newRxKey = () => `rx-${Date.now()}-${rxSeq++}`;
let assetSeq = 0;
const newAssetKey = () => `asset-${Date.now()}-${assetSeq++}`;

interface StockInfo {
  available: number;
  loading: boolean;
}

interface AssetInput {
  /** Same reason as PrescriptionInput.key - this list also removes rows. */
  key: string;
  asset_id: string;
  asset_name: string;
  usage_guideline: string;
  time_taken: string;
}

interface ServiceLine {
  key: string;
  service_id: string;
  name: string;
  procedure_notes: string;
  recommendations: string;
  material_percent: string;
  price: number;
}


interface ProcedureFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPatientId?: string;
  defaultAppointmentId?: string;
  defaultStaffId?: string | null;
  // No defaultServiceName / defaultInvestigation: see procedureFormSeed.ts.
  // The form takes no service from anybody, and leaving the props off is what
  // stops the next caller offering one.
  defaultProblemAreaIds?: string[];
  /** Render inline (full page) instead of inside a modal dialog */
  asPage?: boolean;
  onSaved?: (procedureId: string) => void;
}

/**
 * A new prescription opens blank, every time.
 *
 * The form holds everything the doctor types in component state, and on the
 * patient's own page this dialog was mounted whether it was open or not - so
 * closing it and starting the next prescription found the last one's Symptoms,
 * Diagnosis and Lab Tests still in the boxes. Only sometimes, which is what
 * made it hard to place: the Procedures page and the appointment sheet already
 * mount it only while it is open, and the medical fields that live on the
 * patient are re-read whenever the patient changes - so it needed the same
 * patient twice in a row, from their own page, to show.
 *
 * Unmounting it when it closes is what resets it, rather than a list of
 * setters that the next field added to this form would quietly fall off the
 * end of. Every caller gets this, including ones not written yet.
 *
 * asPage is the full-page route, which is mounted only when navigated to and
 * is never passed open={false}.
 */
export function ProcedureFormDialog(props: ProcedureFormDialogProps) {
  if (!props.open && !props.asPage) return null;
  return <ProcedureForm {...props} />;
}

function ProcedureForm({
  open, onOpenChange,
  defaultPatientId, defaultAppointmentId, defaultStaffId, defaultProblemAreaIds,
  asPage = false, onSaved,
}: ProcedureFormDialogProps) {
  const queryClient = useQueryClient();
  const [patientId, setPatientId] = useState(defaultPatientId || "");
  const [staffId, setStaffId] = useState(defaultStaffId || "");
  const [assistedByIds, setAssistedByIds] = useState<string[]>([]);
  const [selectedProblemAreas, setSelectedProblemAreas] = useState<string[]>(defaultProblemAreaIds || []);
  const [medical, setMedical] = useState<Record<string, string>>({});
  const [medicalDirty, setMedicalDirty] = useState(false);
  const [appointmentId] = useState(defaultAppointmentId || "");

  /**
   * The visit this will be filed under.
   *
   * The form carried an appointment id and never showed it, so a prescription
   * started from an out-of-date row on the Appointments list was filed on an
   * out-of-date visit with nothing to give it away - 13 times in the last 90
   * days, each time passing over an appointment the patient had that same day.
   * Now it is named on screen before a word is written.
   */
  const { data: linkedAppointment } = useQuery({
    queryKey: ["procedure-form-appointment", defaultAppointmentId],
    enabled: !!defaultAppointmentId,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, start_time, service")
        .eq("id", defaultAppointmentId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const visitDay = appointmentDayMismatch(linkedAppointment?.start_time, new Date());

  // One empty line, whatever the visit was booked as. See procedureFormSeed.ts.
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([blankServiceLine()]);

  const [nextAppointmentAt, setNextAppointmentAt] = useState("");
  const [visitType, setVisitType] = useState<"Single" | "Recurring">("Single");
  const [recurringCount, setRecurringCount] = useState(2);
  const [recurringDates, setRecurringDates] = useState<string[]>(["", ""]);
  /**
   * What the reserved visits are for, in the doctor's own words.
   *
   * A reserved appointment used to be created with no investigation at all -
   * 56 of the 60 recurring visits in the clinic have none. The Investigation
   * column falls back to the appointment's service when it is empty
   * (investigationText.ts), and the service is copied from the procedure just
   * written, so the next visit showed the last visit's treatment as its
   * investigation. Typed here it wins over that fallback, because a recorded
   * answer beats a guess.
   */
  // One investigation per reserved visit, indexed like recurringDates. A
  // course's visits are not the same investigation - the second session and
  // the review that follows it read differently on the appointment, in the
  // Investigation column and in the patient's reminder.
  const [followUpInvestigations, setFollowUpInvestigations] = useState<string[]>(["", ""]);
  const setInvestigationAt = (index: number, text: string) =>
    setFollowUpInvestigations((prev) => {
      const next = [...prev];
      while (next.length <= index) next.push("");
      next[index] = text;
      return next;
    });
  const [prescriptions, setPrescriptions] = useState<PrescriptionInput[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, StockInfo>>({});
  const [procedureAssets, setProcedureAssets] = useState<AssetInput[]>([]);
  // Notes typed before the procedure exists. procedure_sticky_notes.procedure_id is NOT NULL,
  // so these are buffered here and flushed once the procedure row has an id.
  const [draftNotes, setDraftNotes] = useState<DraftNote[]>([]);

  // Unified AI bar state
  const [dictation, setDictation] = useState("");
  const [parsing, setParsing] = useState(false);
  const [elaboratingAll, setElaboratingAll] = useState(false);
  // Which single field is being elaborated, as "<lineKey>:<field>".
  const [elaborating, setElaborating] = useState<string | null>(null);
  const [elaboratingMedical, setElaboratingMedical] = useState(false);
  const [recentlyFilled, setRecentlyFilled] = useState<Record<string, boolean>>({});
  const [unmatchedHints, setUnmatchedHints] = useState<{
    patient?: string;
    doctor?: string;
    assistant?: string;
    problemAreas?: string[];
  }>({});
  const parseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastParsedRef = useRef<string>("");

  const speech = useSpeechRecognition({
    language: "en-IN",
    continuous: true,
    interimResults: true,
    onFinal: (chunk) => {
      setDictation((prev) => (prev ? prev + " " : "") + chunk);
    },
  });

  const flashFilled = (keys: string[]) => {
    setRecentlyFilled((prev) => {
      const next = { ...prev };
      keys.forEach((k) => { next[k] = true; });
      return next;
    });
    setTimeout(() => {
      setRecentlyFilled((prev) => {
        const next = { ...prev };
        keys.forEach((k) => { delete next[k]; });
        return next;
      });
    }, 1800);
  };

  const parseDictation = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || trimmed === lastParsedRef.current) return;
    lastParsedRef.current = trimmed;
    setParsing(true);
    try {
      const patientList = (patients || []).map((p: any) => ({
        id: p.id,
        name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      }));
      const doctorList = (allStaff || [])
        .filter((s: any) => (s.role || "").toLowerCase() === "doctor")
        .map((s: any) => ({ id: s.id, name: `${s.first_name} ${s.last_name}`.trim() }));
      const assistantList = (allStaff || [])
        .filter((s: any) => {
          const r = (s.role || "").toLowerCase();
          return r === "nurse" || r === "therapist" || r === "staff" || r === "assistant";
        })
        .map((s: any) => ({ id: s.id, name: `${s.first_name} ${s.last_name}`.trim() }));
      const problemAreaList = (problemAreas || []).map((p: any) => ({ id: p.id, name: p.name }));

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/procedure-ai-parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({
          transcript: trimmed,
          currentFields: {
            service_name: serviceLines[0]?.name || "",
            procedure_notes: serviceLines[0]?.procedure_notes || "",
            recommendations: serviceLines[0]?.recommendations || "",
          },
          problemAreas: problemAreaList,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Parse failed" }));
        throw new Error(err.error || "Parse failed");
      }
      const data = await res.json();
      console.log("[procedure-ai-parse] response", data);
      const filled: string[] = [];
      const nextHints: typeof unmatchedHints = {};

      // Local fuzzy matching against full lists (DB has 17k+ patients — cannot send all to AI)
      const norm = (s: string) =>
        s.toLowerCase().replace(/\b(dr|doctor|mr|mrs|ms|nurse)\b\.?/g, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
      const fuzzyMatch = (query: string, list: { id: string; name: string }[]) => {
        const q = norm(query);
        if (!q) return null;
        const qTokens = q.split(" ").filter(Boolean);
        let best: { id: string; score: number } | null = null;
        for (const item of list) {
          const n = norm(item.name);
          if (!n) continue;
          let score = 0;
          if (n === q) score = 1000;
          else if (n.includes(q) || q.includes(n)) score = 500;
          else {
            const nTokens = new Set(n.split(" "));
            const hits = qTokens.filter((t) => nTokens.has(t)).length;
            if (hits === 0) continue;
            score = hits * 100 - Math.abs(n.length - q.length);
          }
          if (!best || score > best.score) best = { id: item.id, score };
        }
        return best && best.score >= 100 ? best.id : null;
      };

      // Patient
      if (data.patient_name) {
        const id = fuzzyMatch(data.patient_name, patientList);
        if (id) { setPatientId(id); filled.push("patient"); }
        else nextHints.patient = data.patient_name;
      }
      // Doctor
      if (data.doctor_name) {
        const id = fuzzyMatch(data.doctor_name, doctorList);
        if (id) { setStaffId(id); filled.push("doctor"); }
        else nextHints.doctor = data.doctor_name;
      }
      // Assistant
      if (data.assistant_name) {
        const id = fuzzyMatch(data.assistant_name, assistantList);
        if (id) { setAssistedByIds((prev) => (prev.includes(id) ? prev : [...prev, id])); filled.push("assistant"); }
        else nextHints.assistant = data.assistant_name;
      }
      // Primary concerns
      if (Array.isArray(data.problem_areas) && data.problem_areas.length) {
        const matchedIds: string[] = [];
        const unmatched: string[] = [];
        for (const phrase of data.problem_areas) {
          const id = fuzzyMatch(phrase, problemAreaList);
          if (id) matchedIds.push(id);
          else unmatched.push(phrase);
        }
        if (matchedIds.length) {
          setSelectedProblemAreas((prev) => Array.from(new Set([...prev, ...matchedIds])));
          filled.push("problem_areas");
        }
        if (unmatched.length) nextHints.problemAreas = unmatched;
      }
      setUnmatchedHints(nextHints);

      if (data.service_name) {
        setServiceLines((prev) => prev.map((l, i) => (i === 0 ? { ...l, name: data.service_name } : l)));
        filled.push("service");
      }
      if (data.procedure_notes) {
        setServiceLines((prev) => prev.map((l, i) => (i === 0 ? { ...l, procedure_notes: data.procedure_notes } : l)));
        filled.push("procedure_notes");
      }
      if (data.recommendations) {
        setServiceLines((prev) => prev.map((l, i) => (i === 0 ? { ...l, recommendations: data.recommendations } : l)));
        filled.push("recommendations");
      }
      if (Array.isArray(data.prescriptions) && data.prescriptions.length > 0) {
        const newRx = data.prescriptions.map((p: any) => ({
          key: newRxKey(),
          // Read out of free text, so there is a name but no catalogue row.
          // "Others" keeps that name visible and editable; "" hid it.
          product_id: p.medicine_name ? OTHERS_VALUE : "",
          medicine_name: p.medicine_name || "",
          frequency: p.frequency || "",
          duration: p.duration || "",
          instructions: p.instructions || "",
          quantity: 1,
        }));
        setPrescriptions((prev) => [...prev, ...newRx]);
        filled.push("prescriptions");
      }
      if (filled.length === 0) {
        toast.info("Nothing matched — try mentioning symptoms, diagnosis, notes, or medicines.");
      } else {
        flashFilled(filled);
        toast.success(`Filled ${filled.length} section${filled.length === 1 ? "" : "s"} from dictation`);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to parse dictation");
    } finally {
      setParsing(false);
    }
  };

  // Auto-parse 1.2s after dictation stops growing (and mic is not actively listening)
  useEffect(() => {
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
    if (!dictation.trim()) return;
    if (speech.listening) return;
    parseTimerRef.current = setTimeout(() => { parseDictation(dictation); }, 1200);
    return () => { if (parseTimerRef.current) clearTimeout(parseTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictation, speech.listening]);

  const elaborateAll = async () => {
    const targets = serviceLines.filter((l) => l.procedure_notes || l.recommendations);
    if (targets.length === 0) {
      toast.info("Fill procedure notes or recommendations first, then Elaborate All.");
      return;
    }
    setElaboratingAll(true);
    try {
      const results = await Promise.all(
        targets.map(async (line) => {
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/procedure-ai-elaborate-all`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
            body: JSON.stringify({
              serviceName: line.name || "Consultation",
              procedure_notes: line.procedure_notes,
              recommendations: line.recommendations,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "Elaborate failed" }));
            throw new Error(err.error || "Elaborate failed");
          }
          return { key: line.key, data: await res.json() };
        }),
      );
      setServiceLines((prev) =>
        prev.map((l) => {
          const hit = results.find((r) => r.key === l.key);
          if (!hit) return l;
          return {
            ...l,
            procedure_notes: hit.data.procedure_notes || l.procedure_notes,
            recommendations: hit.data.recommendations || l.recommendations,
          };
        }),
      );
      flashFilled(["procedure_notes", "recommendations"]);
      toast.success("Elaborated all services");
    } catch (e: any) {
      toast.error(e.message || "Failed to elaborate");
    } finally {
      setElaboratingAll(false);
    }
  };

  // One field at a time, as the saved-prescription editor has always offered.
  // Same edge function it calls (elaborate-text), so a doctor gets the same
  // wording whether they are writing the prescription or correcting it later.
  const elaborateLine = async (lineKey: string, fieldType: "procedure_notes" | "recommendations") => {
    const line = serviceLines.find((l) => l.key === lineKey);
    if (!line) return;
    const currentText = fieldType === "procedure_notes" ? line.procedure_notes : line.recommendations;
    setElaborating(`${lineKey}:${fieldType}`);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elaborate-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ serviceName: (line.name || "Consultation").trim(), fieldType, currentText }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "AI request failed" }));
        throw new Error(err.error || "AI request failed");
      }
      const { text } = await res.json();
      setServiceLines((prev) => prev.map((l) => (l.key === lineKey ? { ...l, [fieldType]: text } : l)));
      toast.success("Text elaborated");
    } catch (e: any) {
      toast.error(e.message || "Failed to elaborate");
    } finally {
      setElaborating(null);
    }
  };

  const elaborateMedical = async () => {
    if (ELABORATABLE_MEDICAL_FIELDS.every(([field]) => !medical[field])) {
      toast.info("Fill in a medical information field first, then Elaborate.");
      return;
    }
    setElaboratingMedical(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/medical-info-ai-elaborate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify(Object.fromEntries(ELABORATABLE_MEDICAL_FIELDS.map(([field]) => [field, medical[field] || ""]))),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Elaborate failed" }));
        throw new Error(err.error || "Elaborate failed");
      }
      const data = await res.json();
      const filled: string[] = [];
      setMedical((m) => {
        const next = { ...m };
        ELABORATABLE_MEDICAL_FIELDS.forEach(([field]) => {
          if (data[field]) {
            next[field] = data[field];
            filled.push(field);
          }
        });
        return next;
      });
      if (filled.length === 0) {
        toast.info("Nothing to elaborate.");
      } else {
        setMedicalDirty(true);
        flashFilled(filled);
        toast.success("Elaborated medical information");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to elaborate");
    } finally {
      setElaboratingMedical(false);
    }
  };


  const { data: patients = [] } = useQuery({
    queryKey: ["patients-list"],
    queryFn: async () => {
      return await fetchAll<any>((from, to) =>
        supabase
          .from("patients")
          .select("id, first_name, last_name")
          .order("first_name")
          .range(from, to)
      );
    },
  });

  const { data: problemAreas = [] } = useQuery({
    queryKey: ["problem-areas-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("problem_areas").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  // Patient medical snapshot — editable here and synced back to the patient record
  const { data: patientRecord } = useQuery({
    queryKey: ["procedure-form-patient", patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, date_of_birth, gender, medical_history, current_medications, dietary_advice, skin_type, previous_treatments")
        .eq("id", patientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!patientRecord) return;
    setMedical({
      medical_history: patientRecord.medical_history || "",
      current_medications: patientRecord.current_medications || "",
      dietary_advice: patientRecord.dietary_advice || "",
      skin_type: patientRecord.skin_type || "",
      previous_treatments: patientRecord.previous_treatments || "",
    });
    setMedicalDirty(false);
  }, [patientRecord]);

  // Surveys already filled for this patient (most recent first)
  const { data: patientSurveys = [] } = useQuery({
    queryKey: ["procedure-form-surveys", patientId, defaultAppointmentId],
    enabled: !!patientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("survey_responses")
        .select("id, created_at, dr_status, answers, appointment_id, survey_templates(name)")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: allStaff = [] } = useQuery({
    queryKey: ["staff-active-all-for-ai"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")

        .select("id, first_name, last_name, role")
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: services = [] } = useQuery({
    queryKey: ["services-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("id, name, price, material_percent, procedure_notes, recommendations").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = usePharmaLookup();

  const { data: allAssets = [] } = useQuery({
    queryKey: ["assets-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase.from("assets").select("id, name").eq("status", "Active").order("name");
      if (error) throw error;
      return data;
    },
  });

  const addServiceLine = () =>
    setServiceLines((prev) => [...prev, blankServiceLine(`svc-${Date.now()}-${prev.length}`)]);

  /**
   * Whether each service line's picker is open, keyed by the line's own key.
   *
   * The popover used to be uncontrolled, so nothing could close it when a
   * service was chosen - Radix only closes on an outside click or Escape, and
   * CommandItem's onSelect is neither.
   */
  const [serviceMenuOpen, setServiceMenuOpen] = useState<Record<string, boolean>>({});
  const closeServiceMenu = (key: string) => setServiceMenuOpen((m) => ({ ...m, [key]: false }));

  const removeServiceLine = (key: string) =>
    setServiceLines((prev) => {
      // Drop the removed line's flag with it, so a later line reusing nothing
      // of its identity cannot inherit an open menu.
      setServiceMenuOpen((m) => {
        const next = { ...m };
        delete next[key];
        return next;
      });
      // Removing the only service empties it rather than leaving the section
      // with nothing in it: the form is back to how it opens, with one blank
      // line ready for the right service.
      if (prev.length === 1) return [blankServiceLine(`svc-${Date.now()}`)];
      return prev.filter((l) => l.key !== key);
    });

  const updateServiceLine = (key: string, patch: Partial<ServiceLine>) =>
    setServiceLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Auto-fill one service line (and merge its medicines / assets) from Service Master
  const applyServiceData = async (svc: any, svcId: string, lineKey: string) => {
    updateServiceLine(lineKey, {
      service_id: svcId,
      name: svc.name,
      procedure_notes: svc.procedure_notes || "",
      recommendations: Array.isArray(svc.recommendations)
        ? (svc.recommendations as string[]).join("\n")
        : svc.recommendations || "",
      material_percent:
        svc.material_percent === null || svc.material_percent === undefined ? "" : String(svc.material_percent),
      price: Number(svc.price || 0),
    });

    // Merge service medicines into prescriptions (no duplicates)
    const { data: meds } = await supabase
      .from("service_medicines")
      .select("*, pharma_products(name)")
      .eq("service_id", svcId);
    if (meds && meds.length > 0) {
      setPrescriptions((prev) => {
        const next = [...prev];
        for (const m of meds as any[]) {
          if (next.some((rx) => rx.product_id && rx.product_id === m.product_id)) continue;
          next.push({
            key: newRxKey(),
            product_id: m.product_id || (m.pharma_products?.name ? OTHERS_VALUE : ""),
            medicine_name: m.pharma_products?.name || "",
            frequency: m.frequency || "",
            duration: m.duration || "",
            instructions: m.instructions || "",
            quantity: 1,
          });
        }
        return next;
      });
    }

    // Merge service assets
    const { data: assetLinksData } = await supabase
      .from("asset_service_links")
      .select("*, assets(name)")
      .eq("service_id", svcId);
    if (assetLinksData && assetLinksData.length > 0) {
      setProcedureAssets((prev) => {
        const next = [...prev];
        for (const a of assetLinksData as any[]) {
          if (next.some((x) => x.asset_id === a.asset_id)) continue;
          next.push({
            key: newAssetKey(),
            asset_id: a.asset_id,
            asset_name: a.assets?.name || "",
            usage_guideline: a.usage_guideline || "",
            time_taken: a.time_taken ? String(a.time_taken) : "",
          });
        }
        return next;
      });
    }
    toast.info("Procedure & recommendations auto-filled from Service Master — you can edit them.");
  };

  // When a service is selected from dropdown
  // The product list plus the manual-entry escape hatch, as one option list.
  const medicineOptions = useMemo(
    () => [
      ...(products as { id: string; name: string }[]).map((p) => ({ id: p.id, name: p.name })),
      { id: OTHERS_VALUE, name: "Others (type manually)" },
    ],
    [products],
  );

  const handleServiceSelect = async (svcId: string, lineKey: string) => {
    const svc = services.find((s: any) => s.id === svcId);
    if (svc) await applyServiceData(svc, svcId, lineKey);
  };


  // A ref, not a plain local: a re-render between mutationFn and onSuccess would
  // otherwise hand onSuccess a freshly-reset variable.
  const notesFlushFailedRef = useRef(false);

  const createMutation = useMutation({
    mutationFn: async () => {
      // Validate that selected staff actually exist in database
      const validStaffIds = new Set((allStaff || []).map(s => s.id));

      if (staffId && staffId.trim() && !validStaffIds.has(staffId)) {
        throw new Error("Selected doctor does not exist in the system. Please select a different doctor.");
      }

      if (assistedByIds.some((id) => !validStaffIds.has(id))) {
        throw new Error("Selected assistant does not exist in the system. Please select a different assistant.");
      }

      // Warn about zero stock for prescribed medicines (don't block)
      for (const rx of prescriptions) {
        // "__others__" is not a product id. Querying stock with it returns
        // nothing and would warn that every typed-in medicine is out of
        // stock - and rows loaded from Salesforce now carry it.
        if (!rx.product_id || rx.product_id === OTHERS_VALUE) continue;
        const { data: invData } = await supabase.from("pharma_inventory").select("quantity").eq("product_id", rx.product_id);
        const { data: rxData } = await supabase.from("prescriptions").select("quantity").eq("product_id", rx.product_id);
        const totalStock = (invData || []).reduce((s, i) => s + Number(i.quantity), 0);
        const consumed = (rxData || []).reduce((s, i) => s + Number(i.quantity), 0);
        if (Math.max(0, totalStock - consumed) === 0) {
          toast.warning(`Insufficient stock for ${rx.medicine_name}. Please add stock.`);
        }
      }

      // A visit where nobody picked a service is saved with no service, not
      // with an invented one.
      //
      // This used to substitute a line called "Consultation" whenever the form
      // was saved without one, which then read back as though a service had
      // been chosen - and it is why "Consultation" is the service on 24,610
      // procedures. A blank service says "none recorded", which is true and
      // can be corrected; a made-up one cannot be told apart from a real
      // consultation afterwards.
      //
      // Only new saves are affected: nothing already stored is rewritten.
      // One service, once. A visit holds a service a single time - the
      // database enforces it - and what was entered once must read once on
      // the prescription and on the printed document.
      const effectiveLines = dedupeByName(
        serviceLines.filter((l) => (l.name || "").trim()).map((l) => ({ ...l, service_name: l.name })),
      );
      const combine = (field: "procedure_notes" | "recommendations") =>
        effectiveLines
          .filter((l) => (l[field] || "").trim())
          .map((l) => (effectiveLines.length > 1 ? `${l.name}: ${l[field]}` : l[field]))
          .join("\n\n");

      // The appointment is checked the same way and for the same reason: the
      // front desk deletes appointments all day, and one deleted while a
      // consultation was being written up rejected the whole save. See
      // procedureAppointment.ts.
      const appointmentLink = await appointmentLinkForSave(appointmentId);

      // The medicines are built and checked here, before a single row is
      // written. They used to be built last, after the procedure and its
      // services were already in - so one medicine id the catalogue no longer
      // had rejected the insert and left a saved visit with no medicines on
      // it and a raw Postgres message on screen. An id that is not in the
      // catalogue is dropped and the medicine saved by name instead; see
      // prescriptionProducts.ts for why that loses nothing.
      const catalogue = knownProductIds(products as { id: string }[]);
      const droppedMedicines = prescriptions
        .filter((rx) => losesCatalogueLink(rx.product_id, catalogue))
        .map((rx) => rx.medicine_name);
      const rxToSave = prescriptions
        .map((rx) => ({
          product_id: productIdForSave(rx.product_id, catalogue),
          medicine_name: rx.medicine_name,
          dosage: "",
          frequency: rx.frequency,
          duration: rx.duration,
          instructions: rx.instructions,
          quantity: rx.quantity,
        }))
        // A row with neither a catalogue medicine nor a typed name is an
        // empty line the doctor never filled in.
        .filter((row) => row.product_id || (row.medicine_name || "").trim());

      const { data: proc, error } = await supabase
        .from("procedures")
        .insert({
          patient_id: patientId || null,
          staff_id: staffId && staffId.trim() ? staffId : null,
          assisted_by: assistedByIds[0] || null,
          assisted_by_ids: assistedByIds,
          symptoms: medical.symptoms || null,
          diagnosis: medical.diagnosis || null,
          lab_tests: medical.lab_tests || null,
          appointment_id: appointmentLink.id,
          service_name: effectiveLines.map((l) => l.name).join(", "),
          procedure_notes: combine("procedure_notes"),
          recommendations: combine("recommendations") || null,
          visit_type: visitType,
          recurring_count: visitType === "Recurring" ? recurringCount : null,
          recurring_dates:
            visitType === "Recurring"
              ? recurringDates.filter(Boolean).map((d) => new Date(d).toISOString())
              : null,
        } as any)
        .select()
        .single();
      if (error) throw error;

      // No service lines means no service rows - not one placeholder row.
      const { error: svcErr } = effectiveLines.length === 0 ? { error: null } : await supabase.from("procedure_services").insert(
        effectiveLines.map((l, i) => ({
          procedure_id: proc.id,
          service_id: l.service_id && l.service_id !== OTHERS_VALUE ? l.service_id : null,
          service_name: l.name,
          procedure_notes: l.procedure_notes || null,
          recommendations: l.recommendations || null,
          material_percent: l.material_percent.trim() === "" ? null : parseFloat(l.material_percent),
          sort_order: i,
        })),
      );
      if (svcErr) throw svcErr;


      if (rxToSave.length > 0) {
        const { error: rxErr } = await supabase
          .from("prescriptions")
          .insert(rxToSave.map((row) => ({ ...row, procedure_id: proc.id })));
        if (rxErr) throw rxErr;
        const notice = droppedMedicineNotice(droppedMedicines);
        if (notice) toast.warning(notice);
      }
      if (appointmentLink.removed) toast.warning(APPOINTMENT_REMOVED_NOTICE);

      notesFlushFailedRef.current = false;
      if (draftNotes.length > 0) {
        const noteRows = draftNotes.filter((n) => n.content.trim());
        if (noteRows.length > 0) {
          // Stagger the timestamps: one INSERT stamps every row with the same now(), which
          // leaves the order arbitrary both here (updated_at desc) and in the prescription
          // PDF (created_at asc). updated_at must equal created_at or each note renders as
          // "Edited by ..." instead of "Added by ...".
          const base = Date.now() - noteRows.length * 1000;
          const { error: notesErr } = await supabase.from("procedure_sticky_notes").insert(
            noteRows.map((n, i) => {
              const ts = new Date(base + i * 1000).toISOString();
              return {
                procedure_id: proc.id,
                title: n.title.trim() || null,
                content: n.content.trim(),
                created_at: ts,
                updated_at: ts,
              };
            }),
          );
          // Non-fatal: the procedure is already saved by this point, so throwing would report
          // a failure the user can only "retry" by creating a duplicate procedure.
          if (notesErr) {
            notesFlushFailedRef.current = true;
            toast.warning(`Procedure saved, but the notes could not be attached: ${notesErr.message}`);
          }
        }
      }

      // Sync any edits to the patient's medical information back to the patient record
      if (medicalDirty && patientId) {
        const { error: medErr } = await supabase
          .from("patients")
          // Only the columns this form shows. Allergies and Skin Concerns are
          // deliberately absent: they are no longer on the form, so
          // `medical.allergies` is undefined and writing `|| null` would blank
          // every patient's stored value on the next save - 5,365 of them for
          // skin_concerns alone. Leaving a column out of the update keeps it.
          .update({
            medical_history: medical.medical_history || null,
            current_medications: medical.current_medications || null,
            dietary_advice: medical.dietary_advice || null,
            skin_type: medical.skin_type || null,
            previous_treatments: medical.previous_treatments || null,
          })
          .eq("id", patientId);
        if (medErr) throw medErr;
      }

      // Follow-up appointment(s) picked by the doctor, each with the
      // investigation written beside its own date - see reservedVisits for why
      // the pairing happens before the undated visits are dropped.
      const followUps =
        visitType === "Recurring"
          ? reservedVisits(recurringDates, followUpInvestigations)
          : reservedVisits([nextAppointmentAt], followUpInvestigations);
      const followUpDates = followUps.map((v) => v.date);
      if (followUps.length > 0 && patientId) {
        // A browser's min/max only discourages a bad year, it does not stop
        // one reaching here - which is how an appointment came to be reserved
        // in February of the year 268.
        const wrongYear = followUpDates.find((d) => !isPlausibleIso(d));
        if (wrongYear) {
          throw new Error("Check the follow-up date - that year looks wrong.");
        }
        const p = (patients as any[]).find((x) => x.id === patientId);
        const rows = followUps.map(({ date: d, investigation }) => {
          const start = new Date(d);
          const end = new Date(start.getTime() + 30 * 60 * 1000);
          return {
            patient_id: patientId,
            patient_name: p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : null,
            staff_id: staffId || null,
            service: serviceLines.map((l) => l.name).filter(Boolean).join(", ") || "Follow Up",
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            status: "Reserved",
            // Blank stays blank rather than becoming an empty string: the
            // Investigation column treats an empty value as "nothing recorded"
            // and falls through to the service, which is the behaviour this
            // field exists to let the doctor override, not to fake.
            reason_for_consultation: investigation || null,
            visit_status: visitType === "Recurring" ? "Recurring visit" : "Follow-up visit",
            problem_area_ids: selectedProblemAreas.length ? selectedProblemAreas : null,
            source: "Procedure",
          };
        });
        const { error: aptErr } = await supabase.from("appointments").insert(rows as any);
        if (aptErr) throw aptErr;
      }
      return proc;
    },
    onSuccess: (proc: any) => {
      queryClient.invalidateQueries({ queryKey: ["procedures"] });
      // The visit's service rows, so opening it next does not read a list
      // fetched before they were written and invent them a second time.
      queryClient.invalidateQueries({ queryKey: ["procedure-services"] });
      queryClient.invalidateQueries({ queryKey: ["appointment-procedures"] });
      queryClient.invalidateQueries({ queryKey: ["patient", patientId] });
      if (nextAppointmentAt || (visitType === "Recurring" && recurringDates.some(Boolean))) {
        queryClient.invalidateQueries({ queryKey: ["appointments"] });
        toast.success("Procedure saved · Follow-up appointment(s) reserved");
      } else {
        toast.success("Procedure created successfully");
      }
      if (proc?.id) queryClient.invalidateQueries({ queryKey: ["procedure-sticky-notes", proc.id] });
      // Keep the buffer on failure so the user's words survive a retry.
      if (!notesFlushFailedRef.current) setDraftNotes([]);
      onSaved?.(proc?.id);
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const addPrescription = () => {
    setPrescriptions((prev) => [...prev, { key: newRxKey(), product_id: "", medicine_name: "", frequency: "", duration: "", instructions: "", quantity: 1 }]);
  };

  const fetchStock = async (productId: string, key: string) => {
    setStockMap((prev) => ({ ...prev, [key]: { available: 0, loading: true } }));
    // Inventory rows are decremented at the point of sale, so they already reflect live stock.
    const { data: invData } = await supabase
      .from("pharma_inventory")
      .select("quantity")
      .eq("product_id", productId);
    const totalStock = (invData || []).reduce((s, i) => s + Number(i.quantity), 0);
    setStockMap((prev) => ({ ...prev, [key]: { available: Math.max(0, totalStock), loading: false } }));
  };

  // Addressed by the row's own key, not its position, and the row object is
  // replaced rather than written into. `[...prescriptions]` copies the array
  // but not the rows inside it, so assigning to updated[index].field wrote
  // straight into the object React was already holding - the state changed
  // without React being told, which is how an edit could land on screen only
  // after some other keystroke forced a render.
  const updatePrescription = (key: string, field: keyof PrescriptionInput, value: string | number) => {
    setPrescriptions((prev) =>
      prev.map((rx) => {
        if (rx.key !== key) return rx;
        if (field !== "product_id") return { ...rx, [field]: value };
        if (value === OTHERS_VALUE) return { ...rx, product_id: OTHERS_VALUE, medicine_name: "" };
        const prod = products.find((p) => p.id === value);
        const previous = products.find((p) => p.id === rx.product_id);
        fetchStock(value as string, key);
        return {
          ...rx,
          product_id: value as string,
          medicine_name: prod?.name || "",
          // The pharmacy's defaults for this medicine, without overwriting
          // anything the doctor has typed into the row already.
          ...applyMedicineDefaults(rx, prod, previous),
        };
      }),
    );
  };

  const removePrescription = (key: string) => {
    setPrescriptions((prev) => prev.filter((rx) => rx.key !== key));
    // The stock note belongs to the row that has gone, not to whatever row
    // slides up into its place.
    setStockMap((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const addAsset = () => setProcedureAssets((prev) => [...prev, { key: newAssetKey(), asset_id: "", asset_name: "", usage_guideline: "", time_taken: "" }]);
  const updateAsset = (key: string, field: keyof AssetInput, value: string) => {
    setProcedureAssets((prev) =>
      prev.map((a) => {
        if (a.key !== key) return a;
        const next = { ...a, [field]: value } as AssetInput;
        if (field === "asset_id") next.asset_name = allAssets.find((x) => x.id === value)?.name || "";
        return next;
      }),
    );
  };
  const removeAsset = (key: string) => setProcedureAssets((prev) => prev.filter((a) => a.key !== key));

  const isFromAppointment = !!defaultAppointmentId;

  const selectedPatient = (patients as any[]).find((p) => p.id === patientId);
  const selectedPatientName = selectedPatient
    ? `${selectedPatient.first_name || ""} ${selectedPatient.last_name || ""}`.trim()
    : "Patient";

  const setRecurringCountSafe = (n: number) => {
    const c = Math.max(1, Math.min(24, n || 1));
    setRecurringCount(c);
    setRecurringDates((prev) => {
      const next = [...prev];
      while (next.length < c) next.push("");
      return next.slice(0, c);
    });
    // The investigations are indexed by visit, so they grow and shrink with
    // the dates or the two fall out of step.
    setFollowUpInvestigations((prev) => {
      const next = [...prev];
      while (next.length < c) next.push("");
      return next.slice(0, c);
    });
  };

  const medicalSection = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-primary">AI Assist</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Use the mic on any field, then Elaborate to turn it into clinical language.
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5"
          onClick={elaborateMedical}
          disabled={elaboratingMedical}
        >
          {elaboratingMedical ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          AI Elaborate All
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {MEDICAL_FIELDS.map(([field, label]) => (
          <div key={field}>
            {field === "skin_type" ? (
              <>
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <Select
                  value={medical[field] || ""}
                  onValueChange={(v) => { setMedical((m) => ({ ...m, [field]: v })); setMedicalDirty(true); }}
                >
                  <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {SKIN_TYPE_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                  </SelectContent>
                </Select>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <MicButton
                    size="sm"
                    value={medical[field] || ""}
                    onChange={(next) => { setMedical((m) => ({ ...m, [field]: next })); setMedicalDirty(true); }}
                    title={`Dictate ${label}`}
                  />
                </div>
                <Textarea
                  rows={3}
                  className={`mt-1 text-sm transition-all ${recentlyFilled[field] ? "ring-2 ring-primary/40" : ""} ${elaboratingMedical ? "opacity-60" : ""}`}
                  value={medical[field] || ""}
                  // The first letter is capitalised as it is typed, unless the
                  // word is one the clinic writes in lower case - see
                  // sentenceCase.ts. Dictation and AI Elaborate set these
                  // fields by their own paths and are untouched.
                  onChange={(e) => { setMedical((m) => ({ ...m, [field]: capitaliseFirstWord(e.target.value, e.target.selectionStart) })); setMedicalDirty(true); }}
                />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const body = (
        <div className="space-y-4 pt-2">
          {patientId && (
            <PatientToolsBar patientId={patientId} patientName={selectedPatientName} context="patient" />
          )}
          <Tabs defaultValue="procedure" className="w-full">
            <TabsList className="h-auto flex flex-wrap justify-start gap-1">
              <TabsTrigger value="procedure">Procedure</TabsTrigger>
              <TabsTrigger value="medical" className="gap-1.5">
                <HeartPulse className="h-3.5 w-3.5" /> Medical Information
              </TabsTrigger>
              <TabsTrigger value="surveys" className="gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" /> Surveys
              </TabsTrigger>
              <TabsTrigger value="knowledge" className="gap-1.5">
                <BookOpen className="h-3.5 w-3.5" /> Knowledge Article
              </TabsTrigger>
            </TabsList>
            <TabsContent value="procedure" className="space-y-4 mt-4">
          {/* Unified AI bar */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary">AI Assist — dictate or elaborate</span>
                {parsing && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Filling fields…
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={speech.listening ? "destructive" : "outline"}
                  className="h-8 gap-1.5"
                  onClick={() => (speech.listening ? speech.stop() : speech.start())}
                  disabled={!speech.supported}
                  title={speech.supported ? "Voice dictation" : "Voice not supported in this browser"}
                >
                  {speech.listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  {speech.listening ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                      Listening
                    </span>
                  ) : "Dictate"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={elaborateAll}
                  disabled={elaboratingAll}
                >
                  {elaboratingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  AI Elaborate All
                </Button>
              </div>
            </div>
            <Textarea
              value={dictation + (speech.interimTranscript ? (dictation ? " " : "") + speech.interimTranscript : "")}
              onChange={(e) => setDictation(e.target.value)}
              placeholder='Speak or type, e.g. "Patient has acne on forehead and cheeks, itching for 3 weeks. Diagnosis is mild rosacea. Prescribe Doxycycline 100mg twice daily for 14 days."'
              rows={2}
              className="bg-background"
            />
            {dictation && !speech.listening && (
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setDictation(""); lastParsedRef.current = ""; }}>
                  Clear
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => parseDictation(dictation)} disabled={parsing}>
                  Parse & Fill Fields
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Patient *</Label>
              <PatientCombobox
                value={patientId}
                onValueChange={(v) => { setPatientId(v); setUnmatchedHints((h) => ({ ...h, patient: undefined })); }}
                placeholder="Select patient"
                className="mt-1.5"
                disabled={isFromAppointment}
              />
              {/* Age and gender, in front of the doctor while they write: both
                  bear on dosage, and looking them up meant leaving the form. */}
              {patientIdentityLine(patientRecord) && (
                <p className="text-xs text-muted-foreground mt-1">{patientIdentityLine(patientRecord)}</p>
              )}
              {/* Which visit this is going onto. Plain when it is today's;
                  called out when it is not, which is the case that was
                  quietly filing consultations onto months-old appointments. */}
              {visitDay.dayLabel && (
                <p
                  data-testid="filing-under"
                  className={`text-xs mt-1 ${visitDay.mismatched ? "text-destructive font-medium" : "text-muted-foreground"}`}
                >
                  {visitDay.mismatched ? "⚠ Filing under an older visit: " : "Filing under visit: "}
                  {visitDay.dayLabel}
                </p>
              )}
              {unmatchedHints.patient && (
                <p className="text-xs text-amber-600 mt-1">Couldn't match "{unmatchedHints.patient}" — please select manually.</p>
              )}
            </div>
            <div>
              <Label>Doctor</Label>
              <StaffCombobox value={staffId} onValueChange={(v) => { setStaffId(v); setUnmatchedHints((h) => ({ ...h, doctor: undefined })); }} placeholder="Select doctor" className="mt-1.5" roleFilter={["Doctor"]} />
              {unmatchedHints.doctor && (
                <p className="text-xs text-amber-600 mt-1">Couldn't match "{unmatchedHints.doctor}" — please select manually.</p>
              )}
            </div>
            <div>
              <Label>Assisted By</Label>
              <StaffMultiCombobox value={assistedByIds} onValueChange={(v) => { setAssistedByIds(v); setUnmatchedHints((h) => ({ ...h, assistant: undefined })); }} placeholder="Select assistants" className="mt-1.5" />
              {unmatchedHints.assistant && (
                <p className="text-xs text-amber-600 mt-1">Couldn't match "{unmatchedHints.assistant}" — please select manually.</p>
              )}
            </div>
            <div>
              <Label>Primary Concern</Label>
              <Popover modal>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full mt-1.5 justify-start font-normal h-10">
                    {selectedProblemAreas.length === 0
                      ? <span className="text-muted-foreground">Select primary concerns</span>
                      : <span className="truncate">{selectedProblemAreas.map(id => problemAreas.find(pa => pa.id === id)?.name).filter(Boolean).join(", ")}</span>
                    }
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search..." />
                    <CommandList>
                      <CommandEmpty>No primary concerns found</CommandEmpty>
                      <CommandGroup>
                        {problemAreas.map((pa) => (
                          <CommandItem
                            key={pa.id}
                            onSelect={() => {
                              setSelectedProblemAreas(prev =>
                                prev.includes(pa.id) ? prev.filter(id => id !== pa.id) : [...prev, pa.id]
                              );
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${selectedProblemAreas.includes(pa.id) ? "opacity-100" : "opacity-0"}`} />
                            {pa.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {unmatchedHints.problemAreas && unmatchedHints.problemAreas.length > 0 && (
                <p className="text-xs text-amber-600 mt-1">Couldn't match: {unmatchedHints.problemAreas.map((q) => `"${q}"`).join(", ")} — please select manually.</p>
              )}
            </div>
          </div>

          {/* Services / Procedures — multiple */}
          <div className="rounded-lg border-2 border-primary/25 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-display font-semibold text-primary">Services / Procedures</Label>
              <Button type="button" variant="outline" size="sm" onClick={addServiceLine}>
                <Plus className="h-3 w-3 mr-1" /> Add Service
              </Button>
            </div>
            {serviceLines.map((line, i) => (
              <div key={line.key} className="rounded-lg border bg-background p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Service {i + 1}</span>
                  {/* Offered on the first service too. A service picked by
                      mistake had to be typed over, because Remove only
                      appeared once a second service existed. */}
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => removeServiceLine(line.key)}>
                    Remove
                  </Button>
                </div>
                <ServicePicker
                  services={services as ServiceOption[]}
                  serviceId={line.service_id}
                  serviceName={line.name}
                  open={!!serviceMenuOpen[line.key]}
                  onOpenChange={(open) => setServiceMenuOpen((m) => ({ ...m, [line.key]: open }))}
                  onPickMaster={(svcId) => handleServiceSelect(svcId, line.key)}
                  onChooseOthers={() => updateServiceLine(line.key, { service_id: OTHERS_VALUE, name: "" })}
                  onNameChange={(name) => updateServiceLine(line.key, { name })}
                />
                {/* Material Cost % used to sit here. It is a billing figure, not a
                    clinical one, and the clinic asked for it in one place only.
                    Billing owns it (55,884 material_cost_lines rows against 9
                    here, all of those auto-filled from the Service Master rather
                    than typed). The column and its data stay: the Material Cost
                    report still reads the Service Master default and any value
                    already recorded, it just cannot be entered from a
                    prescription any more. */}
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Procedure Notes</Label>
                    <div className="flex items-center gap-1">
                      <MicButton value={line.procedure_notes} onChange={(v) => updateServiceLine(line.key, { procedure_notes: v })} />
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary"
                        onClick={() => elaborateLine(line.key, "procedure_notes")} disabled={elaborating !== null || elaboratingAll}>
                        {elaborating === `${line.key}:procedure_notes` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Elaborate AI
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    rows={3}
                    className={`mt-1 transition-all ${recentlyFilled.procedure_notes ? "ring-2 ring-primary/40" : ""} ${elaboratingAll ? "opacity-60" : ""}`}
                    placeholder="Details of the procedure performed..."
                    value={line.procedure_notes}
                    onChange={(e) => updateServiceLine(line.key, { procedure_notes: capitaliseFirstWord(e.target.value, e.target.selectionStart) })}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Recommendations</Label>
                    <div className="flex items-center gap-1">
                      <MicButton value={line.recommendations} onChange={(v) => updateServiceLine(line.key, { recommendations: v })} />
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary"
                        onClick={() => elaborateLine(line.key, "recommendations")} disabled={elaborating !== null || elaboratingAll}>
                        {elaborating === `${line.key}:recommendations` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Elaborate AI
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    rows={3}
                    className={`mt-1 transition-all ${recentlyFilled.recommendations ? "ring-2 ring-primary/40" : ""} ${elaboratingAll ? "opacity-60" : ""}`}
                    placeholder="Post-procedure recommendations..."
                    value={line.recommendations}
                    onChange={(e) => updateServiceLine(line.key, { recommendations: capitaliseFirstWord(e.target.value, e.target.selectionStart) })}
                  />
                </div>
              </div>
            ))}
            {/* The same action again at the foot of the list. With three
                services filled in, the button at the top of the card is a
                screen and a half away, and adding a fourth meant scrolling up
                to find it and back down to type. */}
            {serviceLines.length > 0 && (
              <Button type="button" variant="outline" size="sm" className="w-full border-dashed" onClick={addServiceLine}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add another service
              </Button>
            )}
          </div>


          {/* Surveys filled before this procedure */}
          {patientSurveys.length > 0 && (
            <div className="rounded-lg border border-accent/40 bg-accent/10 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Surveys filled by this patient</span>
              </div>
              {patientSurveys.map((s: any) => {
                const answers = Array.isArray(s.answers) ? s.answers : [];
                return (
                  <div key={s.id} className="rounded-md border bg-background p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">
                        {s.survey_templates?.name || "Survey"}
                        {s.appointment_id && defaultAppointmentId && s.appointment_id === defaultAppointmentId && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-primary">this visit</span>
                        )}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {displayDate(s.created_at)} · {s.dr_status || "pending"}
                      </span>
                    </div>
                    {s.ai_summary && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{s.ai_summary}</p>}
                    {answers.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {answers.slice(0, 6).map((a: any, idx: number) => (
                          <li key={idx} className="text-xs">
                            <span className="text-muted-foreground">{a.question || a.question_text || `Q${idx + 1}`}: </span>
                            <span className="font-medium">{Array.isArray(a.answer) ? a.answer.join(", ") : String(a.answer ?? "—")}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}


          {/* Prescriptions */}
          <div className="rounded-lg border-2 border-primary/25 bg-primary/5 p-4">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-base font-display font-semibold flex items-center gap-2 text-primary">
                <Pill className="h-4 w-4" /> Products/Medications
              </Label>
              <Button type="button" variant="outline" size="sm" onClick={addPrescription}>
                <Plus className="h-3 w-3 mr-1" /> Add Medicine
              </Button>
            </div>
            {prescriptions.map((rx, i) => (
              <div key={rx.key} className="border rounded-lg p-3 mb-3 space-y-2 bg-background">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Medicine {i + 1}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => removePrescription(rx.key)}>Remove</Button>
                </div>
                <div>
                  {/* Searchable: 239 products is too many to scroll, and the
                      clinic needs a medicine found by any word of its name. */}
                  <SearchableSelect
                    value={rx.product_id}
                    onChange={(v) => updatePrescription(rx.key, "product_id", v)}
                    options={medicineOptions}
                    placeholder="Select medicine *"
                    searchPlaceholder="Search medicine..."
                    emptyText="No medicine found."
                  />
                  {rx.product_id === OTHERS_VALUE && (
                    <Input
                      className="mt-1"
                      placeholder="Medicine name"
                      value={rx.medicine_name}
                      onChange={(e) => updatePrescription(rx.key, "medicine_name", e.target.value)}
                    />
                  )}
                  {rx.product_id && rx.product_id !== OTHERS_VALUE && stockMap[rx.key] && (
                    stockMap[rx.key].loading ? (
                      <p className="text-xs text-muted-foreground mt-1">Checking stock...</p>
                    ) : stockMap[rx.key].available <= 0 ? (
                      <p className="text-xs text-amber-600 mt-1">⚠️ This medicine is currently out of stock</p>
                    ) : (
                      <p className="text-xs text-green-600 mt-1">Available stock: {stockMap[rx.key].available} units</p>
                    )
                  )}
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Frequency</label>
                      <div className="relative">
                        <Input placeholder="e.g. Twice a day" value={rx.frequency} onChange={(e) => updatePrescription(rx.key, "frequency", capitaliseFirstWord(e.target.value, e.target.selectionStart))} className="pr-9" />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2">
                          <MicButton value={rx.frequency} onChange={(v) => updatePrescription(rx.key, "frequency", v)} mode="replace" />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Duration</label>
                      <div className="relative">
                        <Input placeholder="e.g. 7 days" value={rx.duration} onChange={(e) => updatePrescription(rx.key, "duration", capitaliseFirstWord(e.target.value, e.target.selectionStart))} className="pr-9" />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2">
                          <MicButton value={rx.duration} onChange={(v) => updatePrescription(rx.key, "duration", v)} mode="replace" />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Qty</label>
                      <Input type="number" placeholder="1" value={rx.quantity || ""} onChange={(e) => updatePrescription(rx.key, "quantity", e.target.value === "" ? 0 : Math.max(1, parseInt(e.target.value) || 1))} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Special Instructions</label>
                    <div className="relative">
                      <Input placeholder="e.g. Apply after cleansing" value={rx.instructions} onChange={(e) => updatePrescription(rx.key, "instructions", capitaliseFirstWord(e.target.value, e.target.selectionStart))} className="pr-9" />
                      <div className="absolute right-1 top-1/2 -translate-y-1/2">
                        <MicButton value={rx.instructions} onChange={(v) => updatePrescription(rx.key, "instructions", v)} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {prescriptions.length > 0 && (
              <Button type="button" variant="outline" size="sm" className="w-full border-dashed" onClick={addPrescription}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add another medicine
              </Button>
            )}
          </div>

          {/* Required Assets */}
          <div className="rounded-lg border-2 border-accent/50 bg-accent/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-base font-display font-semibold flex items-center gap-2">
                <Wrench className="h-4 w-4" /> Required Assets
              </Label>
              <Button type="button" variant="outline" size="sm" onClick={addAsset}>
                <Plus className="h-3 w-3 mr-1" /> Add Asset
              </Button>
            </div>
            {procedureAssets.length === 0 && (
              <p className="text-xs text-muted-foreground mb-2">No assets linked. Select a service to auto-populate or add manually.</p>
            )}
            {procedureAssets.map((asset, i) => (
              <div key={asset.key} className="border rounded-lg p-3 mb-3 space-y-2 bg-background">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Asset {i + 1}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => removeAsset(asset.key)}>Remove</Button>
                </div>
                <Select value={asset.asset_id} onValueChange={(v) => updateAsset(asset.key, "asset_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
                  <SelectContent>
                    {allAssets.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Usage guideline" value={asset.usage_guideline} onChange={(e) => updateAsset(asset.key, "usage_guideline", e.target.value)} />
                  <Input type="number" placeholder="Time taken (mins)" value={numVal(asset.time_taken)} onChange={(e) => updateAsset(asset.key, "time_taken", e.target.value)} />
                </div>
              </div>
            ))}
            {procedureAssets.length > 0 && (
              <Button type="button" variant="outline" size="sm" className="w-full border-dashed" onClick={addAsset}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add another asset
              </Button>
            )}
          </div>

          {/* Notes — inline rather than a tab of its own: staff jot an observation
              while filling the form, and a whole tab for one card meant leaving
              the form to do it. StickyNotes still buffers into
              draftNotes here, because procedure_sticky_notes.procedure_id is NOT
              NULL and the procedure does not exist yet. */}
          <div className="space-y-2">
            <Label className="text-base font-display font-semibold text-primary flex items-center gap-1.5">
              <StickyNote className="h-4 w-4" /> Notes
            </Label>
            <StickyNotes notes={draftNotes} onNotesChange={setDraftNotes} />
          </div>

          {/* Visit plan */}
          <div className="rounded-lg border-2 border-primary/25 bg-primary/5 p-4 space-y-3">
            <Label className="text-base font-display font-semibold flex items-center gap-2 text-primary">
              <Repeat className="h-4 w-4" /> Visit Type
            </Label>
            <RadioGroup
              value={visitType}
              onValueChange={(v) => setVisitType(v as "Single" | "Recurring")}
              className="flex gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="Single" id="visit-single" />
                <Label htmlFor="visit-single" className="font-normal cursor-pointer">Single visit</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="Recurring" id="visit-recurring" />
                <Label htmlFor="visit-recurring" className="font-normal cursor-pointer">Recurring visit</Label>
              </div>
            </RadioGroup>

            {visitType === "Single" ? (
              <div>
                <Label className="flex items-center gap-2 text-sm">
                  <CalendarClock className="h-4 w-4" /> Next Appointment Date
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Pick a date &amp; time — an appointment will be created with status <span className="font-medium">Reserved</span>.
                </p>
                <Input
                  type="datetime-local"
                  min={MIN_DATETIME}
                  max={MAX_DATETIME}
                  value={nextAppointmentAt}
                  onChange={(e) => setNextAppointmentAt(e.target.value)}
                  className="mt-2 bg-background"
                />
                {nextAppointmentAt && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs mt-1" onClick={() => setNextAppointmentAt("")}>
                    Clear
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="max-w-[220px]">
                  <Label className="text-sm"># of Recurring Visits</Label>
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    value={numVal(recurringCount)}
                    onChange={(e) => setRecurringCountSafe(parseInt(e.target.value, 10))}
                    className="mt-1.5 bg-background"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Array.from({ length: recurringCount }).map((_, i) => {
                    const { date: visitDate, time: visitTime } = splitVisitDateTime(recurringDates[i]);
                    const hasSomething = Boolean(visitDate || (followUpInvestigations[i] || "").trim());
                    const setVisit = (date: string, time: string) => {
                      const next = [...recurringDates];
                      next[i] = joinVisitDateTime(date, time);
                      setRecurringDates(next);
                    };
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
                                  { dates: recurringDates, investigations: followUpInvestigations },
                                  i,
                                );
                                setRecurringDates(next.dates);
                                setFollowUpInvestigations(next.investigations);
                              }}
                            >
                              Clear
                            </Button>
                          )}
                          {recurringCount > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              title="Remove this visit"
                              aria-label={`Remove visit ${i + 1}`}
                              onClick={() => {
                                // Both lists spliced together, or the visit
                                // below inherits this one's investigation.
                                const next = removeVisitAt(
                                  { dates: recurringDates, investigations: followUpInvestigations },
                                  i,
                                );
                                setRecurringDates(next.dates);
                                setFollowUpInvestigations(next.investigations);
                                setRecurringCount(next.dates.length);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {/* A date box and a 12-hour clock rather than
                          datetime-local, which renders in whatever format the
                          browser's locale picks - 24-hour on the clinic's
                          machines. Same two controls the Appointments page
                          books with. */}
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <DateInput
                          value={visitDate}
                          onChange={(iso) => setVisit(iso, visitTime)}
                          withCalendar
                          className="w-[150px]"
                        />
                        <TimePicker12h
                          value={visitTime}
                          onChange={(next) => setVisit(visitDate, next)}
                          compact
                        />
                      </div>
                      {/* This visit's own investigation. A course is not one
                          investigation repeated - the third session and the
                          review that follows it read differently on the
                          appointment and in the patient's reminder. */}
                      <Label className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Stethoscope className="h-3.5 w-3.5" /> Investigation
                      </Label>
                      <Textarea
                        value={followUpInvestigations[i] || ""}
                        onChange={(e) => setInvestigationAt(i, e.target.value)}
                        placeholder="e.g. 3rd of 6 laser toning sessions"
                        rows={2}
                        className="mt-1 bg-background"
                      />
                    </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Each date creates a <span className="font-medium">Reserved</span> appointment. Dates left blank can be added later during billing.
                  An investigation left blank stays blank on the appointment.
                </p>
              </div>
            )}

            {/* A single follow-up is one visit, so it keeps one box. A
                recurring course has one beside each of its dates above. */}
            {visitType === "Single" && nextAppointmentAt && (
              <div>
                <Label className="flex items-center gap-2 text-sm">
                  <Stethoscope className="h-4 w-4" /> Investigation for this visit
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  What the visit is for. Left blank, the appointment shows this
                  procedure&apos;s services instead.
                </p>
                <Textarea
                  value={followUpInvestigations[0] || ""}
                  onChange={(e) => setInvestigationAt(0, e.target.value)}
                  placeholder="e.g. 3rd of 6 laser toning sessions, review pigmentation"
                  rows={2}
                  className="mt-2 bg-background"
                />
              </div>
            )}
          </div>
            </TabsContent>

            <TabsContent value="medical" className="space-y-3 mt-4">
              <div className="flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Medical Information</span>
                <span className="text-[11px] text-muted-foreground">(pre-filled from the patient's saved record — edit as needed for this visit, and it's saved back when you save the procedure)</span>
              </div>
              {patientId ? medicalSection : (
                <p className="text-sm text-muted-foreground py-8 text-center">Select a patient to view medical information.</p>
              )}
            </TabsContent>

            <TabsContent value="surveys" className="space-y-3 mt-4">
              {patientId ? (
                <SurveyHistoryPanel patientId={patientId} appointmentId={appointmentId || null} />
              ) : (
                <p className="text-sm text-muted-foreground">Select a patient to see their surveys.</p>
              )}
            </TabsContent>

            <TabsContent value="knowledge" className="mt-4">
              {patientId ? (
                <ClinicalGuidelines
                  patientId={patientId}
                  serviceIds={serviceLines.map((line) => line.service_id)}
                  serviceNames={linkedAppointment?.service ? [linkedAppointment.service] : []}
                  onCopyCare={(text, serviceId) => {
                    const line = serviceLines.find((item) => item.service_id === serviceId);
                    if (line) updateServiceLine(line.key, { recommendations: appendCare(line.recommendations, text) });
                  }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Select a patient to see knowledge articles.</p>
              )}
            </TabsContent>

          </Tabs>

          <Button
            className="w-full"
            onClick={() => {
              // Asked, not refused: writing up last night's clinic this
              // morning is ordinary and has to stay possible.
              if (
                visitDay.mismatched &&
                !window.confirm(
                  `This prescription will be filed under the visit on ${visitDay.dayLabel}, not today.\n\nSave it there anyway?`,
                )
              ) {
                return;
              }
              createMutation.mutate();
            }}
            disabled={!patientId || createMutation.isPending}
          >
            {createMutation.isPending ? "Saving..." : "Save Procedure"}
          </Button>
        </div>
  );

  if (asPage) {
    return <div className="w-full">{body}</div>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen sm:rounded-none overflow-y-auto p-6 grid-cols-[minmax(0,1fr)] content-start">
        <DialogHeader>
          <DialogTitle className="font-display">New Prescription</DialogTitle>
        </DialogHeader>
        <div className="mx-auto w-full min-w-0 max-w-5xl">{body}</div>
      </DialogContent>
    </Dialog>
  );
}
