import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { useRcaComments } from "@/hooks/useFeedbackRca";
import { RCA_OPENED_REASONS, rcaRootCauseLabel, rcaStatusClass, rcaStatusLabel } from "@/lib/feedbackRca";

/**
 * The root-cause case sitting on a piece of feedback, wherever that feedback
 * is shown.
 *
 * This is the "related list" on a feedback record: the case, and the
 * discussion the clinic recorded against it. It is read-only here - working a
 * case happens on its own page, where the status, the assignee and the cause
 * all live together.
 *
 * It renders NOTHING when there is no case, which is the overwhelming majority
 * of feedback: 955 of 979 responses scored well enough that nobody needs to
 * ring the patient. A panel saying "no root cause analysis" on every happy
 * visit would be noise on a screen staff use all day.
 *
 * It also renders nothing for staff who may not read cases. The RLS policy on
 * feedback_rca refuses the select for anyone who is not an active admin or
 * doctor, which comes back as an empty result rather than an error - so a
 * receptionist simply sees the feedback, as before.
 */
export function FeedbackRcaPanel({ feedbackId }: { feedbackId: string | undefined }) {
  const { data: rca } = useQuery({
    queryKey: ["feedback-rca", "by-feedback", feedbackId],
    enabled: !!feedbackId,
    queryFn: async () => {
      const { data } = await supabase
        .from("feedback_rca")
        .select("id, status, root_cause, opened_reason, assigned_to")
        .eq("feedback_id", feedbackId!)
        .maybeSingle();
      return data;
    },
  });

  const { data: comments = [] } = useRcaComments(rca?.id);

  if (!rca) return null;

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" /> Root cause analysis
        </h4>
        <Badge variant="secondary" className={rcaStatusClass[rca.status] ?? ""}>
          {rcaStatusLabel(rca.status)}
        </Badge>
        <Link to={`/feedback-rca/${rca.id}`} className="text-xs text-primary hover:underline ml-auto">
          Open case
        </Link>
      </div>

      <p className="text-xs text-muted-foreground">
        {RCA_OPENED_REASONS[rca.opened_reason] ?? "Flagged for review"}
        {rca.root_cause ? ` · Cause: ${rcaRootCauseLabel(rca.root_cause)}` : " · Cause not established yet"}
      </p>

      {comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nothing recorded yet. Open the case to write down what the patient said.
        </p>
      ) : (
        <div className="space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="text-xs">
              <span className="text-muted-foreground">
                {c.author_name} · {new Date(c.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
              </span>
              <p className="whitespace-pre-wrap break-words mt-0.5">{c.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
