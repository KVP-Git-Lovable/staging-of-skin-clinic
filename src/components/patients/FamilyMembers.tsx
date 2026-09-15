import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Users, Star, Phone, LayoutGrid, List, FileEdit, Eye, Calendar, Activity } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { PatientFormSheet } from "./PatientFormSheet";
import type { Tables } from "@/integrations/supabase/types";

const RELATIONSHIPS = [
  "Spouse", "Father", "Mother", "Son", "Daughter",
  "Brother", "Sister", "Grandfather", "Grandmother",
  "Uncle", "Aunt", "Cousin", "Friend", "In-Law", "Other",
];

interface FamilyMembersProps {
  patientId: string;
  patientName: string;
}

type Patient = Tables<"patients">;

export function FamilyMembers({ patientId, patientName }: FamilyMembersProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [memberName, setMemberName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [memberPhone, setMemberPhone] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberCity, setMemberCity] = useState("");
  const [memberState, setMemberState] = useState("");
  const [viewMode, setViewMode] = useState<"tree" | "list">("tree");

  // For opening PatientFormSheet to fill/edit details
  const [formSheetOpen, setFormSheetOpen] = useState(false);
  const [formSheetPatient, setFormSheetPatient] = useState<Patient | null>(null);
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);

  // For viewing filled member details
  const [viewingMember, setViewingMember] = useState<any>(null);

  const { data: familyMembers = [], isLoading } = useQuery({
    queryKey: ["family-members", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_family_members")
        .select("*")
        .eq("patient_id", patientId);
      if (error) throw error;

      const { data: reverseData, error: reverseError } = await supabase
        .from("patient_family_members")
        .select("*")
        .eq("related_patient_id", patientId);
      if (reverseError) throw reverseError;

      const reverseFormatted = (reverseData || []).map((r: any) => ({
        ...r,
        relationship: getInverseRelationship(r.relationship),
        _isReverse: true,
      }));

      return [...(data || []), ...reverseFormatted];
    },
    enabled: !!patientId,
  });

  // Fetch linked patient details for ALL members (forward: related_patient_id, reverse: patient_id)
  const allLinkedPatientIds = familyMembers
    .map((m: any) => m._isReverse ? m.patient_id : m.related_patient_id)
    .filter(Boolean);
  const uniqueLinkedIds = [...new Set(allLinkedPatientIds)] as string[];

  const { data: linkedPatients = [] } = useQuery({
    queryKey: ["linked-patients", uniqueLinkedIds],
    queryFn: async () => {
      if (uniqueLinkedIds.length === 0) return [];
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .in("id", uniqueLinkedIds);
      if (error) throw error;
      return data || [];
    },
    enabled: uniqueLinkedIds.length > 0,
  });

  // Fetch visit stats (appointment counts & last visit) for linked patients
  const { data: visitStats = {} } = useQuery({
    queryKey: ["family-visit-stats", uniqueLinkedIds],
    queryFn: async () => {
      if (uniqueLinkedIds.length === 0) return {};
      const { data, error } = await supabase
        .from("appointments")
        .select("patient_id, start_time")
        .in("patient_id", uniqueLinkedIds)
        .order("start_time", { ascending: false });
      if (error) throw error;
      const stats: Record<string, { totalVisits: number; lastVisit: string | null }> = {};
      for (const apt of data || []) {
        if (!apt.patient_id) continue;
        if (!stats[apt.patient_id]) {
          stats[apt.patient_id] = { totalVisits: 0, lastVisit: apt.start_time };
        }
        stats[apt.patient_id].totalVisits++;
      }
      return stats;
    },
    enabled: uniqueLinkedIds.length > 0,
  });

  const addMember = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("patient_family_members").insert({
        patient_id: patientId,
        name: memberName,
        relationship,
        phone: memberPhone || null,
        email: memberEmail || null,
        city: memberCity || null,
        state: memberState || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family-members", patientId] });
      toast.success("Family member added");
      resetForm();
      setAddOpen(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("patient_family_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family-members", patientId] });
      toast.success("Family member removed");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const resetForm = () => {
    setMemberName("");
    setRelationship("");
    setMemberPhone("");
    setMemberEmail("");
    setMemberCity("");
    setMemberState("");
  };

  const convertToPatient = useMutation({
    mutationFn: async (member: any) => {
      const nameParts = (member.name || "").trim().split(/\s+/);
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || ".";

      const { data: newPatient, error: patientError } = await supabase
        .from("patients")
        .insert({
          first_name: firstName,
          last_name: lastName,
          phone: member.phone || null,
          email: member.email || null,
          city: member.city || null,
          state: member.state || null,
          status: "Active",
        })
        .select("id")
        .single();
      if (patientError) throw patientError;

      // Link forward: current member → new patient
      const { error: linkError } = await supabase
        .from("patient_family_members")
        .update({ related_patient_id: newPatient.id })
        .eq("id", member.id);
      if (linkError) throw linkError;

      // Create reverse link: new patient → current patient
      const inverseRel = getInverseRelationship(member.relationship);
      await supabase.from("patient_family_members").insert({
        patient_id: newPatient.id,
        related_patient_id: patientId,
        relationship: inverseRel,
        name: patientName,
      });

      return newPatient.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family-members", patientId] });
      queryClient.invalidateQueries({ queryKey: ["linked-patients"] });
      toast.success("Patient record created and linked successfully");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const getMemberDisplayName = (member: any): string => {
    // For reverse members, show the linked patient's name from the patients table
    if (member._isReverse) {
      const linked = linkedPatients.find((p: Patient) => p.id === member.patient_id);
      if (linked) return `${linked.first_name} ${linked.last_name}`;
    }
    // For forward members with linked patient, show that patient's name
    if (member.related_patient_id) {
      const linked = linkedPatients.find((p: Patient) => p.id === member.related_patient_id);
      if (linked) return `${linked.first_name} ${linked.last_name}`;
    }
    if (member.name) return member.name;
    return "Unknown";
  };

  const hasDetails = (member: any): boolean => {
    return !!(member.related_patient_id || member._isReverse);
  };

  const getLinkedPatient = (member: any): Patient | undefined => {
    const targetId = member._isReverse ? member.patient_id : member.related_patient_id;
    if (!targetId) return undefined;
    return linkedPatients.find((p: Patient) => p.id === targetId);
  };

  const getLinkedPatientId = (member: any): string | null => {
    return member._isReverse ? member.patient_id : member.related_patient_id;
  };

  const handleCardClick = (member: any) => {
    const linkedId = getLinkedPatientId(member);
    if (linkedId) {
      // Has linked patient — navigate directly to their profile
      navigate(`/patients/${linkedId}`);
      return;
    }

    // No details yet — open patient form to create record
    setPendingMemberId(member.id);
    const nameParts = (member.name || "").trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || ".";
    setFormSheetPatient({
      id: "",
      first_name: firstName,
      last_name: lastName,
      created_at: "",
      updated_at: "",
      status: "Active",
      date_of_birth: null,
      gender: null,
      phone: member.phone || null,
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
      doctor_id: null,
      auth_user_id: null,
      facebook_url: null,
      instagram_url: null,
      follows_facebook: null,
      follows_instagram: null,
      source: null,
      source_ad_details: null,
      source_referral_doctor: null,
    } as Patient);
    setFormSheetOpen(true);
  };

  const handleFormSuccess = async () => {
    // After creating the patient via the form, link it to the family member
    if (pendingMemberId) {
      // Find the most recently created patient matching the name
      const member = familyMembers.find((m: any) => m.id === pendingMemberId);
      if (member) {
        const nameParts = (member.name || "").trim().split(/\s+/);
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || ".";

        const { data: newPatient } = await supabase
          .from("patients")
          .select("id")
          .eq("first_name", firstName)
          .eq("last_name", lastName)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (newPatient) {
          await supabase
            .from("patient_family_members")
            .update({ related_patient_id: newPatient.id })
            .eq("id", pendingMemberId);
        }
      }
      setPendingMemberId(null);
    }
    queryClient.invalidateQueries({ queryKey: ["family-members", patientId] });
    queryClient.invalidateQueries({ queryKey: ["linked-patients"] });
  };

  const handleEditLinkedPatient = () => {
    if (viewingMember?.linkedPatient) {
      setFormSheetPatient(viewingMember.linkedPatient);
      setPendingMemberId(null);
      setViewingMember(null);
      setFormSheetOpen(true);
    }
  };

  const handleViewProfile = () => {
    if (viewingMember?.related_patient_id) {
      navigate(`/patients/${viewingMember.related_patient_id}`);
      setViewingMember(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="font-display font-semibold text-lg">Family Members</h3>
          <Badge variant="secondary" className="text-xs">{familyMembers.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {familyMembers.length > 0 && (
            <div className="flex items-center border rounded-md overflow-hidden">
              <button
                onClick={() => setViewMode("tree")}
                className={`p-1.5 transition-colors ${viewMode === "tree" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 transition-colors ${viewMode === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Member
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="font-display">Add Family Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="rounded-lg bg-muted/50 border p-3">
                  <p className="text-xs text-muted-foreground">Patient</p>
                  <p className="font-medium text-sm">{patientName}</p>
                </div>

                <div>
                  <Label>Name *</Label>
                  <Input
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    placeholder="Enter full name..."
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label>Relationship *</Label>
                  <Select value={relationship} onValueChange={setRelationship}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Select relationship" />
                    </SelectTrigger>
                    <SelectContent>
                      {RELATIONSHIPS.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Phone Number</Label>
                  <Input
                    value={memberPhone}
                    onChange={(e) => setMemberPhone(e.target.value)}
                    placeholder="Enter phone number..."
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label>Email Address</Label>
                  <Input
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    placeholder="Enter email..."
                    type="email"
                    className="mt-1.5"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>City</Label>
                    <Input
                      value={memberCity}
                      onChange={(e) => setMemberCity(e.target.value)}
                      placeholder="City"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>State</Label>
                    <Input
                      value={memberState}
                      onChange={(e) => setMemberState(e.target.value)}
                      placeholder="State"
                      className="mt-1.5"
                    />
                  </div>
                </div>

                <Button
                  className="w-full"
                  disabled={!memberName.trim() || !relationship || addMember.isPending}
                  onClick={() => addMember.mutate()}
                >
                  {addMember.isPending ? "Adding..." : "Add Member"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
      ) : familyMembers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No family members linked yet.</p>
          <p className="text-xs mt-1">Add family members to build the family tree.</p>
        </div>
      ) : viewMode === "list" ? (
        <ListViewTable
          familyMembers={familyMembers}
          getMemberDisplayName={getMemberDisplayName}
          hasDetails={hasDetails}
          handleCardClick={handleCardClick}
          removeMember={removeMember}
          getLinkedPatientId={getLinkedPatientId}
          visitStats={visitStats}
          navigate={navigate}
          convertToPatient={convertToPatient}
        />
      ) : (
        <TreeView
          patientName={patientName}
          familyMembers={familyMembers}
          getMemberDisplayName={getMemberDisplayName}
          hasDetails={hasDetails}
          handleCardClick={handleCardClick}
          removeMember={removeMember}
          getLinkedPatientId={getLinkedPatientId}
          visitStats={visitStats}
          navigate={navigate}
          convertToPatient={convertToPatient}
        />
      )}

      {/* Patient Form Sheet for filling/editing details */}
      <PatientFormSheet
        open={formSheetOpen}
        onOpenChange={(open) => {
          setFormSheetOpen(open);
          if (!open) {
            setFormSheetPatient(null);
            setPendingMemberId(null);
          }
        }}
        patient={formSheetPatient?.id ? formSheetPatient : null}
        defaultValues={formSheetPatient && !formSheetPatient.id ? formSheetPatient : undefined}
        onSuccess={handleFormSuccess}
      />

      {/* Detail View Dialog for filled members */}
      <Dialog open={!!viewingMember} onOpenChange={(open) => { if (!open) setViewingMember(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Eye className="h-4 w-4" />
              {viewingMember?.linkedPatient
                ? `${viewingMember.linkedPatient.first_name} ${viewingMember.linkedPatient.last_name}`
                : getMemberDisplayName(viewingMember || {})}
            </DialogTitle>
          </DialogHeader>
          {viewingMember?.linkedPatient && (
            <MemberDetailView
              patient={viewingMember.linkedPatient}
              relationship={viewingMember.relationship}
              onEdit={handleEditLinkedPatient}
              onViewProfile={handleViewProfile}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Sub-components ── */

function MemberDetailView({
  patient,
  relationship,
  onEdit,
  onViewProfile,
}: {
  patient: Patient;
  relationship: string;
  onEdit: () => void;
  onViewProfile: () => void;
}) {
  const getAge = (dob: string | null) => {
    if (!dob) return null;
    return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  };

  const fields = [
    { label: "Relationship", value: relationship },
    { label: "Gender", value: patient.gender },
    { label: "Age", value: getAge(patient.date_of_birth) ? `${getAge(patient.date_of_birth)} years` : null },
    { label: "Date of Birth", value: patient.date_of_birth },
    { label: "Phone", value: patient.phone },
    { label: "Email", value: patient.email },
    { label: "Blood Group", value: patient.blood_group },
    { label: "Address", value: [patient.address, patient.city, patient.state, patient.pincode].filter(Boolean).join(", ") || null },
    { label: "Skin Type", value: patient.skin_type },
    { label: "Skin Concerns", value: patient.skin_concerns },
    { label: "Allergies", value: patient.allergies },
    { label: "Medical History", value: patient.medical_history },
    { label: "Current Medications", value: patient.current_medications },
  ];

  return (
    <div className="space-y-4 mt-2">
      <div className="grid grid-cols-2 gap-3">
        {fields.map(({ label, value }) =>
          value ? (
            <div key={label} className="space-y-0.5">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm font-medium">{value}</p>
            </div>
          ) : null
        )}
      </div>

      <div className="flex gap-2 pt-3 border-t">
        <Button size="sm" variant="outline" className="gap-1.5 flex-1" onClick={onViewProfile}>
          <Eye className="h-3.5 w-3.5" /> View Full Profile
        </Button>
        <Button size="sm" className="gap-1.5 flex-1" onClick={onEdit}>
          <FileEdit className="h-3.5 w-3.5" /> Edit Details
        </Button>
      </div>
    </div>
  );
}

function ListViewTable({
  familyMembers,
  getMemberDisplayName,
  hasDetails,
  handleCardClick,
  removeMember,
  getLinkedPatientId,
  visitStats,
  navigate,
  convertToPatient,
}: any) {
  return (
    <div className="data-table">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left text-xs font-medium text-muted-foreground p-3">Name</th>
            <th className="text-left text-xs font-medium text-muted-foreground p-3">Relationship</th>
            <th className="text-left text-xs font-medium text-muted-foreground p-3 hidden sm:table-cell">Visits</th>
            <th className="text-left text-xs font-medium text-muted-foreground p-3 hidden sm:table-cell">Status</th>
            <th className="text-right text-xs font-medium text-muted-foreground p-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {familyMembers.map((member: any) => {
            const displayName = getMemberDisplayName(member);
            const filled = hasDetails(member);
            const linkedId = getLinkedPatientId(member);
            const stats = linkedId ? visitStats[linkedId] : null;
            return (
              <tr
                key={member.id}
                className="hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => handleCardClick(member)}
              >
                <td className="p-3">
                  <span className="font-medium text-sm text-primary hover:underline">{displayName}</span>
                </td>
                <td className="p-3">
                  <Badge variant="outline" className="text-[10px]">{member.relationship}</Badge>
                </td>
                <td className="p-3 hidden sm:table-cell">
                  <span className="text-xs text-muted-foreground">{stats ? stats.totalVisits : "—"}</span>
                </td>
                <td className="p-3 hidden sm:table-cell">
                  {filled ? (
                    <Badge variant="secondary" className="text-[10px] bg-success/10 text-success">Linked</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] bg-warning/10 text-warning">Pending</Badge>
                  )}
                </td>
                <td className="p-3 text-right flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  {linkedId ? (
                    <Button variant="ghost" size="sm" className="text-xs h-7 gap-1 text-primary" onClick={() => navigate(`/patients/${linkedId}`)}>
                      <Eye className="h-3 w-3" /> View Patient
                    </Button>
                  ) : !member._isReverse ? (
                    <Button variant="ghost" size="sm" className="text-xs h-7 gap-1 text-primary" onClick={() => convertToPatient.mutate(member)} disabled={convertToPatient.isPending}>
                      <Users className="h-3 w-3" /> Convert to Patient
                    </Button>
                  ) : null}
                  {!member._isReverse && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove family member?</AlertDialogTitle>
                          <AlertDialogDescription>This will remove {displayName} from this patient's family.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeMember.mutate(member.id)}>Remove</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TreeView({
  patientName,
  familyMembers,
  getMemberDisplayName,
  hasDetails,
  handleCardClick,
  removeMember,
  getLinkedPatientId,
  visitStats,
  navigate,
  convertToPatient,
}: any) {
  return (
    <div className="relative">
      {/* Center patient node */}
      <div className="flex flex-col items-center mb-8">
        <div className="bg-primary/10 border-2 border-primary rounded-xl px-6 py-3 text-center shadow-sm">
          <p className="font-display font-bold text-primary">{patientName}</p>
          <p className="text-xs text-muted-foreground">Current Patient</p>
        </div>
        {familyMembers.length > 0 && <div className="w-px h-8 bg-border" />}
      </div>

      {/* Horizontal connector line */}
      {familyMembers.length > 1 && (
        <div className="relative mb-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px bg-border" style={{
            width: `${Math.min(familyMembers.length * 220, 900)}px`,
            maxWidth: '95%',
          }} />
        </div>
      )}

      {/* Member cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <AnimatePresence>
          {familyMembers.map((member: any) => {
            const displayName = getMemberDisplayName(member);
            const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
            const filled = hasDetails(member);
            const linkedId = getLinkedPatientId(member);
            const stats = linkedId ? visitStats[linkedId] : null;

            return (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative"
              >
                {/* Vertical connector */}
                <div className="flex justify-center">
                  <div className="w-px h-4 bg-border" />
                </div>

                {/* Card */}
                <div
                  onClick={() => handleCardClick(member)}
                  className="stat-card p-4 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      filled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                        {displayName}
                      </p>
                      <Badge variant="outline" className="text-[10px] mt-1">{member.relationship}</Badge>
                      {member.phone && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {member.phone}
                        </p>
                      )}
                    </div>
                    {member.is_primary_contact && (
                      <Star className="h-3.5 w-3.5 text-warning fill-warning shrink-0" />
                    )}
                  </div>

                  {/* Quick stats */}
                  {linkedId && (
                    <div className="mt-3 pt-2 border-t grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Activity className="h-3 w-3" />
                        <span>{stats?.totalVisits ?? 0} visits</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{stats?.lastVisit ? new Date(stats.lastVisit).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "No visits"}</span>
                      </div>
                    </div>
                  )}

                  {/* Action row */}
                  <div className="mt-3 pt-2 border-t flex items-center gap-2">
                    {linkedId ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 gap-1 flex-1"
                        onClick={(e) => { e.stopPropagation(); navigate(`/patients/${linkedId}`); }}
                      >
                        <Eye className="h-3 w-3" /> View Patient
                      </Button>
                    ) : !member._isReverse ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 gap-1 flex-1"
                        disabled={convertToPatient.isPending}
                        onClick={(e) => { e.stopPropagation(); convertToPatient.mutate(member); }}
                      >
                        <Users className="h-3 w-3" /> Convert to Patient
                      </Button>
                    ) : null}
                    {!member._isReverse && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove family member?</AlertDialogTitle>
                              <AlertDialogDescription>This will remove {displayName} from this patient's family.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => removeMember.mutate(member.id)}>Remove</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function getInverseRelationship(rel: string): string {
  const inverses: Record<string, string> = {
    Father: "Son/Daughter",
    Mother: "Son/Daughter",
    Son: "Father/Mother",
    Daughter: "Father/Mother",
    Brother: "Brother/Sister",
    Sister: "Brother/Sister",
    Spouse: "Spouse",
    Grandfather: "Grandchild",
    Grandmother: "Grandchild",
    Uncle: "Nephew/Niece",
    Aunt: "Nephew/Niece",
    Cousin: "Cousin",
    Friend: "Friend",
    "In-Law": "In-Law",
  };
  return inverses[rel] || rel;
}
