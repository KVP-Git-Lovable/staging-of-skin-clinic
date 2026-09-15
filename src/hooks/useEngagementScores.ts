import { useQuery } from "@tanstack/react-query";

interface EngagementData {
  score: number;
  tier: string;
  tierEmoji: string;
  breakdown: {
    visitFrequency: number;
    revenueValue: number;
    treatmentDepth: number;
    retentionSignal: number;
    compliance: number;
  };
}

export const useEngagementScores = (patientIds: string[]) => {
  return useQuery({
    queryKey: ["engagement-scores", patientIds.sort().join(",")],
    queryFn: async () => {
      if (patientIds.length === 0) return {};
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/patient-engagement`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ patientIds }),
      });
      if (!res.ok) return {};
      const json = await res.json();
      return (json.scores || {}) as Record<string, EngagementData>;
    },
    enabled: patientIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
};
