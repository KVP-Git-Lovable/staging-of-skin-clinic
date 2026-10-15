import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useJourneyStaff } from "@/hooks/useJourneyStaff";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseCanvas, validateCanvas } from "@/lib/comms/journeyGraph";
import { audienceSummary, invokeJourneyActions, type Journey } from "@/lib/comms/journeys";
import { summarizeSchedule } from "@/lib/comms/schedule";

export function SubmitApprovalDialog({
  journey,
  onOpenChange,
}: {
  journey: Journey | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { staffProfile } = useAuth();
  const { approvers } = useJourneyStaff();
  const [approverId, setApproverId] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (journey) {
      setApproverId("");
      setNotes("");
    }
  }, [journey]);

  const problems = journey ? validateCanvas(parseCanvas(journey.canvas_data)) : [];
  const noAudience = !journey?.audience_config?.segments?.length;
  const others = approvers.filter((a) => a.id !== staffProfile?.id);
  const me = approvers.find((a) => a.id === staffProfile?.id);
  // With no other admin or manager, the submitter (if eligible) may approve their own journey.
  const selfOnly = others.length === 0 && !!me;
  const options = (selfOnly ? [me!] : others).map((a) => ({ id: a.id, name: `${a.name} · ${a.roleName}${a.id === staffProfile?.id ? " (you)" : ""}` }));

  const submit = useMutation({
    mutationFn: () => invokeJourneyActions({ action: "submit-for-approval", journey_id: journey!.id, approver_id: approverId, notes }),
    onSuccess: () => {
      toast.success("Submitted for approval");
      qc.invalidateQueries({ queryKey: ["comms-journeys"] });
      qc.invalidateQueries({ queryKey: ["comms-journey", journey?.id] });
      qc.invalidateQueries({ queryKey: ["comms-journey-approvals"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const messages = journey ? parseCanvas(journey.canvas_data).nodes.filter((n) => n.type === "message") : [];

  return (
    <Dialog open={!!journey} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit for Approval</DialogTitle>
          <DialogDescription>An approver reviews the journey before it can be activated.</DialogDescription>
        </DialogHeader>
        {journey && (
          <div className="space-y-4">
            <div className="space-y-1.5 rounded-lg border p-3 text-sm">
              <p className="font-medium">{journey.name}</p>
              <p className="text-muted-foreground">Audience: {audienceSummary(journey.audience_config)}</p>
              <p className="text-muted-foreground">Schedule: {journey.schedule ? summarizeSchedule(journey.schedule) : "Runs as soon as it is activated"}</p>
              <p className="text-muted-foreground">
                Messages: {messages.length} WhatsApp template step{messages.length === 1 ? "" : "s"}
                {messages.some((m) => m.data.template_category === "MARKETING") && " · includes MARKETING templates"}
              </p>
            </div>

            {(noAudience || problems.length > 0) && (
              <ul className="list-disc space-y-1 rounded-md bg-destructive/10 p-3 pl-7 text-sm text-destructive">
                {noAudience && <li>Choose an audience segment (Edit journey)</li>}
                {problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}

            {selfOnly && (
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                There is no other admin or manager, so you can be the approver. After submitting, open View Approvals to approve it.
              </p>
            )}
            <div>
              <Label>Approver</Label>
              <div className="mt-1.5">
                <SearchableSelect
                  value={approverId}
                  onChange={setApproverId}
                  options={options}
                  placeholder="Select an approver"
                  searchPlaceholder="Search staff…"
                  emptyText="No admin or manager is available to approve"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="approval-notes">Notes (optional)</Label>
              <Textarea id="approval-notes" className="mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the approver should know" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!approverId || noAudience || problems.length > 0 || submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
