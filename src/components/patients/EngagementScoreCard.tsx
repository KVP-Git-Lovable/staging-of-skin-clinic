import { useEffect, useState } from "react";
import { Loader2, TrendingUp, ChevronDown, ChevronUp, Sparkles, HelpCircle, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";

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
  stats: {
    totalAppointments: number;
    completedAppointments: number;
    totalProcedures: number;
    distinctServices: number;
    totalBilled: number;
    daysSinceLastVisit: number;
    lastVisitDate?: string;
  };
}

const tierStyles: Record<string, string> = {
  Platinum: "bg-violet-100 text-violet-700 border-violet-200",
  Gold: "bg-amber-100 text-amber-700 border-amber-200",
  Silver: "bg-slate-100 text-slate-600 border-slate-200",
  Early: "bg-emerald-50 text-emerald-600 border-emerald-200",
};

const factorLabels = [
  {
    key: "visitFrequency", label: "Visit Frequency", max: 30, color: "bg-blue-500",
    help: "Based on total appointments (40%), recency of last visit (40%), and consistency of visit intervals (20%). Score weighted at 30% of total."
  },
  {
    key: "revenueValue", label: "Revenue Value", max: 25, color: "bg-amber-500",
    help: "Based on total billed amount (50%) and average invoice value (50%). Higher spending patients score more. Weighted at 25% of total."
  },
  {
    key: "treatmentDepth", label: "Treatment Depth", max: 20, color: "bg-purple-500",
    help: "Based on number of distinct services tried (50%) and completed procedures (50%). More diverse treatments = higher score. Weighted at 20%."
  },
  {
    key: "retentionSignal", label: "Retention Signal", max: 15, color: "bg-emerald-500",
    help: "Measures loyalty span — months between first and last visit. 24+ months = full score. Single visit patients score low. Weighted at 15%."
  },
  {
    key: "compliance", label: "Compliance", max: 10, color: "bg-rose-500",
    help: "Show-up rate: completed appointments vs no-shows/cancellations. 100% attendance = full score. Weighted at 10% of total."
  },
];

const generateAITips = (data: EngagementData): string[] => {
  const tips: string[] = [];
  const { breakdown, stats } = data;

  // Visit frequency tips
  if (breakdown.visitFrequency < 20) {
    if (stats.daysSinceLastVisit > 90) {
      tips.push("🔔 Patient hasn't visited in " + stats.daysSinceLastVisit + " days. Send a follow-up reminder or wellness check message.");
    }
    if (stats.totalAppointments < 5) {
      tips.push("📅 Schedule a follow-up appointment to build visit consistency. Consider a treatment package to encourage regular visits.");
    }
  }

  // Revenue tips
  if (breakdown.revenueValue < 15) {
    tips.push("💰 Introduce premium services or combo packages to increase average billing value.");
    if (stats.totalBilled < 5000) {
      tips.push("🎁 Offer a first-time discount on a higher-value treatment to grow lifetime value.");
    }
  }

  // Treatment depth tips
  if (breakdown.treatmentDepth < 12) {
    if (stats.distinctServices <= 2) {
      tips.push("🔬 Patient has only tried " + stats.distinctServices + " service(s). Recommend complementary treatments based on their skin profile.");
    }
    tips.push("📋 During the next visit, present a personalized treatment plan spanning multiple services.");
  }

  // Retention tips
  if (breakdown.retentionSignal < 10) {
    tips.push("🤝 Build loyalty with a membership or loyalty program. Consistent patients score higher on retention.");
  }

  // Compliance tips
  if (breakdown.compliance < 7) {
    tips.push("✅ Patient has missed appointments. Send day-before reminders via SMS/WhatsApp to reduce no-shows.");
  }

  // Tier-specific tips
  if (data.tier === "Early") {
    tips.push("🌱 This is an early-stage patient. Focus on building rapport and scheduling the next 2-3 visits to establish a pattern.");
  } else if (data.tier === "Silver") {
    tips.push("🥈 Patient shows moderate engagement. A personalized outreach or exclusive offer could push them to Gold tier.");
  } else if (data.tier === "Gold") {
    tips.push("🥇 Strong patient! Consider VIP perks or referral incentives to reach Platinum status.");
  } else if (data.tier === "Platinum") {
    tips.push("🏆 Top-tier patient! Ensure premium experience and ask for referrals or testimonials.");
  }

  return tips.slice(0, 4);
};

export const EngagementScoreCard = ({ patientId }: { patientId: string }) => {
  const [data, setData] = useState<EngagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fetchScore = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/patient-engagement`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ patientIds: [patientId] }),
        });
        if (res.ok) {
          const json = await res.json();
          setData(json.scores?.[patientId] || null);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    fetchScore();
  }, [patientId]);

  if (loading) {
    return (
      <div className="stat-card p-4 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const tips = generateAITips(data);
  const lastVisitLabel = data.stats.lastVisitDate
    ? format(new Date(data.stats.lastVisitDate), "MMM d, yyyy")
    : data.stats.daysSinceLastVisit < 999
      ? `${data.stats.daysSinceLastVisit}d ago`
      : "Never";

  return (
    <TooltipProvider>
      <div className="stat-card p-4">
        {/* Header with score + tier + toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Engagement</h3>
            <span className="text-2xl font-bold ml-1">{data.score}</span>
            <span className="text-xs text-muted-foreground">/100</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-semibold ${tierStyles[data.tier] || tierStyles.Early}`}>
              {data.tierEmoji} {data.tier}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Always-visible stats row */}
        <div className="flex items-center gap-3 mt-3 pt-2.5 border-t text-xs">
          <div className="text-center flex-1">
            <p className="text-base font-bold">{data.stats.totalAppointments}</p>
            <p className="text-[10px] text-muted-foreground">Visits</p>
          </div>
          <div className="text-center flex-1">
            <p className="text-base font-bold">{data.stats.distinctServices}</p>
            <p className="text-[10px] text-muted-foreground">Services</p>
          </div>
          <div className="text-center flex-1">
            <p className="text-base font-bold">₹{data.stats.totalBilled >= 1000 ? `${(data.stats.totalBilled / 1000).toFixed(1)}k` : data.stats.totalBilled}</p>
            <p className="text-[10px] text-muted-foreground">Billed</p>
          </div>
          <div className="text-center flex-1">
            <div className="flex items-center justify-center gap-0.5">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <p className="text-xs font-semibold">{lastVisitLabel}</p>
            </div>
            <p className="text-[10px] text-muted-foreground">Last Visit</p>
          </div>
        </div>

        {/* Expandable section */}
        {expanded && (
          <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Factor breakdown */}
            <div className="space-y-2.5">
              {factorLabels.map((f) => {
                const value = data.breakdown[f.key as keyof typeof data.breakdown];
                const pct = (value / f.max) * 100;
                return (
                  <div key={f.key}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="text-muted-foreground flex items-center gap-1">
                        {f.label}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 text-muted-foreground/50 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[250px] text-xs">
                            {f.help}
                          </TooltipContent>
                        </Tooltip>
                      </span>
                      <span className="font-medium">{value}/{f.max}</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${f.color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Patient Engagement AI */}
            <div className="border-t pt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <h4 className="text-xs font-semibold">Patient Engagement AI</h4>
              </div>
              <div className="space-y-1.5">
                {tips.map((tip, i) => (
                  <p key={i} className="text-xs text-muted-foreground leading-relaxed">{tip}</p>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};
