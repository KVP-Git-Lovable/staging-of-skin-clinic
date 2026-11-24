import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, MessageSquareWarning, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeedbackSettings } from "@/hooks/useFeedbackSettings";
import {
  NPS_MAX, NPS_MIN, RATING_MAX, RATING_MIN, thresholdSentence, validateThresholds,
  type FeedbackThresholds,
} from "@/lib/feedbackThresholds";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NumberField } from "@/components/shared/NumberField";
import { SettingRow } from "@/components/attendance/SettingRow";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeedbackQuestionsEditor } from "@/components/feedback/FeedbackQuestionsEditor";
import { QuestionThresholds } from "@/components/feedback/QuestionThresholds";
import { RcaCausesEditor } from "@/components/feedback/RcaCausesEditor";

/**
 * Which feedback gets somebody's name on it.
 *
 * The rule that opens a root-cause case used to be two numbers written into a
 * database function - the clinic could not change it without a migration, so it
 * never changed. One row now, edited here.
 *
 * ── Why the count is on this screen ──
 *
 * The numbers look harmless and are not. On the clinic's own history, the rule
 * as it stands produces 28 cases; moving the recommend score from 6 to 8
 * produces 213, and every one of those notifies every admin. A settings page
 * that lets somebody discover that AFTER saving is a settings page that has
 * mislead them, so the count is re-run against the numbers in the boxes before
 * anything is saved.
 *
 * The count is history, not a promise: a change applies to feedback recorded or
 * edited from the moment it is saved. Nothing retroactive happens, which is why
 * the sentence under it says so.
 */
export default function FeedbackSettings() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const { thresholds, isLoading, error } = useFeedbackSettings();
  const [form, setForm] = useState<FeedbackThresholds>(thresholds);
  const [saving, setSaving] = useState(false);

  // Seeded from the row once it arrives, through the same resolver the rest of
  // the app uses, so the boxes show what the database actually does.
  //
  // The two numbers, not the object: thresholdsFrom builds a fresh object every
  // render, so depending on it would reseed the form on each keystroke and the
  // boxes could never be edited.
  const { npsAtOrBelow, ratingAtOrBelow } = thresholds;
  useEffect(() => {
    if (!isLoading && !error) setForm({ npsAtOrBelow, ratingAtOrBelow });
  }, [isLoading, error, npsAtOrBelow, ratingAtOrBelow]);

  const dirty =
    form.npsAtOrBelow !== thresholds.npsAtOrBelow || form.ratingAtOrBelow !== thresholds.ratingAtOrBelow;
  const complaint = validateThresholds(form);

  /** How many of the clinic's own records this rule would have picked up. */
  const { data: preview } = useQuery({
    queryKey: ["feedback-threshold-preview", form.npsAtOrBelow, form.ratingAtOrBelow],
    enabled: !complaint,
    queryFn: async () => {
      const [matching, total] = await Promise.all([
        supabase
          .from("patient_feedback")
          .select("id", { count: "exact", head: true })
          .or(`nps_score.lte.${form.npsAtOrBelow},service_rating.lte.${form.ratingAtOrBelow}`),
        supabase.from("patient_feedback").select("id", { count: "exact", head: true }),
      ]);
      if (matching.error) throw matching.error;
      if (total.error) throw total.error;
      return { matching: matching.count ?? 0, total: total.count ?? 0 };
    },
  });

  const save = async () => {
    if (complaint) { toast.error(complaint); return; }
    setSaving(true);
    try {
      const { data, error: saveError } = await supabase
        .from("feedback_settings")
        .update({
          nps_at_or_below: form.npsAtOrBelow,
          rating_at_or_below: form.ratingAtOrBelow,
          updated_at: new Date().toISOString(),
        })
        .eq("singleton", true)
        .select("singleton");
      if (saveError) throw saveError;
      // A row-level refusal on UPDATE is not an error - it simply matches no
      // rows. Without this check a non-admin would be told "Saved".
      if (!data?.length) throw new Error("Nothing was saved. Changing this needs an Admin role.");
      await qc.invalidateQueries({ queryKey: ["feedback-settings"] });
      toast.success("Feedback rule saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-3xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <MessageSquareWarning className="h-6 w-6 text-primary" />Feedback
        </h1>
        <p className="text-sm text-muted-foreground">
          When a visit gets a low score, the app opens a Root Cause Analysis case so somebody follows it up.
          This is where you set how low is low enough.
        </p>
      </header>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          The current rule could not be read: {(error as Error).message}
        </p>
      )}

      <Tabs defaultValue="questions">
        <TabsList>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="rules">When a case opens</TabsTrigger>
          <TabsTrigger value="causes">Case causes</TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="pt-4">
          <FeedbackQuestionsEditor canEdit={!!isAdmin} />
        </TabsContent>

        <TabsContent value="rules" className="pt-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Open a case when</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <SettingRow
            label="Recommend score is this or less"
            hint={`The 0 to ${NPS_MAX} question. A higher number here means more cases.`}
          >
            <NumberField
              value={form.npsAtOrBelow}
              min={NPS_MIN}
              max={NPS_MAX}
              emptyValue={thresholds.npsAtOrBelow}
              onChange={(npsAtOrBelow) => setForm((f) => ({ ...f, npsAtOrBelow }))}
              className="w-24"
              aria-label="Recommend score at or below"
            />
          </SettingRow>

          <SettingRow
            label="Service rating is this or less"
            hint={`The ${RATING_MIN} to ${RATING_MAX} star question. A higher number here means more cases.`}
          >
            <NumberField
              value={form.ratingAtOrBelow}
              min={RATING_MIN}
              max={RATING_MAX}
              emptyValue={thresholds.ratingAtOrBelow}
              onChange={(ratingAtOrBelow) => setForm((f) => ({ ...f, ratingAtOrBelow }))}
              className="w-24"
              aria-label="Service rating at or below"
            />
          </SettingRow>

          {complaint ? (
            <p className="text-sm text-destructive" role="alert">{complaint}</p>
          ) : (
            <div className="rounded-md border bg-muted/40 p-4 space-y-2" data-testid="threshold-preview">
              <p className="text-sm">{thresholdSentence(form)}</p>
              {preview && (
                <p className="text-sm font-medium">
                  Looking back, that rule covers{" "}
                  <span className={preview.matching > 100 ? "text-warning" : undefined}>
                    {preview.matching} of your {preview.total} feedback records
                  </span>.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Saving changes what happens from now on. Feedback already recorded is left alone and no
                existing case is opened, closed or changed — so this number is history, not a to-do list.
              </p>
            </div>
          )}

          <QuestionThresholds canEdit={!!isAdmin} />

          {!isAdmin && (
            <p className="text-sm text-warning flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              Only an admin can change this. You can see the rule in force.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <Button onClick={save} disabled={!dirty || !!complaint || saving || isLoading}>
              <Save className="h-4 w-4 mr-2" />{saving ? "Saving…" : "Save"}
            </Button>
            {dirty && <Button variant="ghost" onClick={() => setForm(thresholds)}>Undo</Button>}
            <Button asChild variant="link" className="ml-auto h-auto p-0">
              <Link to="/feedback-rca">Open the case list</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="causes" className="pt-4">
          <RcaCausesEditor canEdit={!!isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
