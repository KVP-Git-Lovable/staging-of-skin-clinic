import { usePatientFeedback } from "@/hooks/usePatientFeedback";
import { Link } from "react-router-dom";
import { MessageSquareHeart, Star, Gauge, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { StatCard } from "@/components/dashboard/StatCard";
import { kpiColumnClass } from "@/lib/kpiGrid";
import { Badge } from "@/components/ui/badge";
import { npsBreakdown, npsCategory, ratingLabel } from "@/lib/feedbackScores";
import {
  RCA_OPENED_REASONS,
  rcaRootCauseLabel,
  rcaStatusClass,
  rcaStatusLabel,
} from "@/lib/feedbackRca";

/**
 * A patient's feedback, rolled up and listed.
 *
 * The clinic collects feedback well - 52% of appointments since it started -
 * and then it was only ever visible one visit at a time, on the appointment
 * that produced it. Nothing on the patient record read it at all. This is the
 * roll-up: what this patient has said across every visit, and whether anything
 * was done about the bad ones.
 *
 * ── Why the averages are not computed here ──
 *
 * npsBreakdown() in src/lib/feedbackScores.ts already does it, and is already
 * behind the Patient Feedback report's summary cards and the dashboard's NPS
 * card. A second mean written here is how the same patient ends up reading
 * 4.8 on one screen and 4.84 on another. It also keeps the distinction that
 * module is careful about: the Net Promoter Score (-100..100) and the mean of
 * the 0-10 answers are different numbers.
 */

const OPEN_STATUSES = ["open", "in_progress"];

export function PatientFeedbackSummary({ patientId }: { patientId: string }) {
  const { data, isLoading } = usePatientFeedback(patientId);
  const rows = data?.rows ?? [];
  const cases = data?.cases ?? [];

  // Nothing to roll up, and no empty card to explain it away.
  if (!isLoading && rows.length === 0) return null;

  const summary = npsBreakdown(rows);
  const openCases = cases.filter((c) => OPEN_STATUSES.includes(c.status)).length;
  const cards = openCases > 0 ? 4 : 3;

  return (
    <div className={`grid gap-3 ${kpiColumnClass(cards)}`}>
      <StatCard
        compact
        loading={isLoading}
        title="Feedback responses"
        value={summary.responses}
        // 715 of the 829 patients who have given feedback have given it once.
        // Calling a single answer an average, or drawing a trend through one
        // point, would be a lie the card tells every time it is shown.
        change={summary.responses === 1 ? "From one visit" : `Across ${summary.responses} visits`}
        icon={MessageSquareHeart}
      />
      <StatCard
        compact
        loading={isLoading}
        title={summary.responses === 1 ? "Service rating" : "Average service rating"}
        value={summary.averageRating === null ? "—" : `${summary.averageRating} / 5`}
        change={ratingLabel(summary.averageRating)}
        icon={Star}
        iconColor="bg-warning/10 text-warning"
      />
      <StatCard
        compact
        loading={isLoading}
        title={summary.responses === 1 ? "Recommendation score" : "Average recommendation"}
        value={summary.averageScore === null ? "—" : `${summary.averageScore} / 10`}
        // The category, not the Net Promoter Score: NPS is a property of a
        // group, and this is one patient.
        change={npsCategory(summary.averageScore)}
        icon={Gauge}
        iconColor="bg-info/10 text-info"
      />
      {openCases > 0 && (
        <StatCard
          compact
          loading={isLoading}
          title="Open root-cause cases"
          value={openCases}
          change="Needs follow-up"
          changeType="negative"
          icon={AlertTriangle}
          iconColor="bg-destructive/10 text-destructive"
        />
      )}
    </div>
  );
}

export function PatientFeedbackList({ patientId }: { patientId: string }) {
  const { data, isLoading, error } = usePatientFeedback(patientId);
  const rows = data?.rows ?? [];
  const cases = data?.cases ?? [];
  const caseFor = (feedbackId: string) => cases.find((c) => c.feedback_id === feedbackId);

  if (isLoading) return <p className="py-10 text-center text-muted-foreground text-sm">Loading feedback…</p>;
  if (error) return <p className="py-10 text-center text-destructive text-sm">{(error as Error).message}</p>;
  if (!rows.length) {
    return (
      <div className="py-12 text-center space-y-2">
        <MessageSquareHeart className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-muted-foreground text-sm">This patient has not given feedback yet.</p>
        <p className="text-muted-foreground text-xs">
          Feedback is recorded on the appointment at the end of a visit.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const rca = caseFor(row.id);
        const visit = row.appointment?.start_time;
        return (
          <div key={row.id} className="rounded-lg border p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">
                {visit ? format(new Date(visit), "d MMM yyyy") : format(new Date(row.created_at), "d MMM yyyy")}
                {row.appointment?.service && (
                  <span className="text-muted-foreground font-normal"> · {row.appointment.service}</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  <Star className="h-3 w-3" /> {row.service_rating}/5 {ratingLabel(row.service_rating)}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Gauge className="h-3 w-3" /> {row.nps_score}/10 {npsCategory(row.nps_score)}
                </Badge>
              </div>
            </div>

            {row.comments?.trim() && (
              <p className="text-sm whitespace-pre-wrap break-words text-muted-foreground">
                “{row.comments.trim()}”
              </p>
            )}

            {/* The patient can correct their own answer from the portal, and a
                reader needs to know they are looking at a corrected one. */}
            {row.last_edited_by === "patient" && row.updated_at && (
              <p className="text-xs text-muted-foreground">
                Edited by the patient on {format(new Date(row.updated_at), "d MMM yyyy")}
              </p>
            )}

            {rca && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                <Badge className={rcaStatusClass[rca.status] ?? ""} variant="secondary">
                  {rcaStatusLabel(rca.status)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {RCA_OPENED_REASONS[rca.opened_reason] ?? "Flagged for review"}
                  {rca.root_cause && ` · ${rcaRootCauseLabel(rca.root_cause)}`}
                </span>
                <Link to={`/feedback-rca/${rca.id}`} className="text-xs text-primary hover:underline ml-auto">
                  Open case
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
