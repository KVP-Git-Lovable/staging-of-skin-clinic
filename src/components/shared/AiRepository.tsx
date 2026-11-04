import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Brain, Download, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AI_REPO_LABEL, downloadAiRecordPdf, type AiRepoRecord } from "@/lib/aiRepository";
import { caseAnalysisDate } from "@/lib/caseAnalysisDate";

interface Props {
  patientId: string;
  patientName: string;
  /** When set, only records generated from this appointment. */
  appointmentId?: string;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-2.5 bg-muted/20">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <div className="text-xs leading-relaxed">{children}</div>
    </div>
  );
}
const List = ({ items }: { items?: string[] }) => <>{(items || []).map((t, i) => <p key={i}>• {t}</p>)}</>;

function RecordBody({ rec }: { rec: AiRepoRecord }) {
  const a = rec.content || {};
  if (rec.kind === "case_analysis") {
    return (
      <div className="space-y-2">
        {a.summary && <Section label="Case Summary">{a.summary}</Section>}
        {a.timeline?.length > 0 && (
          <Section label="Clinical Timeline">
            {a.timeline.map((t: any, i: number) => <p key={i}><b>{caseAnalysisDate(t.date)} — {t.event}</b> {t.details}</p>)}
          </Section>
        )}
        {a.diagnosisHistory?.length > 0 && <Section label="Diagnosis History"><List items={a.diagnosisHistory} /></Section>}
        {a.treatmentPatterns && <Section label="Treatment Patterns">{a.treatmentPatterns}</Section>}
        {a.medicationSummary && <Section label="Medication Summary">{a.medicationSummary}</Section>}
        {a.skinProgress && <Section label="Skin Progress">{a.skinProgress}</Section>}
        {a.keyFindings?.length > 0 && <Section label="Key Findings"><List items={a.keyFindings} /></Section>}
        {a.clinicalRecommendations?.length > 0 && <Section label="Clinical Recommendations"><List items={a.clinicalRecommendations} /></Section>}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Section label="Summary"><p className="font-semibold">Overall improvement: {a.overallImprovement}%</p>{a.summary}</Section>
      {a.metrics?.length > 0 && (
        <Section label="Skin Metrics">
          {a.metrics.map((m: any) => <p key={m.name}>{m.name}: {m.before}/10 → {m.after}/10 ({m.change})</p>)}
        </Section>
      )}
      {a.details && <Section label="Detailed Observations">{a.details}</Section>}
      {a.recommendations?.length > 0 && <Section label="Recommendations"><List items={a.recommendations} /></Section>}
    </div>
  );
}

export function AiRepository({ patientId, patientName, appointmentId }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["ai-repository", patientId, appointmentId ?? null],
    enabled: !!patientId,
    queryFn: async () => {
      let q = supabase.from("ai_repository").select("*").eq("patient_id", patientId);
      if (appointmentId) q = q.eq("appointment_id", appointmentId);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as AiRepoRecord[];
    },
  });

  const download = async (rec: AiRepoRecord) => {
    setDownloading(rec.id);
    try { await downloadAiRecordPdf(rec, patientName); }
    catch (e: any) { toast.error(e?.message || "Could not create the PDF"); }
    finally { setDownloading(null); }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold font-display flex items-center gap-2">
        <Brain className="h-4 w-4" /> AI Repository
      </h3>
      <p className="text-xs text-muted-foreground">
        Every Case Analysis and Photo AI Analysis is saved here automatically — newest first.
      </p>
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : records.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8 border rounded-lg">
          No AI analysis saved yet. Run Case Analysis or Skin Tracker to add one.
        </p>
      ) : (
        records.map((rec, idx) => (
          <div key={rec.id} className="rounded-lg border bg-card">
            <div className="flex items-center gap-2 p-3">
              <button className="flex-1 text-left min-w-0" onClick={() => setOpen(open === rec.id ? null : rec.id)}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-[10px]">{AI_REPO_LABEL[rec.kind]}</Badge>
                  {idx === 0 && <Badge className="text-[10px]">Latest</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Generated {format(new Date(rec.created_at), "dd MMM yyyy, h:mm a")}
                </p>
              </button>
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => download(rec)} disabled={downloading === rec.id}>
                {downloading === rec.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                PDF
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpen(open === rec.id ? null : rec.id)}>
                {open === rec.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
            {open === rec.id && <div className="px-3 pb-3"><RecordBody rec={rec} /></div>}
          </div>
        ))
      )}
    </div>
  );
}
