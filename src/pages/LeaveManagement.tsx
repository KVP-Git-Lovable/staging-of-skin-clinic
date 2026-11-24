import { useState } from "react";
import { DateInput } from "@/components/shared/DateInput";
import { displayDate } from "@/lib/dateInput";
import { Plus, Search, Calendar, Loader2, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  canDecide, correctionsNote, correctionsUsedIn, regularisationAsk,
  regularisationProblem, regularisationTimestamp,
} from "@/lib/regularisation";
import { useAttendanceSettings } from "@/hooks/useAttendanceSettings";
import { canViewModule } from "@/lib/staffAccess";

/**
 * Leave, for the person taking it and the person deciding it.
 *
 * This page was one admin console: every form made you pick a staff member
 * from a dropdown of the whole clinic, and nothing defaulted to whoever was
 * signed in. That was tenable while only admins and doctors had logins. It
 * stops being tenable the moment therapists, nurses and receptionists get
 * their own, which is what this change is for.
 *
 * So there is now a My Leave tab that everybody gets, and the three original
 * tabs render only for somebody who can view `leave_admin`. The lists behind
 * them are NOT re-queried per role - the row-level policies applied in
 * 20261113060000 already return only your own applications and balances
 * unless you are an admin, so the filtering below is for the admin's view of
 * their own rows, not for anybody's privacy.
 */

/** Only the fields My Leave reads. The admin tabs keep their own looser
 *  handling of the same rows; this is the half that is new. */
interface MyLeaveApplication {
  id: string;
  staff_id: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: string;
  leave_types?: { name?: string | null } | null;
}

interface MyRegularisation {
  id: string;
  staff_id: string;
  date: string;
  requested_check_in: string | null;
  requested_check_out: string | null;
  reason: string;
  status: string;
  staff?: { first_name?: string | null; last_name?: string | null } | null;
}

interface MyLeaveBalance {
  id: string;
  staff_id: string;
  year: number;
  opening_balance: number;
  used: number;
  leave_types?: { name?: string | null } | null;
}

/** Every tab this page has. A ?tab= outside this list is ignored. */
const LEAVE_TABS = ["mine", "my-regularisations", "applications", "regularisations"];

const statusStyles: Record<string, string> = {
  Pending: "bg-warning/10 text-warning",
  Approved: "bg-success/10 text-success",
  Rejected: "bg-destructive/10 text-destructive",
};

const LeaveManagement = () => {
  const queryClient = useQueryClient();
  const { staffProfile, isAdmin, permissions, approvesRequests } = useAuth();
  const myStaffId = staffProfile?.id ?? "";
  const canAdminLeave = canViewModule({ isAdmin, permissions, moduleKey: "leave_admin" });
  // Seeing the requests and deciding them are different rights. Every admin
  // may look; only the people the clinic named may answer, which is what
  // may_decide_requests() enforces in the database. Without this, an admin
  // who is not on that list gets two buttons that fail with a policy error.
  const mayDecide = approvesRequests;
  // Null until somebody picks: an admin lands where they always have, and
  // everyone else on their own leave. Computed rather than stored so it is
  // still right if the role resolves a tick after the first render.
  const [tab, setTab] = useState<string | null>(null);
  // The bell links straight at a tab - /leave?tab=regularisations - because a
  // notification that lands on the page and leaves you to find the request is
  // only half a notification.
  const [searchParams] = useSearchParams();
  // Only a tab that still exists. ?tab=types and ?tab=balances used to point
  // at this page and now point at Admin > Attendance > Policy; honouring
  // either here would select a tab with no content and show a blank page.
  const askedForTab = searchParams.get("tab");
  const linkedTab = LEAVE_TABS.includes(askedForTab ?? "") ? askedForTab : null;

  // The cap on corrections is an attendance setting, not a leave one, and the
  // database trigger is what enforces it. Reading it here only lets the dialog
  // say how many are left before somebody writes a reason and presses send.
  const { config: attendanceConfig } = useAttendanceSettings();

  const [regOpen, setRegOpen] = useState(false);
  const [regDate, setRegDate] = useState("");
  const [regIn, setRegIn] = useState("");
  const [regOut, setRegOut] = useState("");
  const [regReason, setRegReason] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);

  // Apply form
  const [appStaffId, setAppStaffId] = useState("");
  const [appLeaveTypeId, setAppLeaveTypeId] = useState("");
  const [appStartDate, setAppStartDate] = useState("");
  const [appEndDate, setAppEndDate] = useState("");
  const [appReason, setAppReason] = useState("");

  const { data: leaveTypes = [], isLoading: ltLoading } = useQuery({
    queryKey: ["leave-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leave_types").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: staffList = [] } = useQuery({
    queryKey: ["staff-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id, first_name, last_name, role, is_active").order("first_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: balances = [] } = useQuery({
    queryKey: ["leave-balances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_leave_balances")
        .select("*, staff(first_name, last_name), leave_types(name)")
        .order("year", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: applications = [] } = useQuery({
    queryKey: ["leave-applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_applications")
        // leave_applications reaches staff twice - staff_id and approved_by -
        // so an implicit embed is ambiguous and PostgREST refuses the whole
        // request. The response alias stays `staff`, so rows read the same.
        .select("*, staff:staff!leave_applications_staff_id_fkey(first_name, last_name), leave_types(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // My own rows. For everybody but an admin these filters are a no-op - the
  // policies already returned only their rows - but an admin's My Leave tab
  // has to pick theirs out of the whole clinic's.
  const myApplications = (applications as unknown as MyLeaveApplication[])
    .filter((a) => a.staff_id === myStaffId);
  const myBalances = (balances as unknown as MyLeaveBalance[])
    .filter((b) => b.staff_id === myStaffId);

  const { data: regularisations = [] } = useQuery({
    queryKey: ["attendance-regularisations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_regularisations")
        // attendance_regularisations reaches staff twice - staff_id and
        // decided_by - so an implicit embed is ambiguous and PostgREST
        // refuses the whole request. Named, with the response alias kept.
        .select("*, staff:staff!attendance_regularisations_staff_id_fkey(first_name, last_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const myRegularisations = (regularisations as unknown as MyRegularisation[])
    .filter((r) => r.staff_id === myStaffId);

  // A leave type switched off in Admin > Attendance > Policy must stop being
  // offered here, which is the whole point of switching it off rather than
  // deleting it. Only this dropdown is filtered: leave already applied for
  // renders its type name from the embedded row, so history is unaffected,
  // and the admin card deliberately keeps showing inactive types so they can
  // be switched back on.
  const applicableLeaveTypes = (leaveTypes as unknown as { id: string; name: string; is_active?: boolean | null }[])
    .filter((lt) => lt.is_active !== false);

  // Counted for the month of the day being corrected, not for today, because
  // that is the month the database trigger counts. Someone fixing a 29
  // October punch on 2 November spends October's allowance.
  const correctionsUsedThisMonth = correctionsUsedIn(myRegularisations, regDate || new Date());
  const capNote = correctionsNote(
    attendanceConfig.regularisation_monthly_limit,
    correctionsUsedThisMonth,
  );
  const capReached =
    Number(attendanceConfig.regularisation_monthly_limit ?? 0) > 0 &&
    correctionsUsedThisMonth >= Number(attendanceConfig.regularisation_monthly_limit);

  const askForCorrection = useMutation({
    mutationFn: async () => {
      const problem = regularisationProblem({ date: regDate, checkIn: regIn, checkOut: regOut, reason: regReason });
      if (problem) throw new Error(problem);
      if (!myStaffId) throw new Error("No staff record is linked to this login");
      const { error } = await supabase.from("attendance_regularisations").insert({
        staff_id: myStaffId,
        date: regDate,
        requested_check_in: regularisationTimestamp(regDate, regIn),
        requested_check_out: regularisationTimestamp(regDate, regOut),
        reason: regReason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance-regularisations"] });
      toast.success("Sent for approval");
      setRegDate(""); setRegIn(""); setRegOut(""); setRegReason(""); setRegOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decideRegularisation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "Approved" | "Rejected" }) => {
      // The attendance record itself is written by a database trigger on
      // approval, not here. The leave page's own approval is two client
      // writes that are not a transaction and whose balance half has
      // silently done nothing since it was written; a correction that says
      // "approved" and leaves the attendance untouched would be that bug
      // again with somebody's pay behind it.
      const { error } = await supabase
        .from("attendance_regularisations")
        .update({ status, decided_by: myStaffId || null, decided_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["attendance-regularisations"] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success(`Correction ${v.status.toLowerCase()}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyLeave = useMutation({
    mutationFn: async () => {
      if (!appStartDate || !appEndDate) throw new Error("Select dates");
      const start = new Date(appStartDate);
      const end = new Date(appEndDate);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (days <= 0) throw new Error("End date must be after start date");

      // An admin may apply on somebody's behalf, which is the flow this
      // page has always offered. Everybody else can only apply for
      // themselves - and the insert policy refuses anything else anyway.
      const staffId = canAdminLeave ? appStaffId : myStaffId;
      if (!staffId) throw new Error("No staff record is linked to this login");
      const { error } = await supabase.from("leave_applications").insert({
        staff_id: staffId,
        leave_type_id: appLeaveTypeId,
        start_date: appStartDate,
        end_date: appEndDate,
        days,
        reason: appReason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-applications"] });
      toast.success("Leave applied");
      setAppStaffId(""); setAppLeaveTypeId(""); setAppStartDate(""); setAppEndDate(""); setAppReason(""); setApplyOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveLeave = useMutation({
    mutationFn: async (app: any) => {
      // approved_by has existed and had a foreign key since the table was
      // created, and was never written - so the record did not say who
      // decided. It does now.
      const { error: appErr } = await supabase
        .from("leave_applications")
        .update({ status: "Approved", approved_by: myStaffId || null })
        .eq("id", app.id);
      if (appErr) throw appErr;

      const year = new Date(app.start_date).getFullYear();
      const { data: bal } = await supabase
        .from("staff_leave_balances")
        .select("id, used")
        .eq("staff_id", app.staff_id)
        .eq("leave_type_id", app.leave_type_id)
        .eq("year", year)
        .maybeSingle();

      if (bal) {
        const { error: balErr } = await supabase.from("staff_leave_balances")
          .update({ used: Number(bal.used) + Number(app.days) })
          .eq("id", bal.id);
        if (balErr) throw balErr;
      } else {
        // There was an `if (bal)` here and nothing else, so approving leave
        // for somebody with no balance row succeeded, said "balance
        // adjusted", and deducted nothing at all. A row is created instead,
        // with no opening allowance, so the days taken are on the record and
        // the remaining figure goes negative rather than silently vanishing.
        const { error: insErr } = await supabase.from("staff_leave_balances").insert({
          staff_id: app.staff_id,
          leave_type_id: app.leave_type_id,
          year,
          opening_balance: 0,
          used: Number(app.days),
        });
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      // Two keys, not one array holding both: ["leave-applications",
      // "leave-balances"] is a single composite key that matches no query,
      // so the Balances tab never refreshed after an approval.
      queryClient.invalidateQueries({ queryKey: ["leave-applications"] });
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      toast.success("Leave approved & balance adjusted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectLeave = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("leave_applications")
        .update({ status: "Rejected", approved_by: myStaffId || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-applications"] });
      toast.success("Leave rejected");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Leave Management</h1>
          <p className="page-subtitle">
            Apply for leave, and answer what has been asked. Leave types and
            allowances are set in Admin &rsaquo; Attendance &rsaquo; Policy.
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Calendar className="h-4 w-4" /> Apply Leave</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle className="font-display">Apply Leave</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                {canAdminLeave ? (
                  <div>
                    <Label>Staff Member *</Label>
                    <Select value={appStaffId} onValueChange={setAppStaffId}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select staff" /></SelectTrigger>
                      <SelectContent>
                        {staffList.map((s) => <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground" data-testid="applying-as">
                    Applying as <span className="font-medium text-foreground">
                      {[staffProfile?.firstName, staffProfile?.lastName].filter(Boolean).join(" ") || "you"}
                    </span>
                  </p>
                )}
                <div>
                  <Label>Leave Type *</Label>
                  <Select value={appLeaveTypeId} onValueChange={setAppLeaveTypeId}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {applicableLeaveTypes.map((lt) => <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Start Date *</Label>
                    <DateInput className="mt-1.5" value={appStartDate} onChange={(isoDate) => setAppStartDate(isoDate)} />
                  </div>
                  <div>
                    <Label>End Date *</Label>
                    <DateInput className="mt-1.5" value={appEndDate} onChange={(isoDate) => setAppEndDate(isoDate)} />
                  </div>
                </div>
                {appStartDate && appEndDate && (
                  <div className="bg-muted/50 rounded-lg p-2 text-xs text-muted-foreground text-center">
                    {Math.max(1, Math.ceil((new Date(appEndDate).getTime() - new Date(appStartDate).getTime()) / (1000 * 60 * 60 * 24)) + 1)} day(s)
                  </div>
                )}
                <div>
                  <Label>Reason</Label>
                  <Textarea className="mt-1.5" value={appReason} onChange={(e) => setAppReason(e.target.value)} rows={2} />
                </div>
                <Button className="w-full" onClick={() => applyLeave.mutate()} disabled={(canAdminLeave ? !appStaffId : !myStaffId) || !appLeaveTypeId || !appStartDate || !appEndDate || applyLeave.isPending}>
                  {applyLeave.isPending ? "Submitting..." : "Submit Leave"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs
        value={tab ?? linkedTab ?? (canAdminLeave ? "applications" : "mine")}
        onValueChange={setTab}
      >
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="mine">My Leave ({myApplications.length})</TabsTrigger>
          <TabsTrigger value="my-regularisations">My Corrections ({myRegularisations.length})</TabsTrigger>
          {canAdminLeave && <>
            <TabsTrigger value="applications">Applications ({applications.length})</TabsTrigger>
            <TabsTrigger value="regularisations">
              Corrections ({(regularisations as unknown as MyRegularisation[]).filter((r) => canDecide(r.status)).length})
            </TabsTrigger>
          </>}
        </TabsList>

        {/* My Corrections - asking for a forgotten punch to be put right.
            "Corrections" on screen rather than "Regularisations": it is the
            word the clinic used to me, not the word anybody says. */}
        <TabsContent value="my-regularisations">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Dialog open={regOpen} onOpenChange={setRegOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2" data-testid="ask-correction">
                    <Plus className="h-4 w-4" /> Ask for a correction
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle className="font-display">Ask for a correction</DialogTitle></DialogHeader>
                  <div className="space-y-4 pt-2">
                    <p className="text-sm text-muted-foreground">
                      Forgot to start or end a day? Say what it should have been and
                      an admin will put it right.
                    </p>
                    {capNote && (
                      <p
                        className={`text-xs ${capReached ? "text-destructive" : "text-muted-foreground"}`}
                        data-testid="corrections-left"
                      >
                        {capNote}
                      </p>
                    )}
                    <div>
                      <Label>Day *</Label>
                      <DateInput className="mt-1.5" value={regDate} onChange={(iso) => setRegDate(iso)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Started at</Label>
                        <Input type="time" className="mt-1.5" value={regIn} onChange={(e) => setRegIn(e.target.value)} />
                      </div>
                      <div>
                        <Label>Ended at</Label>
                        <Input type="time" className="mt-1.5" value={regOut} onChange={(e) => setRegOut(e.target.value)} />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Fill in only the end you forgot. The other stays as it was recorded.
                    </p>
                    <div>
                      <Label>Reason *</Label>
                      <Textarea className="mt-1.5" rows={2} value={regReason} onChange={(e) => setRegReason(e.target.value)} />
                    </div>
                    <Button
                      className="w-full"
                      data-testid="send-correction"
                      disabled={askForCorrection.isPending || capReached}
                      onClick={() => askForCorrection.mutate()}
                    >
                      {askForCorrection.isPending ? "Sending..." : "Send for approval"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="data-table">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Asked for</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myRegularisations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        You have not asked for any corrections.
                      </TableCell>
                    </TableRow>
                  ) : myRegularisations.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{displayDate(r.date)}</TableCell>
                      <TableCell className="whitespace-nowrap">{regularisationAsk(r)}</TableCell>
                      <TableCell className="max-w-xs truncate">{r.reason}</TableCell>
                      <TableCell><Badge className={statusStyles[r.status] || ""}>{r.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </motion.div>
        </TabsContent>

        {/* My Leave - what the person signed in has taken and has left.
            The rows come from the same two queries the admin tabs use; the
            policies make them their own rows already, and the filter is
            what makes an ADMIN's My Leave tab theirs rather than everyone's. */}
        <TabsContent value="mine">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {myBalances.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="no-balance">
                  No leave balance has been granted to you yet. You can still apply; an admin
                  decides it.
                </p>
              ) : myBalances.map((b) => (
                <div key={b.id} className="rounded-xl border p-4">
                  <p className="text-sm font-medium">{b.leave_types?.name ?? "Leave"}</p>
                  <p className="mt-1 text-2xl font-semibold text-primary">
                    {Number(b.opening_balance) - Number(b.used)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    days left of {Number(b.opening_balance)} · {Number(b.used)} used · {b.year}
                  </p>
                </div>
              ))}
            </div>

            <div className="data-table">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myApplications.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        You have not applied for any leave yet.
                      </TableCell>
                    </TableRow>
                  ) : myApplications.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{a.leave_types?.name ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {displayDate(a.start_date)} – {displayDate(a.end_date)}
                      </TableCell>
                      <TableCell>{a.days}</TableCell>
                      <TableCell className="max-w-xs truncate">{a.reason || "—"}</TableCell>
                      <TableCell>
                        <Badge className={statusStyles[a.status] || ""}>{a.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </motion.div>
        </TabsContent>

        {/* Everyone else's leave, the balances and the types. Rendered
            only for somebody who can view leave_admin - the database
            refuses the writes either way since 20261113060000, but a
            button that always fails is worse than no button. */}
        {canAdminLeave && (<>
        {/* Corrections, for whoever decides them. The attendance record is
            written by a database trigger on approval, so pressing Approve
            and the day being right cannot come apart. */}
        <TabsContent value="regularisations">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="data-table mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Asked for</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(regularisations as unknown as MyRegularisation[]).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No corrections have been asked for.
                    </TableCell>
                  </TableRow>
                ) : (regularisations as unknown as MyRegularisation[]).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      {[r.staff?.first_name, r.staff?.last_name].filter(Boolean).join(" ") || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{displayDate(r.date)}</TableCell>
                    <TableCell className="whitespace-nowrap">{regularisationAsk(r)}</TableCell>
                    <TableCell className="max-w-xs truncate">{r.reason}</TableCell>
                    <TableCell><Badge className={statusStyles[r.status] || ""}>{r.status}</Badge></TableCell>
                    <TableCell>
                      {canDecide(r.status) && mayDecide && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid="approve-correction"
                            disabled={decideRegularisation.isPending}
                            onClick={() => decideRegularisation.mutate({ id: r.id, status: "Approved" })}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            disabled={decideRegularisation.isPending}
                            onClick={() => decideRegularisation.mutate({ id: r.id, status: "Rejected" })}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </motion.div>
        </TabsContent>

        {/* Applications Tab */}
        <TabsContent value="applications">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="data-table mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No leave applications</TableCell></TableRow>
                ) : applications.map((app: any) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-medium">{app.staff?.first_name} {app.staff?.last_name}</TableCell>
                    <TableCell className="text-sm">{app.leave_types?.name}</TableCell>
                    <TableCell className="text-sm">
                      {displayDate(app.start_date)} — {displayDate(app.end_date)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{app.days}</TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[150px]">{app.reason || "—"}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusStyles[app.status] || ""}`}>{app.status}</span>
                    </TableCell>
                    <TableCell>
                      {app.status === "Pending" && (
                        <div className="flex gap-1">
                          {mayDecide && <>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-success" data-testid="approve-leave" onClick={() => approveLeave.mutate(app)}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => rejectLeave.mutate(app.id)}>
                            Reject
                          </Button>
                          </>}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </motion.div>
        </TabsContent>
        </>)}
      </Tabs>
    </div>
  );
};

export default LeaveManagement;
