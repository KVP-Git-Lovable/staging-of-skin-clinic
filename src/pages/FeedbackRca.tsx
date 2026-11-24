import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Gauge, Search, Star } from "lucide-react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { useRcaCases } from "@/hooks/useFeedbackRca";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { npsCategory, ratingLabel } from "@/lib/feedbackScores";
import { thresholdSentence } from "@/lib/feedbackThresholds";
import { useFeedbackSettings } from "@/hooks/useFeedbackSettings";
import { useAuth } from "@/hooks/useAuth";
import { RCA_OPENED_REASONS, RCA_STATUSES, rcaRootCauseLabel, rcaStatusClass, rcaStatusLabel } from "@/lib/feedbackRca";

/**
 * The root-cause worklist.
 *
 * Built because nothing in this app watched for a bad score. In the six weeks
 * before it existed, 24 responses came in at NPS <= 6 or a service rating
 * <= 3 and every one of them went unnoticed - there was no feedback list page,
 * no low-score query and no alert. Three of those 24 left a comment, of 20, 4
 * and 4 characters, so the scores did not even explain themselves.
 *
 * Cases arrive here on their own: a database trigger opens one the moment a
 * low score is recorded, or the moment a patient edits their own score down
 * from the portal. Nobody has to remember to create them.
 */
export default function FeedbackRca() {
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const { data: cases = [], isLoading, error } = useRcaCases(status);
  const { thresholds } = useFeedbackSettings();
  const { isAdmin } = useAuth();

  const term = search.trim().toLowerCase();
  const rows = term
    ? cases.filter((c) => (c.feedback?.patient_name || "").toLowerCase().includes(term))
    : cases;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Root Cause Analysis
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Low feedback scores, and what the clinic found out about them.
          </p>
          {/* The rule in force. A worklist that cannot say why these cases and
              not others is one you have to take on faith. */}
          <p className="text-xs text-muted-foreground mt-1" data-testid="rca-rule">
            {thresholdSentence(thresholds)}
            {isAdmin && (
              <Button asChild variant="link" className="h-auto p-0 ml-1 text-xs align-baseline">
                <Link to="/admin/feedback">Change this</Link>
              </Button>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={status === "open" ? "default" : "outline"} onClick={() => setStatus("open")}>
          Open
        </Button>
        {RCA_STATUSES.filter((s) => s.value !== "open").map((s) => (
          <Button
            key={s.value}
            size="sm"
            variant={status === s.value ? "default" : "outline"}
            onClick={() => setStatus(s.value)}
          >
            {s.label}
          </Button>
        ))}
        <Button size="sm" variant={status === "all" ? "default" : "outline"} onClick={() => setStatus("all")}>
          All
        </Button>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search patient…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error ? (
        <p className="py-16 text-center text-destructive">{(error as Error).message}</p>
      ) : isLoading ? (
        <p className="py-16 text-center text-muted-foreground">Loading cases…</p>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">
            {status === "open" ? "No open cases. Every low score has been dealt with." : "Nothing here."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((c) => (
            <Link
              key={c.id}
              to={`/feedback-rca/${c.id}`}
              className="block rounded-lg border p-3 hover:bg-muted/40 transition-colors"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{c.feedback?.patient_name || "Unnamed patient"}</p>
                  <p className="text-xs text-muted-foreground">
                    {RCA_OPENED_REASONS[c.opened_reason] ?? "Flagged"} ·{" "}
                    {formatDistanceToNowStrict(new Date(c.created_at))} ago
                    {c.feedback?.created_at && ` · visit ${format(new Date(c.feedback.created_at), "d MMM yyyy")}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* The scores AT THE TIME the case opened. The patient can
                      edit their own answer from the portal afterwards, so the
                      live row may no longer say what caused this. */}
                  <Badge variant="outline" className="gap-1">
                    <Gauge className="h-3 w-3" /> {c.nps_score_at_open}/10 {npsCategory(c.nps_score_at_open)}
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Star className="h-3 w-3" /> {c.service_rating_at_open}/5 {ratingLabel(c.service_rating_at_open)}
                  </Badge>
                  <Badge variant="secondary" className={rcaStatusClass[c.status] ?? ""}>
                    {rcaStatusLabel(c.status)}
                  </Badge>
                </div>
              </div>
              {(c.assignee || c.root_cause) && (
                <p className="text-xs text-muted-foreground mt-2">
                  {c.assignee && `Assigned to ${[c.assignee.first_name, c.assignee.last_name].filter(Boolean).join(" ")}`}
                  {c.assignee && c.root_cause && " · "}
                  {c.root_cause && `Cause: ${rcaRootCauseLabel(c.root_cause)}`}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
