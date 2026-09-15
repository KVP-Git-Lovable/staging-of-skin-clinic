import { useState } from "react";
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

const statusStyles: Record<string, string> = {
  Pending: "bg-warning/10 text-warning",
  Approved: "bg-success/10 text-success",
  Rejected: "bg-destructive/10 text-destructive",
};

const LeaveManagement = () => {
  const queryClient = useQueryClient();
  const [typeOpen, setTypeOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

  // Leave type form
  const [ltName, setLtName] = useState("");
  const [ltDesc, setLtDesc] = useState("");
  const [ltDays, setLtDays] = useState(0);

  // Balance form
  const [balStaffId, setBalStaffId] = useState("");
  const [balLeaveTypeId, setBalLeaveTypeId] = useState("");
  const [balYear, setBalYear] = useState(new Date().getFullYear());
  const [balOpening, setBalOpening] = useState(0);

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
      const { data, error } = await supabase.from("staff").select("id, first_name, last_name, role").order("first_name");
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
        .select("*, staff(first_name, last_name), leave_types(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createLeaveType = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("leave_types").insert({
        name: ltName,
        description: ltDesc || null,
        default_days_per_year: ltDays,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-types"] });
      toast.success("Leave type created");
      setLtName(""); setLtDesc(""); setLtDays(0); setTypeOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createBalance = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("staff_leave_balances").insert({
        staff_id: balStaffId,
        leave_type_id: balLeaveTypeId,
        year: balYear,
        opening_balance: balOpening,
        used: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      toast.success("Leave balance granted");
      setBalStaffId(""); setBalLeaveTypeId(""); setBalOpening(0); setBalanceOpen(false);
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

      const { error } = await supabase.from("leave_applications").insert({
        staff_id: appStaffId,
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
      // Update application status
      const { error: appErr } = await supabase.from("leave_applications").update({ status: "Approved" }).eq("id", app.id);
      if (appErr) throw appErr;

      // Deduct from balance
      const year = new Date(app.start_date).getFullYear();
      const { data: bal } = await supabase
        .from("staff_leave_balances")
        .select("*")
        .eq("staff_id", app.staff_id)
        .eq("leave_type_id", app.leave_type_id)
        .eq("year", year)
        .single();

      if (bal) {
        const { error: balErr } = await supabase.from("staff_leave_balances")
          .update({ used: Number(bal.used) + Number(app.days) })
          .eq("id", bal.id);
        if (balErr) throw balErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-applications", "leave-balances"] });
      toast.success("Leave approved & balance adjusted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectLeave = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leave_applications").update({ status: "Rejected" }).eq("id", id);
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
          <p className="page-subtitle">Manage leave types, balances, and applications</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Calendar className="h-4 w-4" /> Apply Leave</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle className="font-display">Apply Leave</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Staff Member *</Label>
                  <Select value={appStaffId} onValueChange={setAppStaffId}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select staff" /></SelectTrigger>
                    <SelectContent>
                      {staffList.map((s) => <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Leave Type *</Label>
                  <Select value={appLeaveTypeId} onValueChange={setAppLeaveTypeId}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {leaveTypes.map((lt: any) => <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Start Date *</Label>
                    <Input type="date" className="mt-1.5" value={appStartDate} onChange={(e) => setAppStartDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>End Date *</Label>
                    <Input type="date" className="mt-1.5" value={appEndDate} onChange={(e) => setAppEndDate(e.target.value)} />
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
                <Button className="w-full" onClick={() => applyLeave.mutate()} disabled={!appStaffId || !appLeaveTypeId || !appStartDate || !appEndDate || applyLeave.isPending}>
                  {applyLeave.isPending ? "Submitting..." : "Submit Leave"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="applications">
        <TabsList>
          <TabsTrigger value="applications">Applications ({applications.length})</TabsTrigger>
          <TabsTrigger value="balances">Balances ({balances.length})</TabsTrigger>
          <TabsTrigger value="types">Leave Types ({leaveTypes.length})</TabsTrigger>
        </TabsList>

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
                      {new Date(app.start_date).toLocaleDateString()} — {new Date(app.end_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{app.days}</TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[150px]">{app.reason || "—"}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusStyles[app.status] || ""}`}>{app.status}</span>
                    </TableCell>
                    <TableCell>
                      {app.status === "Pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs text-success" onClick={() => approveLeave.mutate(app)}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => rejectLeave.mutate(app.id)}>
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

        {/* Balances Tab */}
        <TabsContent value="balances">
          <div className="flex justify-end mb-4 mt-4">
            <Dialog open={balanceOpen} onOpenChange={setBalanceOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2"><Plus className="h-4 w-4" /> Grant Leave Balance</Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle className="font-display">Grant Leave Balance</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label>Staff *</Label>
                    <Select value={balStaffId} onValueChange={setBalStaffId}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {staffList.map((s) => <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Leave Type *</Label>
                    <Select value={balLeaveTypeId} onValueChange={setBalLeaveTypeId}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {leaveTypes.map((lt: any) => <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Year</Label>
                      <Input type="number" className="mt-1.5" value={balYear} onChange={(e) => setBalYear(parseInt(e.target.value))} />
                    </div>
                    <div>
                      <Label>Opening Days *</Label>
                      <Input type="number" className="mt-1.5" value={balOpening} onChange={(e) => setBalOpening(parseFloat(e.target.value) || 0)} />
                    </div>
                  </div>
                  <Button className="w-full" onClick={() => createBalance.mutate()} disabled={!balStaffId || !balLeaveTypeId || balOpening <= 0 || createBalance.isPending}>
                    {createBalance.isPending ? "Saving..." : "Grant Balance"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="data-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Leave Type</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">Used</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No leave balances configured</TableCell></TableRow>
                ) : balances.map((bal: any) => (
                  <TableRow key={bal.id}>
                    <TableCell className="font-medium">{bal.staff?.first_name} {bal.staff?.last_name}</TableCell>
                    <TableCell>{bal.leave_types?.name}</TableCell>
                    <TableCell>{bal.year}</TableCell>
                    <TableCell className="text-right font-medium">{bal.opening_balance}</TableCell>
                    <TableCell className="text-right text-destructive">{bal.used}</TableCell>
                    <TableCell className="text-right font-semibold text-success">{Number(bal.opening_balance) - Number(bal.used)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </motion.div>
        </TabsContent>

        {/* Leave Types Tab */}
        <TabsContent value="types">
          <div className="flex justify-end mb-4 mt-4">
            <Dialog open={typeOpen} onOpenChange={setTypeOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2"><Plus className="h-4 w-4" /> Add Leave Type</Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle className="font-display">New Leave Type</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label>Name *</Label>
                    <Input className="mt-1.5" placeholder="e.g. Casual Leave" value={ltName} onChange={(e) => setLtName(e.target.value)} />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea className="mt-1.5" value={ltDesc} onChange={(e) => setLtDesc(e.target.value)} rows={2} />
                  </div>
                  <div>
                    <Label>Default Days/Year</Label>
                    <Input type="number" className="mt-1.5" value={ltDays} onChange={(e) => setLtDays(parseFloat(e.target.value) || 0)} />
                  </div>
                  <Button className="w-full" onClick={() => createLeaveType.mutate()} disabled={!ltName || createLeaveType.isPending}>
                    {createLeaveType.isPending ? "Creating..." : "Create Leave Type"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {leaveTypes.map((lt: any) => (
              <div key={lt.id} className="stat-card">
                <h3 className="font-display font-semibold">{lt.name}</h3>
                {lt.description && <p className="text-sm text-muted-foreground mt-1">{lt.description}</p>}
                <p className="text-2xl font-bold text-primary mt-3">{lt.default_days_per_year}</p>
                <p className="text-xs text-muted-foreground">days/year default</p>
              </div>
            ))}
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default LeaveManagement;
