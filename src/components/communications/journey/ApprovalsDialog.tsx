import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useJourneyStaff } from "@/hooks/useJourneyStaff";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { parseCanvas } from "@/lib/comms/journeyGraph";
import {
  audienceSummary,
  invokeJourneyActions,
  JOURNEY_SELECT,
  normalizeJourney,
  type ApprovalStatus,
  type Journey,
} from "@/lib/comms/journeys";
import { summarizeSchedule } from "@/lib/comms/schedule";

const TABS: { value: Exclude<ApprovalStatus, "draft">; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function useApprovals(tab: string, enabled: boolean) {
  const { staffProfile } = useAuth();
  return useQuery({
    queryKey: ["comms-journey-approvals", tab, staffProfile?.id],
    enabled: enabled && !!staffProfile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comms_journeys")
        .select(JOURNEY_SELECT)
        .eq("approval_status", tab)
        .eq("approver_id", staffProfile!.id)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((r) => normalizeJourney(r as Record<string, unknown>));
    },
  });
}

export function usePendingApprovalCount() {
  const { data } = useApprovals("pending", true);
  return data?.length ?? 0;
}

export function ApprovalsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const { nameOf } = useJourneyStaff();
  const [tab, setTab] = useState<Exclude<ApprovalStatus, "draft">>("pending");
  const [channel, setChannel] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rejectTarget, setRejectTarget] = useState<Journey | null>(null);
  const [reason, setReason] = useState("");

  const { data: rows = [], isLoading } = useApprovals(tab, open);

  const visible = useMemo(
    () =>
      rows.filter((j) => {
        if (channel !== "all" && !parseCanvas(j.canvas_data).nodes.some((n) => n.type === "message")) return false;
        const submitted = j.submitted_at ? j.submitted_at.slice(0, 10) : "";
        if (from && submitted < from) return false;
        if (to && submitted > to) return false;
        return true;
      }),
    [rows, channel, from, to]
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["comms-journey-approvals"] });
    qc.invalidateQueries({ queryKey: ["comms-journeys"] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => invokeJourneyActions({ action: "approve", journey_id: id }),
    onSuccess: () => {
      toast.success("Journey approved");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: () => invokeJourneyActions({ action: "reject", journey_id: rejectTarget!.id, reason }),
    onSuccess: () => {
      toast.success("Journey rejected");
      setRejectTarget(null);
      setReason("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Journey Approvals</DialogTitle>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">Channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          <div className="max-h-[50vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Journey</TableHead>
                  <TableHead>Submitted By</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Channels</TableHead>
                  <TableHead>Audience</TableHead>
                  {tab === "rejected" && <TableHead>Reason</TableHead>}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      {rows.length === 0 ? "No approvals assigned" : "No items match the filters"}
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="font-medium">
                        <Link to={`/communications/journeys/${j.id}`} className="hover:underline" onClick={() => onOpenChange(false)}>{j.name}</Link>
                        {j.approval_notes && <p className="text-xs font-normal text-muted-foreground">{j.approval_notes}</p>}
                      </TableCell>
                      <TableCell>{nameOf(j.submitted_by)}</TableCell>
                      <TableCell className="whitespace-nowrap">{j.submitted_at ? format(new Date(j.submitted_at), "d MMM yyyy, h:mm a") : "—"}</TableCell>
                      <TableCell className="max-w-48 text-sm">{j.schedule ? summarizeSchedule(j.schedule) : "On activation"}</TableCell>
                      <TableCell>WhatsApp</TableCell>
                      <TableCell className="max-w-48 text-sm">{audienceSummary(j.audience_config)}</TableCell>
                      {tab === "rejected" && <TableCell className="max-w-48 text-sm text-destructive">{j.rejection_reason}</TableCell>}
                      <TableCell>
                        {tab === "pending" && (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" disabled={approve.isPending} onClick={() => approve.mutate(j.id)}>
                              <Check className="mr-1 h-4 w-4" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="text-destructive" onClick={() => setRejectTarget(j)}>
                              <X className="mr-1 h-4 w-4" /> Reject
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject "{rejectTarget?.name}"</DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea id="reject-reason" className="mt-1.5" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tell the creator what to change" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!reason.trim() || reject.isPending} onClick={() => reject.mutate()}>
              {reject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
