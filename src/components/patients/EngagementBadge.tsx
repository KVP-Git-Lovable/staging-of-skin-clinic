import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { patientTier, tierEmoji } from "@/lib/patientTier";
import { useCanSeeBillingAmounts } from "@/hooks/useCanSeeBillingAmounts";

interface EngagementData {
  score: number;
  tier: string;
  tierEmoji: string;
  /** Lifetime billing - what the category is banded on. */
  stats?: { totalBilled?: number | null };
  breakdown: {
    visitFrequency: number;
    revenueValue: number;
    treatmentDepth: number;
    retentionSignal: number;
    compliance: number;
  };
}

const tierStyles: Record<string, string> = {
  Platinum: "bg-violet-100 text-violet-700 border-violet-200",
  Gold: "bg-amber-100 text-amber-700 border-amber-200",
  Silver: "bg-slate-100 text-slate-600 border-slate-200",
  Early: "bg-emerald-50 text-emerald-600 border-emerald-200",
};

export const EngagementBadge = ({ data }: { data: EngagementData | undefined }) => {
  const canSeeBilling = useCanSeeBillingAmounts();
  if (!data) return <span className="text-xs text-muted-foreground">—</span>;

  // Banded here rather than read from data.tier: the deployed edge function
  // can lag the rule, and did. See EngagementScoreCard for the whole story.
  const tier = patientTier(data.stats?.totalBilled);

  // The category is banded on lifetime billing and the revenue part is spend, so
  // neither is shown: just the score, neutral.
  if (!canSeeBilling) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium cursor-default bg-muted text-muted-foreground">
              {data.score}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs space-y-1 max-w-[200px]">
            <p className="font-semibold">{data.score}/100</p>
            <div className="space-y-0.5 text-muted-foreground">
              <p>Visit Freq: {data.breakdown.visitFrequency}/30</p>
              <p>Treatment: {data.breakdown.treatmentDepth}/20</p>
              <p>Retention: {data.breakdown.retentionSignal}/15</p>
              <p>Compliance: {data.breakdown.compliance}/10</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium cursor-default ${tierStyles[tier]}`}>
            {tierEmoji(tier)} {data.score}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs space-y-1 max-w-[200px]">
          <p className="font-semibold">{tierEmoji(tier)} {tier} — {data.score}/100</p>
          <div className="space-y-0.5 text-muted-foreground">
            <p>Visit Freq: {data.breakdown.visitFrequency}/30</p>
            <p>Revenue: {data.breakdown.revenueValue}/25</p>
            <p>Treatment: {data.breakdown.treatmentDepth}/20</p>
            <p>Retention: {data.breakdown.retentionSignal}/15</p>
            <p>Compliance: {data.breakdown.compliance}/10</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
