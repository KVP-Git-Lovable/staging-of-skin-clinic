import { useState } from "react";
import { Sparkles, Loader2, Star, TrendingUp, TrendingDown, Minus, AlertTriangle, Activity, IndianRupee, CalendarDays, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";

interface Patient360Props {
  patientId: string;
  patientName: string;
}

interface Analysis {
  patientRating: number;
  ratingLabel: string;
  visitFrequency: string;
  avgDaysBetweenVisits: number | null;
  prediction: string;
  predictionConfidence: number;
  totalLifetimeValue: number;
  insights: string[];
  nextVisitEstimate: string;
  engagementScore: number;
  riskFactors: string[];
  opportunities: string[];
}

interface RawStats {
  totalVisits: number;
  totalProcedures: number;
  totalSpend: number;
  totalPaid: number;
  uniqueServices: number;
  noShowCount: number;
}

const predictionConfig: Record<string, { color: string; icon: any; bg: string }> = {
  Growth: { color: "text-emerald-600", icon: TrendingUp, bg: "bg-emerald-50 border-emerald-200" },
  Stable: { color: "text-blue-600", icon: Minus, bg: "bg-blue-50 border-blue-200" },
  Slow: { color: "text-amber-600", icon: TrendingDown, bg: "bg-amber-50 border-amber-200" },
  "Churn Risk": { color: "text-red-600", icon: AlertTriangle, bg: "bg-red-50 border-red-200" },
};

export const Patient360 = ({ patientId, patientName }: Patient360Props) => {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [rawStats, setRawStats] = useState<RawStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fetchAnalysis = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/patient-360`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ patientId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Analysis failed");
      }
      const data = await res.json();
      setAnalysis(data.analysis);
      setRawStats(data.rawStats);
      setSheetOpen(true);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate analysis");
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    if (analysis) {
      setSheetOpen(true);
    } else {
      fetchAnalysis();
    }
  };

  const pred = analysis ? (predictionConfig[analysis.prediction] || predictionConfig.Stable) : null;
  const PredIcon = pred?.icon;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 h-8 text-xs"
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {loading ? "Analyzing..." : "AI 360°"}
        {analysis && pred && (
          <Badge className={`text-[10px] ml-1 ${pred.bg} ${pred.color} border`}>{analysis.prediction}</Badge>
        )}
      </Button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Patient 360° — {patientName}
            </SheetTitle>
          </SheetHeader>

          {analysis && pred && PredIcon && (
            <div className="space-y-4 mt-4">
              {/* Top metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3 bg-muted/20">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Rating</p>
                  <div className="flex items-center gap-1 mt-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-4 w-4 ${i < analysis.patientRating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{analysis.ratingLabel}</p>
                </div>

                <div className={`rounded-lg border p-3 ${pred.bg}`}>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Prediction</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <PredIcon className={`h-5 w-5 ${pred.color}`} />
                    <span className={`font-semibold text-sm ${pred.color}`}>{analysis.prediction}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{analysis.predictionConfidence}% confidence</p>
                </div>

                <div className="rounded-lg border p-3 bg-muted/20">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Engagement</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Activity className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-lg">{analysis.engagementScore}</span>
                    <span className="text-xs text-muted-foreground">/100</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full mt-1.5">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${analysis.engagementScore}%` }} />
                  </div>
                </div>

                <div className="rounded-lg border p-3 bg-muted/20">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Lifetime Value</p>
                  <div className="flex items-center gap-1 mt-1">
                    <IndianRupee className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold text-lg">₹{Number(analysis.totalLifetimeValue).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{rawStats?.totalProcedures || 0} procedures</p>
                </div>
              </div>

              {/* Visit pattern */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3 bg-muted/20">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Visit Frequency</p>
                  <p className="font-semibold text-sm mt-1">{analysis.visitFrequency}</p>
                  {analysis.avgDaysBetweenVisits && <p className="text-xs text-muted-foreground">~{analysis.avgDaysBetweenVisits} days apart</p>}
                </div>
                <div className="rounded-lg border p-3 bg-muted/20">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Target className="h-3 w-3" /> Next Visit</p>
                  <p className="font-semibold text-sm mt-1">{analysis.nextVisitEstimate}</p>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="rounded-lg border p-3 bg-muted/20">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Quick Stats</p>
                <div className="flex items-center gap-3 mt-1 text-xs">
                  <span><strong>{rawStats?.totalVisits || 0}</strong> visits</span>
                  <span><strong>{rawStats?.uniqueServices || 0}</strong> services</span>
                  <span className={rawStats?.noShowCount ? "text-destructive" : ""}><strong>{rawStats?.noShowCount || 0}</strong> no-shows</span>
                </div>
              </div>

              {/* Insights */}
              {analysis.insights.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Key Insights</p>
                  <div className="space-y-1.5">
                    {analysis.insights.map((insight, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-primary mt-0.5 shrink-0">•</span>
                        <span>{insight}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk & Opportunities */}
              <div className="grid grid-cols-1 gap-3">
                {analysis.riskFactors.length > 0 && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                    <p className="text-xs font-semibold text-destructive flex items-center gap-1 mb-2"><AlertTriangle className="h-3 w-3" /> Risk Factors</p>
                    {analysis.riskFactors.map((r, i) => (
                      <p key={i} className="text-xs text-muted-foreground mb-1">• {r}</p>
                    ))}
                  </div>
                )}
                {analysis.opportunities.length > 0 && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1 mb-2"><TrendingUp className="h-3 w-3" /> Opportunities</p>
                    {analysis.opportunities.map((o, i) => (
                      <p key={i} className="text-xs text-muted-foreground mb-1">• {o}</p>
                    ))}
                  </div>
                )}
              </div>

              {/* Refresh button */}
              <Button variant="outline" size="sm" className="w-full gap-2" onClick={fetchAnalysis} disabled={loading}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Refresh Analysis
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};
