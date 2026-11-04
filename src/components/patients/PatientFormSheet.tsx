import { useState, useEffect } from "react";
import { X, Search, Check, ChevronsUpDown, Plus, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/shared/DateInput";
import { patientAgeLabel } from "@/lib/patientIdentity";
import { Label } from "@/components/ui/label";
import {
  ConsultationReasonPicker,
  buildConsultationReasonsForSave,
  normaliseConsultationType,
  parseConsultationReasonsForEdit,
  type ConsultationType,
} from "@/components/appointments/ConsultationReasonPicker";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useValidator } from "@/hooks/useValidationRules";
import { useCustomFields } from "@/lib/custom-fields/api";
import { CustomFieldsRenderer, validateCustomFields } from "@/components/custom-fields/CustomFieldsRenderer";
import { PATIENT_SOURCE_OPTIONS, optionsIncluding } from "@/lib/patientSourceOptions";
import { referralKind, referrerStillApplies, referringPatientId } from "@/lib/patientReferral";
import { PatientCombobox } from "./PatientCombobox";
import { ReferringDoctorPicker } from "./ReferringDoctorPicker";
import type { ValidationMessage } from "@/lib/validation/engine";
import { AlertCircle } from "lucide-react";
import { Sparkles, Loader2 } from "lucide-react";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { findDuplicates, type DuplicateMatch } from "@/lib/duplicates/engine";
import DuplicateNotificationBand from "@/components/duplicates/DuplicateNotificationBand";
import DuplicateResolveDialog from "@/components/duplicates/DuplicateResolveDialog";


type Patient = Tables<"patients">;

const FAMILY_RELATIONSHIPS = [
  "Spouse", "Father", "Mother", "Son", "Daughter",
  "Brother", "Sister", "Grandfather", "Grandmother",
  "Uncle", "Aunt", "Cousin", "Friend", "In-Law", "Other",
];

type FamilyRow = {
  id?: string;
  name: string;
  relationship: string;
  phone: string;
  is_primary_contact: boolean;
  linked: boolean;
};

interface PatientFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient?: Patient | null;
  defaultValues?: Partial<Patient> | null;
  /**
   * Given the patient that was saved, so a caller can go somewhere useful.
   * `created` distinguishes a new registration from an edit - the Patients page
   * opens the new patient's record, which is where the front desk goes next to
   * book them in, and does not move on an edit.
   */
  onSuccess: (saved?: { id: string; created: boolean }) => void;
}

const emptyForm: TablesInsert<"patients"> = {
  first_name: "",
  last_name: "",
  date_of_birth: null,
  gender: null,
  phone: null,
  alternate_phone: null,
  email: null,
  address: null,
  city: null,
  state: null,
  pincode: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  blood_group: null,
  medical_history: null,
  current_medications: null,
  allergies: null,
  skin_type: null,
  skin_concerns: null,
  previous_treatments: null,
  notes: null,
  status: "Active",
  facebook_url: null,
  instagram_url: null,
  follows_facebook: false,
  follows_instagram: false,
  source: "Walk-in",
  source_ad_details: null,
  source_referral_doctor: null,
  source_other_text: null,
  consultation_type: null,
  consultation_reasons: null,
};

export function PatientFormSheet({ open, onOpenChange, patient, defaultValues, onSuccess }: PatientFormSheetProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TablesInsert<"patients">>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);

  // Reason for Consultation. The tag list and the two "Others" boxes are edited
  // separately and folded into form.consultation_reasons on save.
  const [consultationReasons, setConsultationReasons] = useState<string[]>([]);
  const [othersAestheticText, setOthersAestheticText] = useState("");
  const [othersClinicalText, setOthersClinicalText] = useState("");
  const [familyRows, setFamilyRows] = useState<FamilyRow[]>([]);
  const [activeTab, setActiveTab] = useState("personal");
  const [removedFamilyIds, setRemovedFamilyIds] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [liveMatches, setLiveMatches] = useState<DuplicateMatch[]>([]);
  const [resolveWith, setResolveWith] = useState<Record<string, any> | null>(null);

  const [duplicateAck, setDuplicateAck] = useState(false);
  const [familyExisting, setFamilyExisting] = useState<Record<string, any>>({});
  const { toast } = useToast();
  const isEditing = !!patient;



  useEffect(() => {
    if (patient) {
      setForm({
        first_name: patient.first_name,
        last_name: patient.last_name,
        date_of_birth: patient.date_of_birth,
        gender: patient.gender,
        phone: patient.phone,
        alternate_phone: patient.alternate_phone,
        email: patient.email,
        address: patient.address,
        city: patient.city,
        state: patient.state,
        pincode: patient.pincode,
        emergency_contact_name: patient.emergency_contact_name,
        emergency_contact_phone: patient.emergency_contact_phone,
        blood_group: patient.blood_group,
        medical_history: patient.medical_history,
        current_medications: patient.current_medications,
        allergies: patient.allergies,
        skin_type: patient.skin_type,
        skin_concerns: patient.skin_concerns,
        previous_treatments: patient.previous_treatments,
        notes: patient.notes,
        status: patient.status,
        facebook_url: (patient as any).facebook_url || null,
        instagram_url: (patient as any).instagram_url || null,
        follows_facebook: (patient as any).follows_facebook || false,
        follows_instagram: (patient as any).follows_instagram || false,
        source: (patient as any).source || "Walk-in",
        source_ad_details: (patient as any).source_ad_details || null,
        source_referral_doctor: (patient as any).source_referral_doctor || null,
        source_other_text: (patient as any).source_other_text || null,
        doctor_id: (patient as any).doctor_id || null,
        consultation_type: patient.consultation_type ?? null,
        consultation_reasons: patient.consultation_reasons ?? null,
      });
      // Unpack the stored reasons, or editing and saving a patient would drop
      // whatever was typed into "Others".
      {
        const parsed = parseConsultationReasonsForEdit(patient.consultation_reasons);
        setConsultationReasons(parsed.reasons);
        setOthersAestheticText(parsed.othersAestheticText);
        setOthersClinicalText(parsed.othersClinicalText);
      }
    } else if (defaultValues) {
      setForm({
        ...emptyForm,
        first_name: defaultValues.first_name || "",
        last_name: defaultValues.last_name || "",
        phone: defaultValues.phone || null,
        email: defaultValues.email || null,
      });
    } else {
      setForm(emptyForm);
    }
    // Reset the consultation-reason state whenever the sheet is not loading an
    // existing patient, so tags from a previously edited patient don't bleed
    // into a new (or default-values) patient and get saved onto their record.
    if (!patient) {
      setConsultationReasons([]);
      setOthersAestheticText("");
      setOthersClinicalText("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient?.id, open]);

  // Load existing campaign links when editing
  useEffect(() => {
    if (!open) {
      setSelectedCampaignIds([]);
      return;
    }
    if (patient) {
      (async () => {
        const { data } = await (supabase.from("patient_campaigns") as any)
          .select("campaign_id")
          .eq("patient_id", patient.id);
        setSelectedCampaignIds(((data as any[]) || []).map((r) => r.campaign_id));
      })();
    } else {
      setSelectedCampaignIds([]);
    }
  }, [patient, open]);

  const updateField = (field: keyof typeof form, value: string | null) => {
    setForm((prev) => ({ ...prev, [field]: value || null }));
  };

  const validate = useValidator("patients");
  const [validationMessages, setValidationMessages] = useState<ValidationMessage[]>([]);
  const [elaborating, setElaborating] = useState<string | null>(null);

  const elaborateField = async (field: keyof typeof form, label: string) => {
    const currentText = ((form as any)[field] || "").toString();
    if (!currentText.trim()) {
      toast({ title: "Add a few words first", description: `Type a short note in ${label} and AI will complete it.` });
      return;
    }
    setElaborating(field as string);
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "AI request failed" }));
        throw new Error(err.error || "AI request failed");
      }
      const { text } = await res.json();
      if (text) setForm((prev) => ({ ...prev, [field]: text }));
      toast({ title: "Text elaborated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to elaborate", variant: "destructive" });
    } finally {
      setElaborating(null);
    }
  };

  const ElaborateButton = ({ field, label }: { field: keyof typeof form; label: string }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-[11px] gap-1 text-primary hover:text-primary"
      disabled={elaborating === field}
      onClick={() => elaborateField(field, label)}
    >
      {elaborating === field ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
      Elaborate with AI
    </Button>
  );

  // Admin-configured custom fields
  const { data: customFieldDefs = [] } = useCustomFields("patients", true);
  const [customValues, setCustomValues] = useState<Record<string, any>>({});
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, any> = {};
    for (const f of customFieldDefs) {
      next[f.column_name] = patient ? (patient as any)[f.column_name] ?? null : null;
    }
    setCustomValues(next);
    setCustomErrors({});
  }, [open, patient, customFieldDefs]);

  // Load existing family members when editing
  useEffect(() => {
    if (!open) return;
    setRemovedFamilyIds([]);
    if (!patient?.id) {
      setFamilyRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("patient_family_members")
        .select("id, name, relationship, phone, is_primary_contact, related_patient_id, related_patient:patients!patient_family_members_related_patient_id_fkey(first_name, last_name, phone)")
        .eq("patient_id", patient.id);
      if (cancelled) return;
      setFamilyRows(
        ((data as any[]) || []).map((r) => ({
          id: r.id,
          name: r.name || (r.related_patient ? `${r.related_patient.first_name || ""} ${r.related_patient.last_name || ""}`.trim() : ""),
          relationship: r.relationship || "",
          phone: r.phone || r.related_patient?.phone || "",
          is_primary_contact: !!r.is_primary_contact,
          linked: !!r.related_patient_id,
        })),
      );
    })();
    return () => { cancelled = true; };
  }, [open, patient?.id]);

  const updateFamilyRow = (idx: number, patch: Partial<FamilyRow>) =>
    setFamilyRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  // Live duplicate detection driven by the admin-configured duplicate rules
  useEffect(() => {
    if (!open) return;
    const phone = (form.phone || "").trim();
    const email = (form.email || "").trim();
    const name = (form.first_name || "").trim();
    if (phone.length < 6 && email.length < 5 && name.length < 3) {
      setLiveMatches([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const matches = await findDuplicates("patients", form as Record<string, any>, {
          excludeId: patient?.id ?? null,
        });
        if (!cancelled) {
          setLiveMatches(matches);
          setDuplicateAck(false);
        }
      } catch {
        if (!cancelled) setLiveMatches([]);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, form.phone, form.email, form.first_name, form.last_name, patient?.id]);


  // Flag family members who are already existing patients
  useEffect(() => {
    if (!open) return;
    const phones = familyRows.map((r) => (r.phone || "").trim()).filter((p) => p.length >= 6);
    if (phones.length === 0) { setFamilyExisting({}); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone")
        .or(phones.map((p) => `phone.ilike.%${p}%`).join(","))
        .limit(20);
      if (cancelled) return;
      const map: Record<string, any> = {};
      for (const p of phones) {
        const hit = ((data as any[]) || []).find(
          (row) => (row.phone || "").includes(p) && row.id !== patient?.id,
        );
        if (hit) map[p] = hit;
      }
      setFamilyExisting(map);
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, familyRows, patient?.id]);

  const removeFamilyRow = (idx: number) =>
    setFamilyRows((prev) => {
      const row = prev[idx];
      if (row?.id) setRemovedFamilyIds((ids) => [...ids, row.id!]);
      return prev.filter((_, i) => i !== idx);
    });

  const saveFamilyRows = async (patientId: string) => {
    if (removedFamilyIds.length) {
      await supabase.from("patient_family_members").delete().in("id", removedFamilyIds);
    }
    const valid = familyRows.filter((r) => r.name.trim() && r.relationship);
    for (const row of valid) {
      const payload = {
        name: row.name.trim(),
        relationship: row.relationship,
        phone: row.phone.trim() || null,
        is_primary_contact: row.is_primary_contact,
      };
      if (row.id) {
        await supabase.from("patient_family_members").update(payload).eq("id", row.id);
      } else {
        await supabase.from("patient_family_members").insert({ ...payload, patient_id: patientId });
      }
    }
  };

  // No duplicate gate here. This used to re-run findDuplicates and return
  // early on ANY match, whatever its severity, diverting into a modal whose
  // "save anyway" button was itself hidden for blocking rules - so a patient
  // sharing a family phone number could not be registered at all. The live
  // band above the form is the whole warning now.
  const handleSave = async () => {
    if (!form.first_name.trim()) {
      toast({ title: "Error", description: "First name is required", variant: "destructive" });
      return;
    }

    const cfErrors = validateCustomFields(customFieldDefs, customValues);
    setCustomErrors(cfErrors);
    if (Object.keys(cfErrors).length) {
      toast({ title: "Validation failed", description: String(Object.values(cfErrors)[0]), variant: "destructive" });
      return;
    }

    // Admin-configured validation rules
    const messages = validate(form as Record<string, any>, { isEdit: isEditing });
    setValidationMessages(messages);
    const blocking = messages.filter((m) => m.severity === "error");
    if (blocking.length) {
      toast({ title: "Validation failed", description: blocking[0].message, variant: "destructive" });
      return;
    }
    messages
      .filter((m) => m.severity === "alert")
      .forEach((m) => toast({ title: "Alert", description: m.message }));

    setSaving(true);
    try {
      let patientId: string | null = patient?.id || null;
      const payload = {
        ...form,
        // The picker's cleared state is the literal string "None"; stored as-is
        // it would read back as a consultation type of "None".
        consultation_type: normaliseConsultationType(form.consultation_type),
        consultation_reasons: consultationReasons.length
          ? buildConsultationReasonsForSave(consultationReasons, othersAestheticText, othersClinicalText)
          : null,
        ...customValues,
      } as any;
      if (isEditing && patient) {
        const { error } = await supabase
          .from("patients")
          .update(payload)
          .eq("id", patient.id);
        if (error) throw error;
        toast({ title: "Patient updated successfully" });
      } else {
        const { data: created, error } = await supabase.from("patients").insert(payload).select("id").single();
        if (error) throw error;
        patientId = (created as any)?.id || null;
        toast({ title: "Patient created successfully" });
      }

      // Sync patient_campaigns links
      if (patientId) {
        const desiredIds = (form as any).source === "Campaign" ? selectedCampaignIds : [];
        const { data: existingLinks } = await (supabase.from("patient_campaigns") as any)
          .select("campaign_id")
          .eq("patient_id", patientId);
        const existing = new Set(((existingLinks as any[]) || []).map((r) => r.campaign_id));
        const desired = new Set(desiredIds);
        const toAdd = [...desired].filter((cid) => !existing.has(cid));
        const toRemove = [...existing].filter((cid) => !desired.has(cid));
        if (toAdd.length) {
          const { data: userRes } = await supabase.auth.getUser();
          const linkedBy = userRes?.user?.id || null;
          await (supabase.from("patient_campaigns") as any).insert(
            toAdd.map((cid) => ({ patient_id: patientId, campaign_id: cid, linked_by: linkedBy })),
          );
        }
        if (toRemove.length) {
          await (supabase.from("patient_campaigns") as any)
            .delete()
            .eq("patient_id", patientId)
            .in("campaign_id", toRemove);
        }
      }

      if (patientId) {
        await saveFamilyRows(patientId);
      }

      // The patient list the booking, billing, procedure and photo screens
      // each read is one cached query that nothing here ever refreshed, so a
      // patient created on this page was invisible to them for a minute -
      // which is exactly the window the front desk books in. The booking now
      // reads the patient by id regardless (bookingPatient.ts); this stops
      // every other screen showing a list without them.
      queryClient.invalidateQueries({ queryKey: ["patients-list"] });
      // Or a patient registered just now is missing from every picker's
      // unsearched list until its five minutes of staleness run out.
      queryClient.invalidateQueries({ queryKey: ["patients-combobox-initial"] });
      onSuccess(patientId ? { id: patientId, created: !isEditing } : undefined);
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <DuplicateResolveDialog
      open={!!resolveWith && !!patient}
      onClose={() => setResolveWith(null)}
      primary={(patient as any) || null}
      duplicate={resolveWith}
      onResolved={() => { setResolveWith(null); setLiveMatches([]); onSuccess(); }}
    />

    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {isEditing ? "Edit Patient" : "Add New Patient"}
          </DialogTitle>
        </DialogHeader>

        {validationMessages.length > 0 && (
          <div className="mt-4 space-y-2">
            {validationMessages.map((m, i) => (
              <div
                key={i}
                className={
                  "flex items-start gap-2 rounded-md border px-3 py-2 text-xs " +
                  (m.severity === "error"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400")
                }
              >
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{m.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* duplicateAck was set in two places and read in none, so dismissing
            only worked until the next keystroke re-ran the check. It hides the
            band now, and the live check clears it when a fresh match arrives,
            so editing the phone brings the warning back. */}
        {liveMatches.length > 0 && !duplicateAck && (
          <DuplicateNotificationBand
            className="mt-4"
            matches={liveMatches}
            objectKey="patients"
            onIgnore={() => setDuplicateAck(true)}
            onResolve={(rec) => setResolveWith(rec)}
          />
        )}


        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="personal" className="text-xs">Personal</TabsTrigger>
            <TabsTrigger value="medical" className="text-xs">Medical</TabsTrigger>
            <TabsTrigger value="social" className="text-xs">Social</TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>First Name *</Label>
                <Input
                  value={form.first_name}
                  onChange={(e) => updateField("first_name", e.target.value)}
                  placeholder="John"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input
                  value={form.last_name}
                  onChange={(e) => updateField("last_name", e.target.value)}
                  placeholder="Doe"
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <div>
                <Label>Date of Birth</Label>
                <DateInput
                  value={form.date_of_birth || ""}
                  onChange={(iso) => updateField("date_of_birth", iso)}
                  className="mt-1.5"
                />
              </div>
              <div>
                {/* Read, not asked for: the age the record will show, worked
                    out by the same function as the patient page, so a year
                    typed wrong is obvious here rather than three screens
                    later. Nothing is stored - there is no age column. */}
                <Label htmlFor="patient-age">Age</Label>
                <Input
                  id="patient-age"
                  readOnly
                  tabIndex={-1}
                  aria-readonly="true"
                  className="mt-1.5 bg-muted/50 text-muted-foreground"
                  value={patientAgeLabel(form.date_of_birth)}
                  placeholder="—"
                />
              </div>
              <div>
                <Label>Gender</Label>
                <Select
                  value={form.gender || ""}
                  onValueChange={(v) => updateField("gender", v)}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                    <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>Phone</Label>
                <Input
                  value={form.phone || ""}
                  onChange={(e) => updateField("phone", e.target.value)}
                  placeholder="+91 98765 43210"
                  className="mt-1.5"
                />
              </div>
              <div>
                {/* Patients who live abroad give the clinic both numbers, and
                    one field meant the second went into the notes or replaced
                    the first. Searching the patient list finds either. */}
                <Label>Alternate Phone</Label>
                <Input
                  value={form.alternate_phone || ""}
                  onChange={(e) => updateField("alternate_phone", e.target.value)}
                  placeholder="+971 50 123 4567"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email || ""}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="patient@email.com"
                  className="mt-1.5"
                />
              </div>
            </div>

            <Collapsible defaultOpen className="border rounded-md">
              <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50 [&[data-state=open]>svg]:rotate-180">
                Additional Info
                <ChevronDown className="h-4 w-4 transition-transform" />
              </CollapsibleTrigger>
              <CollapsibleContent className="p-3 space-y-4 border-t">
                {/* Address, State, Pincode and the two Emergency Contact boxes
                    are gone: the clinic does not collect them, and State,
                    Pincode and Emergency Contact were empty on all 27,281
                    patients. They stay in the payloads above and below, so an
                    edit here cannot blank the 4,113 addresses already stored -
                    the fields came off the screen, not out of the record.
                    City stays because it was not on the list. */}
                <div>
                  <Label>City</Label>
                  <Input
                    value={form.city || ""}
                    onChange={(e) => updateField("city", e.target.value)}
                    className="mt-1.5"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="border rounded-md p-3">
              <ConsultationReasonPicker
                consultationType={(form.consultation_type || "") as ConsultationType | ""}
                onConsultationTypeChange={(v) => setForm((f) => ({ ...f, consultation_type: v }))}
                consultationReasons={consultationReasons}
                onConsultationReasonsChange={setConsultationReasons}
                othersAestheticText={othersAestheticText}
                setOthersAestheticText={setOthersAestheticText}
                othersClinicalText={othersClinicalText}
                setOthersClinicalText={setOthersClinicalText}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <Select
                  value={form.status || "Active"}
                  onValueChange={(v) => updateField("status", v)}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Source</Label>
                <Select
                  value={(form as any).source || "Walk-in"}
                  onValueChange={(v) => setForm((prev) => ({
                    ...prev,
                    source: v,
                    source_ad_details: v !== "Advertisement" ? null : (prev as any).source_ad_details,
                    // The column holds a doctor's NAME for one kind of referral
                    // and the referring patient's ID for the other, so a switch
                    // between the two has to clear it - a name left in a column
                    // read as an id resolves to nobody. Moving between two
                    // sources of the SAME kind keeps it.
                    source_referral_doctor: referrerStillApplies((prev as any).source, v)
                      ? (prev as any).source_referral_doctor
                      : null,
                    source_other_text: v !== "Other" ? null : (prev as any).source_other_text,
                  }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {/* One list, shared with the patient Details tab - the two
                        had drifted to different options and different wording.
                        A value a record already holds stays on the list, so an
                        imported "Social media" is not silently replaced. */}
                    {optionsIncluding(form.source, PATIENT_SOURCE_OPTIONS).map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(form as any).source === "Advertisement" && (
              <div className="animate-fade-in">
                <Label>Advertisement Details *</Label>
                <Input
                  value={(form as any).source_ad_details || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, source_ad_details: e.target.value || null }))}
                  placeholder="e.g. Google Ads, Facebook campaign, newspaper..."
                  className="mt-1.5"
                />
              </div>
            )}

            {referralKind((form as any).source) === "doctor" && (
              <div className="animate-fade-in">
                <Label>Referred Doctor Name *</Label>
                {/* The same picker the patient Details tab now shows, so a
                    doctor's name is chosen from one list wherever it is set. */}
                <div className="mt-1.5">
                  <ReferringDoctorPicker
                    value={(form as any).source_referral_doctor}
                    onChange={(name) => setForm((prev) => ({ ...prev, source_referral_doctor: name }))}
                  />
                </div>
              </div>
            )}

            {referralKind((form as any).source) === "patient" && (
              <div className="animate-fade-in">
                <Label>Referring Patient *</Label>
                {/* The same picker the Details tab shows, so a referring patient
                    is chosen the same way wherever it is set. The list it
                    replaced read every one of the ~27,000 patients into memory
                    and showed the first 20 by name - which are the records that
                    hold a phone number in the name column, rendered here as a
                    bare phone number with no label at all. */}
                <div className="mt-1.5">
                  <PatientCombobox
                    value={referringPatientId((form as any).source_referral_doctor)}
                    onValueChange={(patientId) =>
                      setForm((prev) => ({ ...prev, source_referral_doctor: patientId }))
                    }
                    placeholder="Select patient..."
                    // Nobody refers themselves.
                    excludeId={patient?.id}
                  />
                </div>
              </div>
            )}

            {(form as any).source === "Campaign" && (
              <div className="animate-fade-in">
                <CampaignMultiSelectField
                  value={selectedCampaignIds}
                  onChange={setSelectedCampaignIds}
                />
              </div>
            )}

            {(form as any).source === "Other" && (
              <div className="animate-fade-in">
                <Label>Specify Source *</Label>
                <Input
                  value={(form as any).source_other_text || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, source_other_text: e.target.value || null }))}
                  placeholder="Specify source…"
                  className="mt-1.5"
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="medical" className="space-y-4 mt-4">
            <div>
              <Label>Blood Group</Label>
              <Select
                value={form.blood_group || ""}
                onValueChange={(v) => updateField("blood_group", v)}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select blood group" />
                </SelectTrigger>
                <SelectContent>
                  {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => (
                    <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label>Medical History</Label>
                <ElaborateButton field="medical_history" label="Medical History" />
              </div>
              <Textarea
                value={form.medical_history || ""}
                onChange={(e) => updateField("medical_history", e.target.value)}
                placeholder="Past surgeries, chronic conditions, hospitalizations..."
                className="mt-1.5"
                rows={4}
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label>Current Medications</Label>
                <ElaborateButton field="current_medications" label="Current Medications" />
              </div>
              <Textarea
                value={form.current_medications || ""}
                onChange={(e) => updateField("current_medications", e.target.value)}
                placeholder="List current medications and dosages..."
                className="mt-1.5"
                rows={3}
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label>Allergies</Label>
                <ElaborateButton field="allergies" label="Allergies" />
              </div>
              <Textarea
                value={form.allergies || ""}
                onChange={(e) => updateField("allergies", e.target.value)}
                placeholder="Drug allergies, food allergies, latex, etc..."
                className="mt-1.5"
                rows={3}
              />
            </div>

            <Collapsible defaultOpen className="border border-primary/30 rounded-md overflow-hidden">
              <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-semibold text-primary bg-primary/5 hover:bg-primary/10 [&[data-state=open]>svg]:rotate-180">
                Dermatology
                <ChevronDown className="h-4 w-4 transition-transform" />
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                <div className="p-3 space-y-4 border-t">
                  <div>
                    <Label>Skin Type</Label>
                    <Select
                      value={form.skin_type || ""}
                      onValueChange={(v) => updateField("skin_type", v)}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Select skin type" />
                      </SelectTrigger>
                      <SelectContent>
                        {["Normal", "Dry", "Oily", "Combination", "Sensitive"].map((st) => (
                          <SelectItem key={st} value={st}>{st}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <Label>Skin Concerns</Label>
                      <ElaborateButton field="skin_concerns" label="Skin Concerns" />
                    </div>
                    <Textarea
                      value={form.skin_concerns || ""}
                      onChange={(e) => updateField("skin_concerns", e.target.value)}
                      placeholder="Acne, pigmentation, aging, scars, rosacea..."
                      className="mt-1.5"
                      rows={3}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <Label>Previous Treatments</Label>
                      <ElaborateButton field="previous_treatments" label="Previous Treatments" />
                    </div>
                    <Textarea
                      value={form.previous_treatments || ""}
                      onChange={(e) => updateField("previous_treatments", e.target.value)}
                      placeholder="Previous dermatological treatments received..."
                      className="mt-1.5"
                      rows={4}
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>

          <TabsContent value="social" className="space-y-4 mt-4">
            <div>
              <Label>Facebook URL</Label>
              <Input
                value={(form as any).facebook_url || ""}
                onChange={(e) => updateField("facebook_url" as any, e.target.value)}
                placeholder="https://facebook.com/username"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Instagram URL</Label>
              <Input
                value={(form as any).instagram_url || ""}
                onChange={(e) => updateField("instagram_url" as any, e.target.value)}
                placeholder="https://instagram.com/username"
                className="mt-1.5"
              />
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="follows-fb"
                  checked={(form as any).follows_facebook || false}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, follows_facebook: !!checked }))}
                />
                <Label htmlFor="follows-fb" className="text-sm cursor-pointer">Follows us on Facebook</Label>
              </div>

              <div className="flex items-center gap-3">
                <Checkbox
                  id="follows-ig"
                  checked={(form as any).follows_instagram || false}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, follows_instagram: !!checked }))}
                />
                <Label htmlFor="follows-ig" className="text-sm cursor-pointer">Follows us on Instagram</Label>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {activeTab === "personal" && (
        <Collapsible defaultOpen className="mt-6 border rounded-md">
          <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/50 [&[data-state=open]>svg]:rotate-180">
            <span className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Family Details</span>
            <ChevronDown className="h-4 w-4 transition-transform" />
          </CollapsibleTrigger>
          <CollapsibleContent className="p-3 space-y-3 border-t">
            {familyRows.length === 0 && (
              <p className="text-xs text-muted-foreground">No family members added yet.</p>
            )}
            {familyRows.map((row, idx) => (
              <div key={row.id || `new-${idx}`} className="rounded-md border p-3 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={row.name}
                      disabled={row.linked}
                      onChange={(e) => updateFamilyRow(idx, { name: e.target.value })}
                      placeholder="Family member name"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Relationship</Label>
                    <Select value={row.relationship} onValueChange={(v) => updateFamilyRow(idx, { relationship: v })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select relationship" /></SelectTrigger>
                      <SelectContent>
                        {FAMILY_RELATIONSHIPS.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Phone</Label>
                    <Input
                      value={row.phone}
                      onChange={(e) => updateFamilyRow(idx, { phone: e.target.value })}
                      placeholder="Phone number"
                      className="mt-1"
                    />
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`fam-primary-${idx}`}
                        checked={row.is_primary_contact}
                        onCheckedChange={(c) => updateFamilyRow(idx, { is_primary_contact: !!c })}
                      />
                      <Label htmlFor={`fam-primary-${idx}`} className="text-sm cursor-pointer">Primary contact</Label>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeFamilyRow(idx)} aria-label="Remove family member">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {row.linked && (
                  <p className="text-[11px] text-muted-foreground">Linked to an existing patient record.</p>
                )}
                {!row.linked && familyExisting[(row.phone || "").trim()] && (
                  <p className="text-[11px] flex items-center gap-1 text-amber-700 dark:text-amber-400">
                    <AlertCircle className="h-3 w-3" />
                    This family member is already an existing patient:{" "}
                    {familyExisting[(row.phone || "").trim()].first_name}{" "}
                    {familyExisting[(row.phone || "").trim()].last_name}
                  </p>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setFamilyRows((prev) => [...prev, { name: "", relationship: "", phone: "", is_primary_contact: false, linked: false }])}
            >
              <Plus className="h-3.5 w-3.5" /> Add Family Member
            </Button>
          </CollapsibleContent>
        </Collapsible>
        )}

        <div className="mt-6 pt-4 border-t">
          <Label htmlFor="patient-notes">Notes</Label>
          <Textarea
            id="patient-notes"
            value={form.notes || ""}
            onChange={(e) => updateField("notes", e.target.value)}
            placeholder="Remarks, observations, referral details, special instructions..."
            className="mt-1.5"
            rows={4}
          />
        </div>

        <div className="mt-6">
          <CustomFieldsRenderer
            objectKey="patients"
            values={customValues}
            onChange={(col, val) => setCustomValues((prev) => ({ ...prev, [col]: val }))}
            errors={customErrors}
          />
        </div>

        <div className="flex gap-3 mt-6 pt-4 border-t">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving..." : isEditing ? "Update Patient" : "Create Patient"}
          </Button>
        </div>

      </DialogContent>
    </Dialog>
    </>
  );
}

function CampaignMultiSelectField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: campaigns = [] } = useQuery({
    queryKey: ["campaigns-for-patient-form"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns" as any).select("id, name, status").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
  const filtered = campaigns.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  const selected = campaigns.filter((c) => value.includes(c.id));
  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };
  return (
    <div>
      <Label>Campaigns</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between mt-1.5 h-auto min-h-10 py-2 font-normal">
            <span className="flex flex-wrap gap-1 text-left">
              {selected.length === 0 ? (
                <span className="text-muted-foreground">Select campaigns...</span>
              ) : (
                selected.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-secondary text-xs">
                    {c.name}
                    <X className="h-3 w-3 cursor-pointer" onClick={(e) => { e.stopPropagation(); toggle(c.id); }} />
                  </span>
                ))
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
          <div className="flex items-center gap-2 mb-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-8" />
          </div>
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">No campaigns</p>
            ) : filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                className={cn("w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent text-left")}
                onClick={() => toggle(c.id)}
              >
                <Check className={cn("h-4 w-4", value.includes(c.id) ? "opacity-100" : "opacity-0")} />
                <span className="flex-1">{c.name}</span>
                {c.status !== "Active" && <span className="text-xs text-muted-foreground">({c.status})</span>}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
