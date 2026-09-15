import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, Star, Phone, Heart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

interface FamilySummaryCardProps {
  patientId: string;
}

export function FamilySummaryCard({ patientId }: FamilySummaryCardProps) {
  const navigate = useNavigate();

  const { data: familyMembers = [] } = useQuery({
    queryKey: ["family-summary", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_family_members")
        .select("*, related_patient:patients!patient_family_members_related_patient_id_fkey(id, first_name, last_name, phone, date_of_birth, status, allergies, medical_history)")
        .eq("patient_id", patientId);
      if (error) throw error;

      const { data: reverseData, error: reverseError } = await supabase
        .from("patient_family_members")
        .select("*, related_patient:patients!patient_family_members_patient_id_fkey(id, first_name, last_name, phone, date_of_birth, status, allergies, medical_history)")
        .eq("related_patient_id", patientId);
      if (reverseError) throw reverseError;

      return [...(data || []), ...(reverseData || [])];
    },
    enabled: !!patientId,
  });

  if (familyMembers.length === 0) return null;

  const primaryContacts = familyMembers.filter((m: any) => m.is_primary_contact);
  const activeMembers = familyMembers.filter((m: any) => m.related_patient?.status === "Active");
  const membersWithAllergies = familyMembers.filter((m: any) => m.related_patient?.allergies);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="stat-card p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Family Overview</h3>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center p-2 rounded-lg bg-muted/50">
          <p className="text-lg font-bold text-foreground">{familyMembers.length}</p>
          <p className="text-[10px] text-muted-foreground">Members</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-muted/50">
          <p className="text-lg font-bold text-foreground">{primaryContacts.length}</p>
          <p className="text-[10px] text-muted-foreground">Primary</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-muted/50">
          <p className="text-lg font-bold text-foreground">{activeMembers.length}</p>
          <p className="text-[10px] text-muted-foreground">Active</p>
        </div>
      </div>

      {/* Primary contacts quick list */}
      {primaryContacts.length > 0 && (
        <div className="space-y-2 mb-3">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Star className="h-3 w-3 text-warning fill-warning" /> Primary Contacts
          </p>
          {primaryContacts.map((m: any) => {
            const rp = m.related_patient;
            if (!rp) return null;
            return (
              <div
                key={m.id}
                className="flex items-center justify-between p-2 rounded-lg bg-warning/5 border border-warning/10 cursor-pointer hover:bg-warning/10 transition-colors"
                onClick={() => navigate(`/patients/${rp.id}`)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-7 w-7 rounded-full bg-warning/10 flex items-center justify-center text-[10px] font-bold text-warning shrink-0">
                    {rp.first_name[0]}{rp.last_name[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{rp.first_name} {rp.last_name}</p>
                    <p className="text-[10px] text-muted-foreground">{m.relationship}</p>
                  </div>
                </div>
                {rp.phone && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                    <Phone className="h-2.5 w-2.5" />
                    <span>{rp.phone}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Health alerts */}
      {membersWithAllergies.length > 0 && (
        <div className="pt-2 border-t">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1.5">
            <Heart className="h-3 w-3 text-destructive" /> Family Health Notes
          </p>
          <div className="space-y-1">
            {membersWithAllergies.slice(0, 3).map((m: any) => (
              <p key={m.id} className="text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground">{m.related_patient.first_name}:</span>{" "}
                Allergies — {m.related_patient.allergies}
              </p>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
