import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, Sparkles, Lightbulb } from "lucide-react";

export interface SkinMetric {
  name: string;
  before: number;
  after: number;
  change: "improved" | "worsened" | "unchanged";
}

export interface SkinAnalysis {
  overallImprovement: number;
  summary: string;
  metrics: SkinMetric[];
  details: string;
  recommendations: string[];
}

interface SkinAnalysisResultsProps {
  analysis: SkinAnalysis;
}

function ChangeIcon({ change }: { change: string }) {
  if (change === "improved") return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
  if (change === "worsened") return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function changeBadgeVariant(change: string) {
  if (change === "improved") return "default" as const;
  if (change === "worsened") return "destructive" as const;
  return "secondary" as const;
}

export function SkinAnalysisResults({ analysis }: SkinAnalysisResultsProps) {
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Overall Score */}
      <Card className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h4 className="font-display font-semibold text-sm">AI Skin Analysis</h4>
        </div>
        <div className="flex items-center gap-4 mb-3">
          <div className="text-3xl font-bold text-primary">{analysis.overallImprovement}%</div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">Overall Improvement</p>
            <Progress value={analysis.overallImprovement} className="h-2" />
          </div>
        </div>
        <p className="text-sm text-foreground/80">{analysis.summary}</p>
      </Card>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-2">
        {analysis.metrics.map((metric) => (
          <Card key={metric.name} className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium truncate">{metric.name}</span>
              <Badge variant={changeBadgeVariant(metric.change)} className="text-[9px] gap-1 px-1.5">
                <ChangeIcon change={metric.change} />
                {metric.change}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{metric.before}/10</span>
              <span>→</span>
              <span className="font-semibold text-foreground">{metric.after}/10</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Details */}
      <Card className="p-4">
        <p className="text-xs text-muted-foreground leading-relaxed">{analysis.details}</p>
      </Card>

      {/* Recommendations */}
      {analysis.recommendations?.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <h4 className="text-xs font-semibold">Recommendations</h4>
          </div>
          <ul className="space-y-1.5">
            {analysis.recommendations.map((rec, i) => (
              <li key={i} className="text-xs text-muted-foreground flex gap-2">
                <span className="text-primary font-bold">•</span>
                {rec}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
