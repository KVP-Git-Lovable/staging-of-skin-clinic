import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  BarChart3,
  CalendarIcon,
  GitBranch,
  Inbox,
  MessageSquare,
  Pause,
  Pencil,
  Play,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useJourneyStaff } from "@/hooks/useJourneyStaff";
import { ActivateJourneyDialog } from "@/components/communications/journey/ActivateJourneyDialog";
import { ApprovalsDialog, usePendingApprovalCount } from "@/components/communications/journey/ApprovalsDialog";
import { JourneyDetailsDialog } from "@/components/communications/journey/JourneyDetailsDialog";
import { JourneyScheduleDialog } from "@/components/communications/journey/JourneyScheduleDialog";
import { SubmitApprovalDialog } from "@/components/communications/journey/SubmitApprovalDialog";
import { MultiSelectFilter } from "@/components/communications/MultiSelectFilter";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { parseCanvas } from "@/lib/comms/journeyGraph";
import {
  approvalBadgeClass,
  approvalLabel,
  audienceSummary,
  invokeJourneyActions,
  JOURNEY_SELECT,
  normalizeJourney,
  statusColors,
  type Journey,
} from "@/lib/comms/journeys";
import { summarizeSchedule } from "@/lib/comms/schedule";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "pending", label: "Pending Approval" },
  { value: "approved", label: "Approved" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "rejected", label: "Rejected" },
];
const FREQUENCY_OPTIONS = [
  { value: "none", label: "On activation" },
  { value: "one_time", label: "One time" },
  { value: "recurring", label: "Recurring" },
];
const CHANNEL_OPTIONS = [{ value: "whatsapp", label: "WhatsApp" }];

function matchesStatus(j: Journey, wanted: string[]) {
  if (!wanted.length) return true;
  return wanted.some((s) => {
    if (s === "draft") return j.status === "draft" && (j.approval_status === "draft" || j.approval_status === "rejected");
    if (s === "pending" || s === "approved" || s === "rejected") return j.approval_status === s;
    return j.status === s;
  });
}

export default function JourneyBuilder() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { staff, nameOf } = useJourneyStaff();
  const pendingCount = usePendingApprovalCount();

  const [showCreate, setShowCreate] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [editJourney, setEditJourney] = useState<Journey | null>(null);
  const [scheduleJourney, setScheduleJourney] = useState<Journey | null>(null);
  const [submitJourney, setSubmitJourney] = useState<Journey | null>(null);
  const [activateJourney, setActivateJourney] = useState<Journey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; name?: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [frequencyFilter, setFrequencyFilter] = useState<string[]>([]);
  const [channelFilter, setChannelFilter] = useState<string[]>([]);
  const [createdBy, setCreatedBy] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: journeys = [], isLoading } = useQuery({
    queryKey: ["comms-journeys"],
    queryFn: async () => {
      const { data, error } = await supabase.from("comms_journeys").select(JOURNEY_SELECT).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((r) => normalizeJourney(r as Record<string, unknown>));
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["comms-journey-stats"],
    queryFn: async () => {
      const [enrolled, sent] = await Promise.all([
        supabase.from("comms_journey_enrollments").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("comms_journey_message_log").select("id", { count: "exact", head: true }).eq("status", "sent"),
      ]);
      return { enrolled: enrolled.count ?? 0, sent: sent.count ?? 0 };
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["comms-journeys"] });
    qc.invalidateQueries({ queryKey: ["comms-journey-stats"] });
  };

  const setStatus = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "pause" | "resume" }) => invokeJourneyActions({ action, journey_id: id }),
    onSuccess: (_r, v) => {
      toast.success(v.action === "pause" ? "Journey paused" : "Journey resumed");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("comms_journeys").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      setDeleteTarget(null);
      setSelectedIds([]);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const creatorOptions = useMemo(
    () => [{ id: "", name: "Anyone" }, ...staff.filter((s) => journeys.some((j) => j.created_by === s.id)).map((s) => ({ id: s.id, name: s.name }))],
    [staff, journeys]
  );

  const filtered = useMemo(
    () =>
      journeys.filter((j) => {
        if (!matchesStatus(j, statusFilter)) return false;
        if (frequencyFilter.length && !frequencyFilter.includes(j.schedule?.type ?? "none")) return false;
        if (channelFilter.length && !parseCanvas(j.canvas_data).nodes.some((n) => n.type === "message")) return false;
        if (createdBy && j.created_by !== createdBy) return false;
        const created = j.created_at.slice(0, 10);
        if (dateFrom && created < dateFrom) return false;
        if (dateTo && created > dateTo) return false;
        return true;
      }),
    [journeys, statusFilter, frequencyFilter, channelFilter, createdBy, dateFrom, dateTo]
  );

  const hasFilters = !!(statusFilter.length || frequencyFilter.length || channelFilter.length || createdBy || dateFrom || dateTo);
  const clearFilters = () => {
    setStatusFilter([]);
    setFrequencyFilter([]);
    setChannelFilter([]);
    setCreatedBy("");
    setDateFrom("");
    setDateTo("");
  };

  const activeCount = journeys.filter((j) => j.status === "active").length;
  const canSubmit = (j: Journey) => j.status === "draft" && (j.approval_status === "draft" || j.approval_status === "rejected");

  const statCards = [
    { label: "Active Journeys", value: activeCount, icon: GitBranch, tone: "bg-primary/10 text-primary" },
    { label: "Enrolled Contacts", value: stats?.enrolled ?? 0, icon: Users, tone: "bg-success/10 text-success" },
    { label: "Messages Sent", value: stats?.sent ?? 0, icon: MessageSquare, tone: "bg-info/10 text-info" },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight md:text-2xl">Journey Builder</h1>
          <p className="text-xs text-muted-foreground md:text-sm">Create automated messaging journeys for your audience segments</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setShowApprovals(true)}>
            <Inbox className="mr-2 h-4 w-4" /> View Approvals{pendingCount > 0 ? ` (${pendingCount})` : ""}
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" /> Create Journey
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
        {statCards.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 pt-4 md:pt-6">
              <div className={cn("rounded-lg p-2", tone)}><Icon className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground md:text-sm">{label}</p>
                <p className="text-xl font-bold md:text-2xl">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <div className="space-y-3 border-b p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1">
              <Label className="text-xs">Status</Label>
              <MultiSelectFilter options={STATUS_OPTIONS} selected={statusFilter} onChange={setStatusFilter} placeholder="All statuses" />
            </div>
            <div className="min-w-[180px] flex-1">
              <Label className="text-xs">Frequency</Label>
              <MultiSelectFilter options={FREQUENCY_OPTIONS} selected={frequencyFilter} onChange={setFrequencyFilter} placeholder="All frequencies" />
            </div>
            <div className="min-w-[180px] flex-1">
              <Label className="text-xs">Channel</Label>
              <MultiSelectFilter options={CHANNEL_OPTIONS} selected={channelFilter} onChange={setChannelFilter} placeholder="All channels" />
            </div>
            <div className="min-w-[180px] flex-1">
              <Label className="text-xs">Created By</Label>
              <SearchableSelect value={createdBy} onChange={setCreatedBy} options={creatorOptions} placeholder="Anyone" searchPlaceholder="Search creator…" />
            </div>
            <div className="w-[150px]">
              <Label className="text-xs">Created From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="w-[150px]">
              <Label className="text-xs">Created To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}><X className="mr-1 h-4 w-4" /> Clear</Button>
            )}
          </div>
          {hasFilters && <p className="text-xs text-muted-foreground">Showing {filtered.length} of {journeys.length} journeys</p>}
        </div>

        {selectedIds.length > 0 && (
          <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
            <p className="text-sm">{selectedIds.length} selected</p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>Clear</Button>
              <Button variant="destructive" size="sm" onClick={() => setDeleteTarget({ ids: selectedIds })}>
                <Trash2 className="mr-1 h-4 w-4" /> Delete selected
              </Button>
            </div>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={filtered.length > 0 && filtered.every((j) => selectedIds.includes(j.id))}
                  onCheckedChange={(checked) => setSelectedIds(checked ? filtered.map((j) => j.id) : [])}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Segment</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : journeys.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No journeys yet. Create one to get started.</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No journeys match the selected filters.</TableCell></TableRow>
            ) : (
              filtered.map((j) => {
                const a = j.approval_status;
                return (
                  <TableRow
                    key={j.id}
                    className={cn("cursor-pointer", j.status === "active" && "bg-success/5 hover:bg-success/10")}
                    onClick={() => navigate(`/communications/journeys/${j.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.includes(j.id)}
                        onCheckedChange={(checked) => setSelectedIds((prev) => (checked ? [...prev, j.id] : prev.filter((id) => id !== j.id)))}
                        aria-label={`Select ${j.name}`}
                      />
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {j.name}
                      <p className="text-xs font-normal text-muted-foreground">by {nameOf(j.created_by)}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge className={cn(statusColors[j.status], "px-1.5 py-0 text-xs")}>{j.status}</Badge>
                        {a !== "draft" && <Badge className={cn(approvalBadgeClass[a], "px-1.5 py-0 text-xs")}>{approvalLabel[a]}</Badge>}
                        {j.schedule && (
                          <Badge variant="outline" className="max-w-[220px] px-1.5 py-0 text-xs" title={summarizeSchedule(j.schedule)}>
                            <CalendarIcon className="mr-1 h-3 w-3 shrink-0" />
                            <span className="truncate">{summarizeSchedule(j.schedule)}</span>
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{audienceSummary(j.audience_config)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{format(new Date(j.created_at), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {canSubmit(j) && (
                          <Button size="sm" variant="ghost" title="Submit for Approval" onClick={() => setSubmitJourney(j)}><Send className="h-4 w-4" /></Button>
                        )}
                        <Button size="sm" variant="ghost" title="Edit Journey" onClick={() => setEditJourney(j)}><Pencil className="h-4 w-4" /></Button>
                        {j.status === "draft" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title={a === "approved" ? "Activate" : "Needs approval before activating"}
                            disabled={a !== "approved"}
                            onClick={() => setActivateJourney(j)}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        {j.status === "active" && (
                          <Button size="sm" variant="ghost" title="Pause" onClick={() => setStatus.mutate({ id: j.id, action: "pause" })}><Pause className="h-4 w-4" /></Button>
                        )}
                        {j.status === "paused" && (
                          <Button size="sm" variant="ghost" title="Resume" disabled={a !== "approved"} onClick={() => setStatus.mutate({ id: j.id, action: "resume" })}><Play className="h-4 w-4" /></Button>
                        )}
                        <Button size="sm" variant="ghost" title="Schedule" onClick={() => setScheduleJourney(j)}><CalendarIcon className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" title="Analytics" onClick={() => navigate(`/communications/journeys/${j.id}/analytics`)}><BarChart3 className="h-4 w-4" /></Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          title={j.status === "active" ? "Pause before deleting" : "Delete"}
                          disabled={j.status === "active"}
                          onClick={() => setDeleteTarget({ ids: [j.id], name: j.name })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <JourneyDetailsDialog open={showCreate} onOpenChange={setShowCreate} />
      <JourneyDetailsDialog open={!!editJourney} onOpenChange={(o) => !o && setEditJourney(null)} journey={editJourney} />
      <ApprovalsDialog open={showApprovals} onOpenChange={setShowApprovals} />
      <SubmitApprovalDialog journey={submitJourney} onOpenChange={(o) => !o && setSubmitJourney(null)} />
      <JourneyScheduleDialog journey={scheduleJourney} onOpenChange={(o) => !o && setScheduleJourney(null)} />
      <ActivateJourneyDialog journey={activateJourney} onOpenChange={(o) => !o && setActivateJourney(null)} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.name ? `Delete "${deleteTarget.name}"?` : `Delete ${deleteTarget?.ids.length} journeys?`}
            </AlertDialogTitle>
            <AlertDialogDescription>This also removes its schedule, enrollments and send history. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && remove.mutate(deleteTarget.ids)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
