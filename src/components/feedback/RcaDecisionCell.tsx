import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { rcaStatusLabel } from "@/lib/feedbackRca";
import {
  caseDecision, RCA_NOT_REQUIRED_STATUS, RCA_REQUIRED_STATUS, type FeedbackCaseRow,
} from "@/lib/feedbackCaseDecision";

/**
 * Is this low score worth investigating?
 *
 * A case opens by itself when a score comes in below the clinic's limits, and
 * an admin is notified - but nothing recorded whether anybody had looked and
 * decided. All Feedbacks asks for that decision on the row itself:
 *
 *   ✓  worth working  - the case is marked in progress and opens
 *   ✗  not worth it   - the case is marked "No action needed" and stays
 *
 * Neither deletes anything. The case, its discussion and its history are
 * exactly as they were; only its status moves, which is what the Root Cause
 * Analysis screen has always set by hand.
 */
export function RcaDecisionCell({ row }: { row: FeedbackCaseRow }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const state = caseDecision(row);

  if (state === "none") return <span className="text-muted-foreground">—</span>;

  if (state === "decided") {
    return (
      <button
        type="button"
        className="underline-offset-2 hover:underline"
        onClick={(e) => { e.stopPropagation(); navigate(`/feedback-rca/${row.rca_case_id}`); }}
      >
        <Badge variant="secondary" className="text-[10px] cursor-pointer">
          {rcaStatusLabel(row.rca_status) || "Case"}
        </Badge>
      </button>
    );
  }

  const decide = async (answer: "yes" | "no") => {
    setBusy(answer);
    try {
      // .select("id") on purpose: a refusal by the row-level rule matches no
      // rows rather than erroring, and without this the clinic would be told
      // it saved when nothing moved.
      const { data, error } = await supabase
        .from("feedback_rca")
        .update({ status: answer === "yes" ? RCA_REQUIRED_STATUS : RCA_NOT_REQUIRED_STATUS })
        .eq("id", row.rca_case_id!)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Nothing was saved. This needs permission to manage cases.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["report", "all_feedbacks"] }),
        qc.invalidateQueries({ queryKey: ["feedback-rca"] }),
      ]);
      if (answer === "yes") navigate(`/feedback-rca/${row.rca_case_id}`);
      else toast.success("Marked as no action needed.");
    } catch (e) {
      toast.error((e as Error).message || String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    // The whole row opens the visit, so the buttons must not also do that.
    <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Root cause analysis needed"
        title="Needed — open the case"
        className="h-7 w-7 text-success hover:text-success"
        disabled={!!busy}
        onClick={() => decide("yes")}
      >
        {busy === "yes" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Root cause analysis not needed"
        title="Not needed"
        className="h-7 w-7 text-destructive hover:text-destructive"
        disabled={!!busy}
        onClick={() => decide("no")}
      >
        {busy === "no" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
      </Button>
    </span>
  );
}
