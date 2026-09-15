import { useState, useEffect, useMemo } from "react";
import { X, Search, Check, ChevronsUpDown, Plus, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useQuery } from "@tanstack/react-query";
import { fetchAll } from "@/lib/supabasePaginate";
import { useValidator } from "@/hooks/useValidationRules";
import { useCustomFields } from "@/lib/custom-fields/api";
import { CustomFieldsRenderer, validateCustomFields } from "@/components/custom-fields/CustomFieldsRenderer";
import type { ValidationMessage } from "@/lib/validation/engine";
import { AlertCircle } from "lucide-react";
import { Sparkles, Loader2 } from "lucide-react";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { findDuplicates, type DuplicateMatch } from "@/lib/duplicates/engine";
import DuplicateAlertDialog from "@/components/duplicates/DuplicateAlertDialog";
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
  onSuccess: () => void;
}

const emptyForm: TablesInsert<"patients"> = {
  first_name: "",
  last_name: "",
  date_of_birth: null,
  gender: null,
  phone: null,
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
};

export function PatientFormSheet({ open, onOpenChange, patient, defaultValues, onSuccess }: PatientFormSheetProps) {
  const [form, setForm] = useState<TablesInsert<"patients">>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [referralPatientSearch, setReferralPatientSearch] = useState("");
  const [referralPopoverOpen, setReferralPopoverOpen] = useState(false);
  const [selectedReferralPatientName, setSelectedReferralPatientName] = useState("");
  const [refDocOpen, setRefDocOpen] = useState(false);
  const [refDocSearch, setRefDocSearch] = useState("");
  const [addDoctorOpen, setAddDoctorOpen] = useState(false);
  const [newDoctorName, setNewDoctorName] = useState("");
  const [savingDoctor, setSavingDoctor] = useState(false);
  const [deletingDoctorId, setDeletingDoctorId] = useState<string | null>(null);
  const [deletingDoctorName, setDeletingDoctorName] = useState("");
  const [familyRows, setFamilyRows] = useState<FamilyRow[]>([]);
  const [activeTab, setActiveTab] = useState("personal");
  const [removedFamilyIds, setRemovedFamilyIds] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [liveMatches, setLiveMatches] = useState<DuplicateMatch[]>([]);
  const [resolveWith, setResolveWith] = useState<Record<string, any> | null>(null);

  const [duplicateAck, setDuplicateAck] = useState(false);
  const [dupMatches, setDupMatches] = useState<DuplicateMatch[]>([]);
  const [dupDialogOpen, setDupDialogOpen] = useState(false);
  const [familyExisting, setFamilyExisting] = useState<Record<string, any>>({});
  const { toast } = useToast();
  const isEditing = !!patient;

  const { data: referralDoctors = [], refetch: refetchDoctors } = useQuery({
    queryKey: ["referral-doctors-list"],
    queryFn: async () => {
      const [staffResult, externalResult] = await Promise.all([
        supabase
          .from("staff")
          .select("id, first_name, last_name, role, specialization")
          .in("role", ["Doctor", "Referral Doctor"])
          .eq("is_active", true)
          .order("first_name"),
        supabase
          .from("external_doctors")
          .select("id, name, specialization")
          .order("name")
      ]);

      const staffDocs = (staffResult.data || []).map(s => ({
        ...s,
        type: "internal",
        display_name: `${s.first_name} ${s.last_name}`
      }));

      const externalDocs = (externalResult.data || []).map(e => ({
        ...e,
        type: "external",
        display_name: e.name
      }));

      return [...staffDocs, ...externalDocs].sort((a, b) =>
        a.display_name.localeCompare(b.display_name)
      );
    },
  });
  const filteredRefDocs = useMemo(() => {
    const q = refDocSearch.toLowerCase();
    return referralDoctors.filter((s: any) =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
      (s.specialization || "").toLowerCase().includes(q)
    );
  }, [referralDoctors, refDocSearch]);

  const { data: allPatients = [] } = useQuery({
    queryKey: ["patients-lookup"],
    queryFn: async () =>
      await fetchAll<any>((from, to) =>
        supabase
          .from("patients")
          .select("id, first_name, last_name")
          .order("first_name")
          .range(from, to)
      ),
  });


  useEffect(() => {
    if (patient) {
      setForm({
        first_name: patient.first_name,
        last_name: patient.last_name,
        date_of_birth: patient.date_of_birth,
        gender: patient.gender,
        phone: patient.phone,
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
      });
      // Set referral patient name if source is "Referred by Patient"
      if ((patient as any).source === "Referred by Patient" && (patient as any).source_referral_doctor) {
        const refPat = allPatients.find(p => p.id === (patient as any).source_referral_doctor);
        if (refPat) setSelectedReferralPatientName(`${refPat.first_name} ${refPat.last_name}`);
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
    // NOTE: `allPatients` is intentionally excluded — it is a new array reference on
    // every render and would reset the form on each keystroke while editing.
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

  const handleDeleteExternalDoctor = async (doctorId: string) => {
    try {
      const { error } = await supabase
        .from("external_doctors")
        .delete()
        .eq("id", doctorId);
      if (error) throw error;
      await refetchDoctors();
      setDeletingDoctorId(null);
      setDeletingDoctorName("");
      toast({ title: "Doctor deleted successfully" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
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

  const handleSave = async (opts: { skipDuplicateCheck?: boolean } = {}) => {
    if (!form.first_name.trim()) {
      toast({ title: "Error", description: "First name is required", variant: "destructive" });
      return;
    }

    const cfErrors = validateCustomFields(customFieldDefs, customValues);
    if (!opts.skipDuplicateCheck) {
      const matches = await findDuplicates("patients", form as Record<string, any>, {
        excludeId: patient?.id ?? null,
      });
      if (matches.length > 0) {
        setDupMatches(matches);
        setDupDialogOpen(true);
        return;
      }
    }

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
      const payload = { ...form, ...customValues } as any;
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

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <DuplicateAlertDialog
      open={dupDialogOpen}
      matches={dupMatches}
      objectKey="patients"
      onClose={() => setDupDialogOpen(false)}
      onIgnore={() => void handleSave({ skipDuplicateCheck: true })}
    />
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

        {liveMatches.length > 0 && (
          <DuplicateNotificationBand
            className="mt-4"
            matches={liveMatches}
            objectKey="patients"
            onIgnore={() => { setDuplicateAck(true); setLiveMatches([]); }}
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date of Birth</Label>
                <Input
                  type="date"
                  value={form.date_of_birth || ""}
                  onChange={(e) => updateField("date_of_birth", e.target.value)}
                  className="mt-1.5"
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

            <div className="grid grid-cols-2 gap-4">
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
                <div>
                  <Label>Address</Label>
                  <Textarea
                    value={form.address || ""}
                    onChange={(e) => updateField("address", e.target.value)}
                    placeholder="Street address"
                    className="mt-1.5"
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>State</Label>
                    <Input
                      value={form.state || ""}
                      onChange={(e) => updateField("state", e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>Pincode</Label>
                    <Input
                      value={form.pincode || ""}
                      onChange={(e) => updateField("pincode", e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Emergency Contact Name</Label>
                    <Input
                      value={form.emergency_contact_name || ""}
                      onChange={(e) => updateField("emergency_contact_name", e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>Emergency Contact Phone</Label>
                    <Input
                      value={form.emergency_contact_phone || ""}
                      onChange={(e) => updateField("emergency_contact_phone", e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

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
                    source_referral_doctor: (v !== "Dr. referral" && v !== "Referred by Patient") ? null : (prev as any).source_referral_doctor,
                    source_other_text: v !== "Other" ? null : (prev as any).source_other_text,
                  }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Walk-in">Walk-in</SelectItem>
                    <SelectItem value="Advertisement">Advertisement</SelectItem>
                    <SelectItem value="Dr. referral">Dr. referral</SelectItem>
                    <SelectItem value="Referred by Patient">Referred by Patient</SelectItem>
                    <SelectItem value="Campaign">Campaign</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
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

            {((form as any).source && (form as any).source.toLowerCase().includes("referral")) && (
              <div className="animate-fade-in">
                <Label>Referred Doctor Name *</Label>
                <Popover open={refDocOpen} onOpenChange={setRefDocOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full mt-1.5 justify-between font-normal"
                    >
                      <span className="truncate">
                        {(form as any).source_referral_doctor || "Select referring doctor..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-2" align="start">
                    <div className="flex items-center gap-2 mb-2">
                      <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Input
                        placeholder="Search doctors..."
                        value={refDocSearch}
                        onChange={(e) => setRefDocSearch(e.target.value)}
                        className="h-8"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 shrink-0"
                        onClick={() => setAddDoctorOpen(true)}
                        title="Add new doctor"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="max-h-56 overflow-y-auto space-y-0.5">
                      {filteredRefDocs.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-3">
                          No doctors found.
                        </p>
                      ) : (
                        filteredRefDocs.map((s: any) => {
                          const name = s.display_name;
                          const selected = (form as any).source_referral_doctor === name;
                          return (
                            <div key={s.id} className="group relative">
                              <button
                                type="button"
                                className={cn(
                                  "w-full text-left px-2 py-1.5 text-sm rounded flex items-center gap-2 hover:bg-accent",
                                  selected && "bg-accent"
                                )}
                                onClick={() => {
                                  setForm((prev) => ({ ...prev, source_referral_doctor: name }));
                                  setRefDocOpen(false);
                                  setRefDocSearch("");
                                }}
                              >
                                <Check className={cn("h-3.5 w-3.5", selected ? "opacity-100" : "opacity-0")} />
                                <div className="flex-1 min-w-0">
                                  <p className="truncate">{name}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">
                                    {s.type === "external" ? "External Doctor" : [s.role, s.specialization].filter(Boolean).join(" · ")}
                                    {s.specialization && s.type === "external" && ` · ${s.specialization}`}
                                  </p>
                                </div>
                              </button>
                              {s.type === "external" && (
                                <button
                                  type="button"
                                  className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 text-destructive transition-opacity"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeletingDoctorId(s.id);
                                    setDeletingDoctorName(name);
                                  }}
                                  title="Delete external doctor"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {(form as any).source === "Referred by Patient" && (
              <div className="animate-fade-in">
                <Label>Referring Patient *</Label>
                <Popover open={referralPopoverOpen} onOpenChange={setReferralPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full mt-1.5 justify-start font-normal">
                      {selectedReferralPatientName || "Select patient..."}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-2" align="start">
                    <div className="flex items-center gap-2 mb-2">
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search patients..."
                        value={referralPatientSearch}
                        onChange={(e) => setReferralPatientSearch(e.target.value)}
                        className="h-8"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-0.5">
                      {allPatients
                        .filter(p => patient ? p.id !== patient.id : true)
                        .filter(p => `${p.first_name} ${p.last_name}`.toLowerCase().includes(referralPatientSearch.toLowerCase()))
                        .slice(0, 20)
                        .map(p => (
                          <button
                            key={p.id}
                            className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent"
                            onClick={() => {
                              setForm(prev => ({ ...prev, source_referral_doctor: p.id }));
                              setSelectedReferralPatientName(`${p.first_name} ${p.last_name}`);
                              setReferralPopoverOpen(false);
                              setReferralPatientSearch("");
                            }}
                          >
                            {p.first_name} {p.last_name}
                          </button>
                        ))}
                    </div>
                  </PopoverContent>
                </Popover>
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

        {/* Add External Doctor Modal */}
        <Dialog open={addDoctorOpen} onOpenChange={setAddDoctorOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add External Doctor</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="doctor-name">Doctor Name *</Label>
                <Input
                  id="doctor-name"
                  placeholder="e.g., Dr. John Smith"
                  value={newDoctorName}
                  onChange={(e) => setNewDoctorName(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setAddDoctorOpen(false); setNewDoctorName(""); }}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={async () => {
                    if (!newDoctorName.trim()) {
                      toast({ title: "Error", description: "Please enter doctor name" });
                      return;
                    }
                    setSavingDoctor(true);
                    try {
                      const { data, error } = await supabase.from("external_doctors").insert({
                        name: newDoctorName.trim(),
                      }).select();
                      if (error) throw error;
                      if (data && data[0]) {
                        setForm((prev) => ({ ...prev, source_referral_doctor: data[0].name }));
                        await refetchDoctors();
                        toast({ title: "Success", description: "Doctor added successfully" });
                      }
                      setAddDoctorOpen(false);
                      setNewDoctorName("");
                    } catch (err: any) {
                      toast({ title: "Error", description: err.message });
                    } finally {
                      setSavingDoctor(false);
                    }
                  }}
                  disabled={savingDoctor || !newDoctorName.trim()}
                >
                  {savingDoctor ? "Adding..." : "Add Doctor"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete External Doctor Confirmation */}
        <Dialog open={!!deletingDoctorId} onOpenChange={(open) => { if (!open) setDeletingDoctorId(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Doctor?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <span className="font-medium">{deletingDoctorName}</span>? This action cannot be undone.
            </p>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => setDeletingDoctorId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => deletingDoctorId && handleDeleteExternalDoctor(deletingDoctorId)}
              >
                Delete
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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
