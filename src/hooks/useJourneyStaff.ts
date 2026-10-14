import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StaffOption {
  id: string;
  name: string;
  roleName: string;
}

const APPROVER_ROLE = /admin|manager/i;

// Same table the rest of the app reads staff from; filtered client-side to the approver roles.
export function useJourneyStaff() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["comms-journey-staff"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, first_name, last_name, is_active, user_roles_config(name)")
        .order("first_name");
      if (error) throw error;
      return (data || [])
        .filter((s) => s.is_active !== false)
        .map((s) => ({
          id: s.id,
          name: `${s.first_name} ${s.last_name || ""}`.trim(),
          roleName: (s.user_roles_config as { name?: string } | null)?.name ?? "",
        })) as StaffOption[];
    },
  });

  return {
    staff: data,
    approvers: data.filter((s) => APPROVER_ROLE.test(s.roleName)),
    nameOf: (id: string | null | undefined) => data.find((s) => s.id === id)?.name ?? "—",
    isLoading,
  };
}
