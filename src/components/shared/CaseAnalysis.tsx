import { useState } from "react";
import { Sparkles, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";

interface CaseAnalysisProps {
  patientId: string;
  patientName: string;
}

interface CaseResult {
  summary: string;
  timeline: { date: string; event: string; details: string }[];
  diagnosisHistory: string[];
  treatmentPatterns: string;
  medicationSummary: string;
  skinProgress: string;
  keyFindings: string[];
  clinicalRecommendations: string[];
}

export const CaseAnalysis = ({ patientId, patientName }: CaseAnalysisProps) => {
  const [result, setResult] = useState<CaseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/case-analysis`, {
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
      setResult(data.analysis);
      setSheetOpen(true);
    } catch (e: any) {
      toast.error(e.message || "Case analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    if (result) {
      setSheetOpen(true);
    } else {
      runAnalysis();
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 h-8 text-xs"
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
        {loading ? "Analysing..." : "Case Analysis"}
        {result && <Badge variant="secondary" className="text-[10px] ml-1">Ready</Badge>}
      </Button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              AI Case Analysis — {patientName}
            </SheetTitle>
          </SheetHeader>

          {result && (
            <div className="space-y-4 mt-4">
              {/* Summary */}
              <div className="rounded-lg border p-3 bg-muted/20">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Case Summary</p>
                <p className="text-sm leading-relaxed">{result.summary}</p>
              </div>

              {/* Timeline */}
              {result.timeline.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Clinical Timeline</p>
                  <div className="space-y-2 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                    {result.timeline.map((t, i) => (
                      <div key={i} className="flex items-start gap-3 pl-6 relative">
                        <div className="absolute left-0.5 top-1 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                        <div>
                          <p className="text-xs font-medium">{t.date} — {t.event}</p>
                          <p className="text-xs text-muted-foreground">{t.details}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Diagnosis History */}
              {result.diagnosisHistory.length > 0 && (
                <div className="rounded-lg border p-3 bg-muted/20">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Diagnosis History</p>
                  {result.diagnosisHistory.map((d, i) => (
                    <p key={i} className="text-xs text-muted-foreground mb-0.5">• {d}</p>
                  ))}
                </div>
              )}

              {/* Treatment & Medication */}
              <div className="grid grid-cols-1 gap-3">
                <div className="rounded-lg border p-3 bg-muted/20">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Treatment Patterns</p>
                  <p className="text-xs">{result.treatmentPatterns}</p>
                </div>
                <div className="rounded-lg border p-3 bg-muted/20">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Medication Summary</p>
                  <p className="text-xs">{result.medicationSummary}</p>
                </div>
              </div>

              {/* Skin Progress */}
              {result.skinProgress && (
                <div className="rounded-lg border p-3 bg-muted/20">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Skin Progress Assessment</p>
                  <p className="text-xs">{result.skinProgress}</p>
                </div>
              )}

              {/* Key Findings & Recommendations */}
              {result.keyFindings.length > 0 && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="text-xs font-semibold text-primary mb-2">Key Findings</p>
                  {result.keyFindings.map((f, i) => (
                    <p key={i} className="text-xs text-muted-foreground mb-1">• {f}</p>
                  ))}
                </div>
              )}
              {result.clinicalRecommendations.length > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs font-semibold text-emerald-700 mb-2">Clinical Recommendations</p>
                  {result.clinicalRecommendations.map((r, i) => (
                    <p key={i} className="text-xs text-muted-foreground mb-1">• {r}</p>
                  ))}
                </div>
              )}

              {/* Refresh */}
              <Button variant="outline" size="sm" className="w-full gap-2" onClick={runAnalysis} disabled={loading}>
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
