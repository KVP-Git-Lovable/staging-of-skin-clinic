import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Gauge, Send, Star } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useRcaCase, useRcaComments } from "@/hooks/useFeedbackRca";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { AnswerControl } from "@/components/feedback/AnswerControl";
import { useRcaConfig } from "@/hooks/useRcaConfig";
import {
  asFeedbackQuestion, caseCauses, orphanedAnswers, questionsForCauses,
} from "@/lib/rcaQuestions";
import { answerMap, type AnswerMap } from "@/lib/feedbackQuestions";
import { npsCategory, ratingLabel } from "@/lib/feedbackScores";
import {
  NO_PATIENT_ID,
  RCA_CLOSED_STATUSES,
  RCA_OPENED_REASONS,
  RCA_ROOT_CAUSES,
  RCA_STATUSES,
  rcaStatusClass,
  rcaStatusLabel,
  type RcaStatus,
} from "@/lib/feedbackRca";
import { toast } from "sonner";

/**
 * One root-cause case: what the patient scored, and what the clinic found.
 *
 * The discussion below is append-only - there is no update or delete grant on
 * feedback_rca_comments for any role, so what somebody wrote after phoning a
 * patient cannot later be tidied up. The author is stamped by a database
 * trigger rather than sent from here, so a comment cannot be posted under
 * someone else's name.
 */
export default function FeedbackRcaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: rca, isLoading, error } = useRcaCase(id);
  const { data: comments = [] } = useRcaComments(id);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);

  const { data: staff = [] } = useQuery({
    queryKey: ["rca-assignable-staff"],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select("id, first_name, last_name")
        .not("is_active", "is", false)
        .order("first_name");
      return (data || []).map((s) => ({
        id: s.id,
        name: [s.first_name, s.last_name].filter(Boolean).join(" ") || "Staff member",
      }));
    },
  });

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["feedback-rca"] }),
      // The patient's own record shows the case status beside the feedback.
      qc.invalidateQueries({ queryKey: ["patient-feedback", "by-patient"] }),
    ]);

  const { causes, questions } = useRcaConfig();
  const chosen = caseCauses(rca?.root_causes ?? rca?.root_cause);
  const asked = questionsForCauses(causes, questions, chosen);
  const [answers, setAnswers] = useState<AnswerMap>({});
  // Seeded from the case, then held locally so typing is not a round trip.
  useEffect(() => { setAnswers(answerMap(rca?.answers)); }, [rca?.id, rca?.answers]);
  const orphaned = orphanedAnswers(asked, answers);

  const patch = async (changes: {
    status?: string; assigned_to?: string | null; root_cause?: string | null;
    root_causes?: string[]; answers?: AnswerMap;
  }) => {
    if (!rca) return;
    // answers is jsonb; the generated types want Json, and an AnswerMap is
    // one round-trip away from being exactly that.
    const payload = changes.answers
      ? { ...changes, answers: JSON.parse(JSON.stringify(changes.answers)) }
      : changes;
    const { error: err } = await supabase.from("feedback_rca").update(payload).eq("id", rca.id);
    if (err) {
      toast.error(err.message);
      return;
    }
    await refresh();
  };

  const postComment = async () => {
    if (!rca || !comment.trim()) return;
    setPosting(true);
    try {
      // author_id and author_name are deliberately not sent: the
      // feedback_rca_comment_stamp trigger fills them from the signed-in
      // staff row, so they cannot be spoofed from here.
      const { error: err } = await supabase
        .from("feedback_rca_comments")
        .insert({ rca_id: rca.id, body: comment.trim() });
      if (err) throw err;
      setComment("");
      await qc.invalidateQueries({ queryKey: ["feedback-rca", "comments", rca.id] });
      toast.success("Comment saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPosting(false);
    }
  };

  if (isLoading) return <p className="p-6 text-center text-muted-foreground">Loading case…</p>;
  if (error || !rca) {
    return (
      <div className="p-6 py-16 text-center space-y-3">
        <p className="text-destructive">{(error as Error)?.message || "This case is no longer available."}</p>
        <Button variant="outline" onClick={() => navigate("/feedback-rca")}>
          Back to Root Cause Analysis
        </Button>
      </div>
    );
  }

  const closed = RCA_CLOSED_STATUSES.includes(rca.status as RcaStatus);
  const fb = rca.feedback;

  const patientName = fb?.patient_name || "Unnamed patient";
  // NO_PATIENT_ID is the zero uuid the Feedback tab writes when a visit has
  // no patient; it would link to a patient page that does not exist.
  const patientHref =
    rca.patient_id && rca.patient_id !== NO_PATIENT_ID ? `/patients/${rca.patient_id}` : null;

  // The patient may have edited their score since the case opened.
  const drifted = fb && (fb.nps_score !== rca.nps_score_at_open || fb.service_rating !== rca.service_rating_at_open);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate("/feedback-rca")}>
        <ArrowLeft className="h-4 w-4" /> Back to Root Cause Analysis
      </Button>

      <div className="max-w-4xl space-y-5">
        <header className="space-y-3">
          {/* The name is the way to the patient's record. The warning icon
              stays outside it: it marks the case, not the person, and an
              icon that navigates to somebody's record reads wrong. */}
          <h1 className="text-2xl font-semibold flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 mt-1 shrink-0 text-destructive" />
            {patientHref ? (
              <Link to={patientHref} className="hover:underline underline-offset-4">
                {patientName}
              </Link>
            ) : (
              patientName
            )}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className={rcaStatusClass[rca.status] ?? ""}>
              {rcaStatusLabel(rca.status)}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Gauge className="h-3 w-3" /> {rca.nps_score_at_open}/10 {npsCategory(rca.nps_score_at_open)}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Star className="h-3 w-3" /> {rca.service_rating_at_open}/5 {ratingLabel(rca.service_rating_at_open)}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {RCA_OPENED_REASONS[rca.opened_reason] ?? "Flagged"} · opened{" "}
              {format(new Date(rca.created_at), "d MMM yyyy")}
            </span>
          </div>
        </header>

        <section className="rounded-lg border p-4 space-y-2">
          <h2 className="font-semibold text-sm">What the patient said</h2>
          {fb?.comments?.trim() ? (
            <p className="text-sm whitespace-pre-wrap break-words">“{fb.comments.trim()}”</p>
          ) : (
            // True for 21 of the first 24 cases. Worth saying plainly rather
            // than leaving a blank space that reads like a loading failure.
            <p className="text-sm text-muted-foreground">
              They left no comment — the score is all we have, which is why this case exists.
            </p>
          )}
          {drifted && fb && (
            <p className="text-xs text-warning">
              The patient has since changed their answer to {fb.nps_score}/10 and {fb.service_rating}/5
              {fb.last_edited_by === "patient" && fb.updated_at
                ? ` on ${format(new Date(fb.updated_at), "d MMM yyyy")}`
                : ""}
              . This case stays open until someone closes it.
            </p>
          )}
        </section>

        <section className="rounded-lg border p-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Status</Label>
            <SearchableSelect
              value={rca.status}
              onChange={(status) => patch({ status })}
              options={RCA_STATUSES.map((s) => ({ id: s.value, name: s.label }))}
            />
          </div>
          <div className="space-y-1">
            <Label>Assigned to</Label>
            <SearchableSelect
              value={rca.assigned_to || ""}
              onChange={(assigned_to) => patch({ assigned_to: assigned_to || null })}
              options={[{ id: "", name: "Nobody yet" }, ...staff]}
              placeholder="Choose someone"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Root cause</Label>
            <p className="text-xs text-muted-foreground">
              More than one may apply. Choosing one brings up what the clinic asks about it.
            </p>
            {/* A retired cause still shows when a case already carries it: a
                case worked months ago should read the way it was worked. */}
            <div className="flex flex-wrap gap-2">
              {causes
                .filter((c) => c.is_active || chosen.includes(c.code))
                .map((c) => {
                  const on = chosen.includes(c.code);
                  return (
                    <Button
                      key={c.id}
                      type="button"
                      size="sm"
                      variant={on ? "default" : "outline"}
                      onClick={() => patch({ root_causes: on ? chosen.filter((x) => x !== c.code) : [...chosen, c.code] })}
                    >
                      {c.label}
                    </Button>
                  );
                })}
            </div>
            {closed && !chosen.length && (
              <p className="text-xs text-warning">
                This case is closed with no cause recorded, so it will not appear in any count of why patients
                are unhappy.
              </p>
            )}
          </div>
        </section>

        {/* What the clinic asks once it knows why. Sits directly BELOW the
            cause picker, because the questions follow from the choice made
            there - above it, somebody would pick a cause and have to scroll
            back up to find what appeared. Configured per cause at
            Admin > Feedback; a case with no cause chosen shows nothing. */}
        {asked.length > 0 && (
          <section className="rounded-lg border p-4 space-y-4" data-testid="rca-followup">
            <div>
              <h2 className="font-semibold">About this cause</h2>
              <p className="text-xs text-muted-foreground">Answers are saved as you go.</p>
            </div>
            {asked.map((q) => (
              <div key={q.id} className="space-y-2">
                <Label className="text-sm">
                  {q.question_text}
                  {q.is_required && <span className="text-destructive"> *</span>}
                </Label>
                {q.help_text && <p className="text-xs text-muted-foreground">{q.help_text}</p>}
                <AnswerControl
                  question={asFeedbackQuestion(q)}
                  value={answers[q.id] ?? null}
                  onChange={(value) => {
                    const next = { ...answers, [q.id]: value };
                    setAnswers(next);
                    void patch({ answers: next });
                  }}
                />
              </div>
            ))}
            {orphaned.length > 0 && (
              // Said out loud rather than hidden: the answers are still in the
              // record, and a cause can be put back to see them again.
              <p className="text-xs text-muted-foreground border-t pt-3">
                {orphaned.length} earlier answer{orphaned.length === 1 ? "" : "s"} belonged to a cause that is no
                longer chosen. {orphaned.length === 1 ? "It is" : "They are"} kept, not deleted.
              </p>
            )}
          </section>
        )}

        <section className="space-y-3">
          <h2 className="font-semibold text-sm">
            Discussion {comments.length > 0 && <span className="text-muted-foreground">({comments.length})</span>}
          </h2>
          {comments.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing recorded yet. After speaking to the patient, write down what they said.
            </p>
          )}
          {comments.map((c) => (
            <div key={c.id} className="border-b pb-3">
              <div className="text-xs text-muted-foreground">
                {c.author_name} · {new Date(c.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
              </div>
              <p className="text-sm whitespace-pre-wrap break-words mt-1">{c.body}</p>
            </div>
          ))}
          <div className="space-y-2">
            <Textarea
              rows={3}
              value={comment}
              placeholder="What did the patient say when you called?"
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={posting || !comment.trim()} onClick={postComment}>
                <Send className="h-4 w-4 mr-2" />
                Add to discussion
              </Button>
              {/* Said out loud, because it is unusual and it changes how
                  people write. */}
              <span className="text-xs text-muted-foreground">
                Saved permanently — comments cannot be edited or deleted.
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
