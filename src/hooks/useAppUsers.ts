import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AppUser {
  auth_user_id: string;
  name: string;
  email: string | null;
  role: string | null;
}

/**
 * Users of the system: active staff members that have a login account.
 * Used for record ownership, doctor selection and "assisted by".
 */
export function useAppUsers() {
  return useQuery({
    queryKey: ["app-users"],
    queryFn: async (): Promise<AppUser[]> => {
      const { data, error } = await supabase
        .from("staff")
        .select("auth_user_id, first_name, last_name, email, role")
        .eq("is_active", true)
        .not("auth_user_id", "is", null)
        .order("first_name");
      if (error) throw error;
      return (data ?? []).map((s: any) => ({
        auth_user_id: s.auth_user_id,
        name: `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || "User",
        email: s.email ?? null,
        role: s.role ?? null,
      }));
    },
  });
}
