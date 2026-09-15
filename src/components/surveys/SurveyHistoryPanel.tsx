import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ClipboardList, Bot, FileText, Pencil, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SurveyAuditInfo } from "./SurveyAuditInfo";

interface Props {
  patientId?: string | null;
  appointmentId?: string | null;
  limit?: number;
}

function aiText(rec: any): string | null {
  if (!rec) return null;
  if (typeof rec === "string") return rec;
  return rec.text || rec.recommendation || null;
}

export function SurveyHistoryPanel({ patientId, appointmentId, limit = 10 }: Props) {
  const { data: responses = [], isLoading } = useQuery({
    queryKey: ["survey-history", patientId, appointmentId, limit],
    enabled: !!patientId || !!appointmentId,
    queryFn: async () => {
      let q = supabase
        .from("survey_responses")
        .select("id, created_at, updated_at, created_by, updated_by, dr_status, ai_recommendation, ai_products, ai_services, appointment_id, survey_templates(name)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (patientId) q = q.eq("patient_id", patientId);
      else q = q.eq("appointment_id", appointmentId!);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (responses.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        <ClipboardList className="h-5 w-5 mx-auto mb-2 opacity-60" />
        No surveys filled for this patient yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {responses.map((r: any) => {
        const text = aiText(r.ai_recommendation);
        return (
          <div key={r.id} className="rounded-xl border bg-card p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-semibold">{r.survey_templates?.name || "Survey"}</span>
              <Badge variant="outline" className="text-[10px]">
                {r.dr_status === "approved" ? "✅ Approved" : r.dr_status === "modified" ? "✏️ Modified" : "⏳ Pending Review"}
              </Badge>
              {appointmentId && r.appointment_id === appointmentId && (
                <Badge variant="secondary" className="text-[10px]">This appointment</Badge>
              )}
            </div>

            {text && (
              <div className="rounded-md bg-muted/50 p-2.5">
                <p className="text-[11px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <Bot className="h-3 w-3" /> AI Summary
                </p>
                <p className="text-sm whitespace-pre-wrap break-words">{text}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span>{(r.ai_products || []).length} product(s)</span>
              <span>·</span>
              <span>{(r.ai_services || []).length} service(s)</span>
              <span>·</span>
              <span>{format(new Date(r.created_at), "dd MMM yyyy, hh:mm a")}</span>
            </div>

            <SurveyAuditInfo
              createdAt={r.created_at}
              createdBy={r.created_by}
              updatedAt={r.updated_at}
              updatedBy={r.updated_by}
            />

            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link to={`/surveys/${r.id}`}><FileText className="h-3.5 w-3.5" /> View filled form</Link>
              </Button>
              <Button asChild size="sm" variant="ghost" className="gap-1.5">
                <Link to={`/surveys/${r.id}/edit`}><Pencil className="h-3.5 w-3.5" /> Edit</Link>
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
