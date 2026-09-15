import { useState, useEffect, useRef } from "react";
import { Plus, Pill, Wrench, Check, Sparkles, Loader2, Mic, MicOff, ChevronsUpDown, HeartPulse, ClipboardCheck, CalendarClock, Repeat, StickyNote } from "lucide-react";
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
import { ProcedureStickyNotes, type DraftNote } from "@/components/procedures/ProcedureStickyNotes";
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

const MEDICAL_FIELDS: [string, string][] = [
  ["symptoms", "Symptoms"],
  ["diagnosis", "Diagnosis"],
  ["lab_tests", "Lab Tests"],
  ["medical_history", "Medical History"],
  ["current_medications", "Current Medications"],
  ["allergies", "Allergies"],
  ["previous_treatments", "Previous Treatments"],
  ["skin_type", "Skin Type"],
  ["skin_concerns", "Skin Concerns"],
];

/** Visit-specific clinical fields: stored on the procedure, not on the patient record. */
const PROCEDURE_MEDICAL_FIELDS = ["symptoms", "diagnosis", "lab_tests"];

// patients.skin_type has a DB check constraint restricting it to these
// exact values - must stay a dropdown, not free text, or saving fails.
const SKIN_TYPE_OPTIONS = ["Normal", "Dry", "Oily", "Combination", "Sensitive"];
// Skin Type is a constrained dropdown, not free text, so it's excluded from
// AI elaboration (which would turn it into a sentence and break the constraint).
const ELABORATABLE_MEDICAL_FIELDS = MEDICAL_FIELDS.filter(([field]) => field !== "skin_type");

interface PrescriptionInput {
  product_id: string;
  medicine_name: string;
  frequency: string;
  duration: string;
  instructions: string;
  quantity: number;
}

interface StockInfo {
  available: number;
  loading: boolean;
}

interface AssetInput {
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
  defaultServiceName?: string;
  defaultProblemAreaIds?: string[];
  /** Render inline (full page) instead of inside a modal dialog */
  asPage?: boolean;
  onSaved?: (procedureId: string) => void;
}

export function ProcedureFormDialog({
  open, onOpenChange,
  defaultPatientId, defaultAppointmentId, defaultStaffId, defaultServiceName, defaultProblemAreaIds,
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
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([
    { key: `svc-${Date.now()}`, service_id: "", name: defaultServiceName || "", procedure_notes: "", recommendations: "", material_percent: "", price: 0 },
  ]);

  const [nextAppointmentAt, setNextAppointmentAt] = useState("");
  const [visitType, setVisitType] = useState<"Single" | "Recurring">("Single");
  const [recurringCount, setRecurringCount] = useState(2);
  const [recurringDates, setRecurringDates] = useState<string[]>(["", ""]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionInput[]>([]);
  const [stockMap, setStockMap] = useState<Record<number, StockInfo>>({});
  const [procedureAssets, setProcedureAssets] = useState<AssetInput[]>([]);
  // Notes typed before the procedure exists. procedure_sticky_notes.procedure_id is NOT NULL,
  // so these are buffered here and flushed once the procedure row has an id.
  const [draftNotes, setDraftNotes] = useState<DraftNote[]>([]);
  const [autoFilled, setAutoFilled] = useState(false);

  // Unified AI bar state
  const [dictation, setDictation] = useState("");
  const [parsing, setParsing] = useState(false);
  const [elaboratingAll, setElaboratingAll] = useState(false);
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
          product_id: "",
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
        .select("id, medical_history, current_medications, allergies, skin_type, skin_concerns, previous_treatments")
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
      allergies: patientRecord.allergies || "",
      skin_type: patientRecord.skin_type || "",
      skin_concerns: patientRecord.skin_concerns || "",
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

  const { data: products = [] } = useQuery({
    queryKey: ["pharma-products-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pharma_products")
        .select("id, name, default_frequency, default_duration, default_instructions")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: allAssets = [] } = useQuery({
    queryKey: ["assets-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase.from("assets").select("id, name").eq("status", "Active").order("name");
      if (error) throw error;
      return data;
    },
  });

  const addServiceLine = () =>
    setServiceLines((prev) => [
      ...prev,
      { key: `svc-${Date.now()}-${prev.length}`, service_id: "", name: "", procedure_notes: "", recommendations: "", material_percent: "", price: 0 },
    ]);

  const removeServiceLine = (key: string) =>
    setServiceLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)));

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
            product_id: m.product_id,
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
            asset_id: a.asset_id,
            asset_name: a.assets?.name || "",
            usage_guideline: a.usage_guideline || "",
            time_taken: a.time_taken ? String(a.time_taken) : "",
          });
        }
        return next;
      });
    }
    setAutoFilled(true);
    toast.info("Procedure & recommendations auto-filled from Service Master — you can edit them.");
  };

  // When a service is selected from dropdown
  const handleServiceSelect = async (svcId: string, lineKey: string) => {
    const svc = services.find((s: any) => s.id === svcId);
    if (svc) await applyServiceData(svc, svcId, lineKey);
  };

  // Auto-match defaultServiceName on first load
  if (defaultServiceName && services.length > 0 && !autoFilled && !serviceLines[0]?.service_id) {
    const match = services.find((s: any) => s.name === defaultServiceName);
    if (match) {
      applyServiceData(match, match.id, serviceLines[0].key);
    }
  }


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
        if (!rx.product_id) continue;
        const { data: invData } = await supabase.from("pharma_inventory").select("quantity").eq("product_id", rx.product_id);
        const { data: rxData } = await supabase.from("prescriptions").select("quantity").eq("product_id", rx.product_id);
        const totalStock = (invData || []).reduce((s, i) => s + Number(i.quantity), 0);
        const consumed = (rxData || []).reduce((s, i) => s + Number(i.quantity), 0);
        if (Math.max(0, totalStock - consumed) === 0) {
          toast.warning(`Insufficient stock for ${rx.medicine_name}. Please add stock.`);
        }
      }

      const cleanLines = serviceLines.filter((l) => (l.name || "").trim());
      const effectiveLines = cleanLines.length
        ? cleanLines
        : [{ key: "default", service_id: "", name: "Consultation", procedure_notes: "", recommendations: "", material_percent: "", price: 0 }];
      const combine = (field: "procedure_notes" | "recommendations") =>
        effectiveLines
          .filter((l) => (l[field] || "").trim())
          .map((l) => (effectiveLines.length > 1 ? `${l.name}: ${l[field]}` : l[field]))
          .join("\n\n");

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
          appointment_id: appointmentId || null,
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

      const { error: svcErr } = await supabase.from("procedure_services").insert(
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


      if (prescriptions.length > 0) {

        const rxRows = prescriptions
          .filter((rx) => rx.medicine_name || (rx.product_id && rx.product_id !== OTHERS_VALUE))
          .map((rx) => ({
            procedure_id: proc.id,
            product_id: rx.product_id === OTHERS_VALUE ? null : (rx.product_id || null),
            medicine_name: rx.medicine_name,
            dosage: "",
            frequency: rx.frequency,
            duration: rx.duration,
            instructions: rx.instructions,
            quantity: rx.quantity,
          }));
        if (rxRows.length > 0) {
          const { error: rxErr } = await supabase.from("prescriptions").insert(rxRows);
          if (rxErr) throw rxErr;
        }
      }

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
          .update({
            medical_history: medical.medical_history || null,
            current_medications: medical.current_medications || null,
            allergies: medical.allergies || null,
            skin_type: medical.skin_type || null,
            skin_concerns: medical.skin_concerns || null,
            previous_treatments: medical.previous_treatments || null,
          })
          .eq("id", patientId);
        if (medErr) throw medErr;
      }

      // Follow-up appointment(s) picked by the doctor
      const followUpDates =
        visitType === "Recurring"
          ? recurringDates.filter(Boolean)
          : nextAppointmentAt
            ? [nextAppointmentAt]
            : [];
      if (followUpDates.length > 0 && patientId) {
        const p = (patients as any[]).find((x) => x.id === patientId);
        const rows = followUpDates.map((d) => {
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
    setPrescriptions([...prescriptions, { product_id: "", medicine_name: "", frequency: "", duration: "", instructions: "", quantity: 1 }]);
  };

  const fetchStock = async (productId: string, index: number) => {
    setStockMap((prev) => ({ ...prev, [index]: { available: 0, loading: true } }));
    // Inventory rows are decremented at the point of sale, so they already reflect live stock.
    const { data: invData } = await supabase
      .from("pharma_inventory")
      .select("quantity")
      .eq("product_id", productId);
    const totalStock = (invData || []).reduce((s, i) => s + Number(i.quantity), 0);
    setStockMap((prev) => ({ ...prev, [index]: { available: Math.max(0, totalStock), loading: false } }));
  };

  const updatePrescription = (index: number, field: keyof PrescriptionInput, value: string | number) => {
    const updated = [...prescriptions];
    if (field === "product_id") {
      if (value === OTHERS_VALUE) {
        updated[index].product_id = OTHERS_VALUE;
        updated[index].medicine_name = "";
      } else {
        const prod = products.find((p) => p.id === value) as any;
        updated[index].product_id = value as string;
        updated[index].medicine_name = prod?.name || "";
        // Always populate prescription defaults from the product master when medicine is selected
        updated[index].frequency = prod?.default_frequency || "";
        updated[index].duration = prod?.default_duration || "";
        updated[index].instructions = prod?.default_instructions || "";
        fetchStock(value as string, index);
      }
    } else {
      (updated[index] as any)[field] = value;
    }
    setPrescriptions(updated);
  };

  const removePrescription = (index: number) => {
    setPrescriptions(prescriptions.filter((_, i) => i !== index));
  };

  const addAsset = () => setProcedureAssets([...procedureAssets, { asset_id: "", asset_name: "", usage_guideline: "", time_taken: "" }]);
  const updateAsset = (index: number, field: keyof AssetInput, value: string) => {
    const updated = [...procedureAssets];
    (updated[index] as any)[field] = value;
    if (field === "asset_id") { updated[index].asset_name = allAssets.find((a) => a.id === value)?.name || ""; }
    setProcedureAssets(updated);
  };
  const removeAsset = (index: number) => setProcedureAssets(procedureAssets.filter((_, i) => i !== index));

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
                  onChange={(e) => { setMedical((m) => ({ ...m, [field]: e.target.value })); setMedicalDirty(true); }}
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
            <TabsList>
              <TabsTrigger value="procedure">Procedure</TabsTrigger>
              <TabsTrigger value="surveys" className="gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" /> Surveys
              </TabsTrigger>
              <TabsTrigger value="medical" className="gap-1.5">
                <HeartPulse className="h-3.5 w-3.5" /> Medical Information
              </TabsTrigger>
              <TabsTrigger value="notes" className="gap-1.5">
                <StickyNote className="h-3.5 w-3.5" /> Notes
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
              <Popover>
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
                  {serviceLines.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => removeServiceLine(line.key)}>
                      Remove
                    </Button>
                  )}
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      <span className="truncate">{line.name || "Select service"}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search service..." />
                      <CommandList>
                        <CommandEmpty>No service found.</CommandEmpty>
                        <CommandGroup>
                          {services.map((s: any) => (
                            <CommandItem key={s.id} value={s.name} onSelect={() => handleServiceSelect(s.id, line.key)}>
                              <Check className={`mr-2 h-4 w-4 ${line.service_id === s.id ? "opacity-100" : "opacity-0"}`} />
                              {s.name}
                            </CommandItem>
                          ))}
                          <CommandItem value="Others" onSelect={() => updateServiceLine(line.key, { service_id: OTHERS_VALUE, name: "" })}>
                            <Check className={`mr-2 h-4 w-4 ${line.service_id === OTHERS_VALUE ? "opacity-100" : "opacity-0"}`} />
                            Others (type manually)
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {line.service_id === OTHERS_VALUE && (
                  <Input
                    placeholder="Service / procedure name"
                    value={line.name}
                    onChange={(e) => updateServiceLine(line.key, { name: e.target.value })}
                  />
                )}
                <div>
                  <Label className="text-xs text-muted-foreground">Procedure Notes</Label>
                  <Textarea
                    rows={3}
                    className={`mt-1 transition-all ${recentlyFilled.procedure_notes ? "ring-2 ring-primary/40" : ""} ${elaboratingAll ? "opacity-60" : ""}`}
                    placeholder="Details of the procedure performed..."
                    value={line.procedure_notes}
                    onChange={(e) => updateServiceLine(line.key, { procedure_notes: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Recommendations</Label>
                  <Textarea
                    rows={3}
                    className={`mt-1 transition-all ${recentlyFilled.recommendations ? "ring-2 ring-primary/40" : ""} ${elaboratingAll ? "opacity-60" : ""}`}
                    placeholder="Post-procedure recommendations..."
                    value={line.recommendations}
                    onChange={(e) => updateServiceLine(line.key, { recommendations: e.target.value })}
                  />
                </div>
              </div>
            ))}
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
                        {new Date(s.created_at).toLocaleDateString()} · {s.dr_status || "pending"}
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
                <Pill className="h-4 w-4" /> Pharmacy — Prescriptions
              </Label>
              <Button type="button" variant="outline" size="sm" onClick={addPrescription}>
                <Plus className="h-3 w-3 mr-1" /> Add Medicine
              </Button>
            </div>
            {prescriptions.map((rx, i) => (
              <div key={i} className="border rounded-lg p-3 mb-3 space-y-2 bg-background">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Medicine {i + 1}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => removePrescription(i)}>Remove</Button>
                </div>
                <div>
                  <Select value={rx.product_id} onValueChange={(v) => updatePrescription(i, "product_id", v)}>
                    <SelectTrigger><SelectValue placeholder="Select medicine *" /></SelectTrigger>
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
                      onChange={(e) => updatePrescription(i, "medicine_name", e.target.value)}
                    />
                  )}
                  {rx.product_id && rx.product_id !== OTHERS_VALUE && stockMap[i] && (
                    stockMap[i].loading ? (
                      <p className="text-xs text-muted-foreground mt-1">Checking stock...</p>
                    ) : stockMap[i].available <= 0 ? (
                      <p className="text-xs text-amber-600 mt-1">⚠️ This medicine is currently out of stock</p>
                    ) : (
                      <p className="text-xs text-green-600 mt-1">Available stock: {stockMap[i].available} units</p>
                    )
                  )}
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Frequency</label>
                      <div className="relative">
                        <Input placeholder="e.g. Twice a day" value={rx.frequency} onChange={(e) => updatePrescription(i, "frequency", e.target.value)} className="pr-9" />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2">
                          <MicButton value={rx.frequency} onChange={(v) => updatePrescription(i, "frequency", v)} mode="replace" />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Duration</label>
                      <div className="relative">
                        <Input placeholder="e.g. 7 days" value={rx.duration} onChange={(e) => updatePrescription(i, "duration", e.target.value)} className="pr-9" />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2">
                          <MicButton value={rx.duration} onChange={(v) => updatePrescription(i, "duration", v)} mode="replace" />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Qty</label>
                      <Input type="number" placeholder="1" value={rx.quantity || ""} onChange={(e) => updatePrescription(i, "quantity", e.target.value === "" ? 0 : Math.max(1, parseInt(e.target.value) || 1))} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Special Instructions</label>
                    <div className="relative">
                      <Input placeholder="e.g. Apply after cleansing" value={rx.instructions} onChange={(e) => updatePrescription(i, "instructions", e.target.value)} className="pr-9" />
                      <div className="absolute right-1 top-1/2 -translate-y-1/2">
                        <MicButton value={rx.instructions} onChange={(v) => updatePrescription(i, "instructions", v)} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
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
              <div key={i} className="border rounded-lg p-3 mb-3 space-y-2 bg-background">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Asset {i + 1}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => removeAsset(i)}>Remove</Button>
                </div>
                <Select value={asset.asset_id} onValueChange={(v) => updateAsset(i, "asset_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
                  <SelectContent>
                    {allAssets.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Usage guideline" value={asset.usage_guideline} onChange={(e) => updateAsset(i, "usage_guideline", e.target.value)} />
                  <Input type="number" placeholder="Time taken (mins)" value={asset.time_taken} onChange={(e) => updateAsset(i, "time_taken", e.target.value)} />
                </div>
              </div>
            ))}
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
                    value={recurringCount}
                    onChange={(e) => setRecurringCountSafe(parseInt(e.target.value, 10))}
                    className="mt-1.5 bg-background"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Array.from({ length: recurringCount }).map((_, i) => (
                    <div key={i}>
                      <Label className="text-xs text-muted-foreground">Visit # {i + 1}</Label>
                      <Input
                        type="datetime-local"
                        value={recurringDates[i] || ""}
                        onChange={(e) => {
                          const next = [...recurringDates];
                          next[i] = e.target.value;
                          setRecurringDates(next);
                        }}
                        className="mt-1 bg-background"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Each date creates a <span className="font-medium">Reserved</span> appointment. Dates left blank can be added later during billing.
                </p>
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

            <TabsContent value="notes" className="space-y-3 mt-4">
              <ProcedureStickyNotes notes={draftNotes} onNotesChange={setDraftNotes} />
            </TabsContent>
          </Tabs>

          <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!patientId || createMutation.isPending}>
            {createMutation.isPending ? "Saving..." : "Save Procedure"}
          </Button>
        </div>
  );

  if (asPage) {
    return <div className="w-full">{body}</div>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen sm:rounded-none overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="font-display">New Procedure / Prescription</DialogTitle>
        </DialogHeader>
        <div className="mx-auto w-full max-w-5xl">{body}</div>
      </DialogContent>
    </Dialog>
  );
}
