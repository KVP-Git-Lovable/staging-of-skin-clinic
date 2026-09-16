import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import skinClinicLogo from "@/assets/skin-clinic-logo.png";

const DEFAULT_CLINIC_NAME = "The Skin Clinic";

export function useClinicSettings() {
  const { data, isLoading } = useQuery({
    queryKey: ["clinic-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clinic_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
    retry: false,
  });

  return {
    name: data?.name || DEFAULT_CLINIC_NAME,
    logoUrl: data?.logo_url || skinClinicLogo,
    isLoading,
  };
}
