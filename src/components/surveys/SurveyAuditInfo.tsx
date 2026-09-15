import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  createdAt?: string | null;
  createdBy?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  className?: string;
}

export function useStaffNameMap() {
  return useQuery({
    queryKey: ["staff-auth-name-map"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("staff").select("auth_user_id, first_name, last_name");
      const map: Record<string, string> = {};
      (data || []).forEach((s: any) => {
        if (s.auth_user_id) map[s.auth_user_id] = `${s.first_name || ""} ${s.last_name || ""}`.trim();
      });
      return map;
    },
  });
}

const fmt = (d?: string | null) => (d ? format(new Date(d), "dd MMM yyyy, hh:mm a") : "—");

export function SurveyAuditInfo({ createdAt, createdBy, updatedAt, updatedBy, className }: Props) {
  const { data: names = {} } = useStaffNameMap();
  const who = (id?: string | null) => (id ? names[id] || "User" : "—");

  return (
    <div className={`text-[11px] text-muted-foreground space-y-0.5 ${className || ""}`}>
      <p>Created by {who(createdBy)} · {fmt(createdAt)}</p>
      <p>Last modified by {who(updatedBy || createdBy)} · {fmt(updatedAt || createdAt)}</p>
    </div>
  );
}
