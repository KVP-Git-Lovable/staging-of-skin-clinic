import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, Phone, Mail, Clock, GraduationCap, Briefcase, Target, MessageSquare, CalendarCheck, Receipt, Activity, Plus, Trash2, Edit, Lightbulb, HelpCircle, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { motion } from "framer-motion";
import StaffPerformanceCharts from "@/components/staff/StaffPerformanceCharts";

const StaffDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Staff info
  const { data: staff, isLoading } = useQuery({
    queryKey: ["staff-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) return <div className="flex justify-center py-20 text-muted-foreground">Loading...</div>;
  if (!staff) return <div className="text-center py-20 text-muted-foreground">Staff not found</div>;

  const initials = `${staff.first_name?.[0] || ""}${staff.last_name?.[0] || ""}`.toUpperCase();

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/staff")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Avatar className="h-14 w-14">
          <AvatarImage src={staff.photo_url} />
          <AvatarFallback className="bg-primary/10 text-primary text-lg">{initials}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold">{staff.first_name} {staff.last_name}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Badge variant="secondary">{staff.role}</Badge>
            {staff.specialization && <span>{staff.specialization}</span>}
            <Badge variant={staff.is_active !== false ? "default" : "outline"}>
              {staff.is_active !== false ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Contact bar */}
      <div className="flex gap-6 mb-6 text-sm text-muted-foreground">
        {staff.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{staff.phone}</span>}
        {staff.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{staff.email}</span>}
        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{staff.work_start_time?.slice(0, 5) || "09:00"} – {staff.work_end_time?.slice(0, 5) || "18:00"}</span>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="performance"><Activity className="h-3.5 w-3.5 mr-1" />Performance</TabsTrigger>
          <TabsTrigger value="appointments"><CalendarCheck className="h-3.5 w-3.5 mr-1" />Appointments</TabsTrigger>
          <TabsTrigger value="invoices"><Receipt className="h-3.5 w-3.5 mr-1" />Invoices</TabsTrigger>
          <TabsTrigger value="procedures"><Activity className="h-3.5 w-3.5 mr-1" />Procedures</TabsTrigger>
          <TabsTrigger value="education"><GraduationCap className="h-3.5 w-3.5 mr-1" />Education</TabsTrigger>
          <TabsTrigger value="experience"><Briefcase className="h-3.5 w-3.5 mr-1" />Experience</TabsTrigger>
          <TabsTrigger value="aspirations"><Target className="h-3.5 w-3.5 mr-1" />Aspirations</TabsTrigger>
          <TabsTrigger value="requests"><MessageSquare className="h-3.5 w-3.5 mr-1" />Requests</TabsTrigger>
        </TabsList>

        <TabsContent value="performance">
          <StaffPerformanceCharts staffId={id!} staffName={`${staff.first_name} ${staff.last_name}`} />
        </TabsContent>

        <TabsContent value="appointments"><AppointmentsTab staffId={id!} /></TabsContent>
        <TabsContent value="invoices"><InvoicesTab staffId={id!} /></TabsContent>
        <TabsContent value="procedures"><ProceduresTab staffId={id!} /></TabsContent>
        <TabsContent value="education"><EducationTab staffId={id!} /></TabsContent>
        <TabsContent value="experience"><ExperienceTab staffId={id!} /></TabsContent>
        <TabsContent value="aspirations"><AspirationsTab staffId={id!} /></TabsContent>
        <TabsContent value="requests"><RequestsTab staffId={id!} /></TabsContent>
      </Tabs>
    </div>
  );
};

/* ---- Appointments Tab ---- */
const AppointmentsTab = ({ staffId }: { staffId: string }) => {
  const { data: appointments = [] } = useQuery({
    queryKey: ["staff-appointments", staffId],
    queryFn: async () => {
      const { data, error } = await supabase.from("appointments").select("*").eq("staff_id", staffId).order("start_time", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Appointments ({appointments.length})</CardTitle></CardHeader>
      <CardContent>
        {appointments.length === 0 ? <p className="text-sm text-muted-foreground">No appointments linked to this staff member.</p> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointments.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="text-sm">{format(new Date(a.start_time), "dd MMM yyyy, hh:mm a")}</TableCell>
                  <TableCell>{a.patient_name || "—"}</TableCell>
                  <TableCell>{a.service}</TableCell>
                  <TableCell><Badge variant={a.status === "Completed" ? "default" : "secondary"}>{a.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

/* ---- Invoices Tab (via appointments) ---- */
const InvoicesTab = ({ staffId }: { staffId: string }) => {
  const { data: invoices = [] } = useQuery({
    queryKey: ["staff-invoices", staffId],
    queryFn: async () => {
      // Get appointments for this staff, then get invoices linked to those appointments
      const { data: appts } = await supabase.from("appointments").select("id").eq("staff_id", staffId);
      if (!appts?.length) return [];
      const ids = appts.map((a: any) => a.id);
      const { data, error } = await supabase.from("invoices").select("*").in("appointment_id", ids).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const totalRevenue = invoices.reduce((s: number, i: any) => s + (i.paid_amount || 0), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Invoices ({invoices.length})</CardTitle>
          <Badge variant="secondary" className="text-sm">Revenue: ₹{totalRevenue.toLocaleString()}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? <p className="text-sm text-muted-foreground">No invoices linked yet.</p> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv: any) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>{inv.patient_name || "—"}</TableCell>
                  <TableCell>₹{inv.total_amount?.toLocaleString()}</TableCell>
                  <TableCell>₹{inv.paid_amount?.toLocaleString()}</TableCell>
                  <TableCell><Badge variant={inv.status === "Paid" ? "default" : "outline"}>{inv.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

/* ---- Procedures Tab ---- */
const ProceduresTab = ({ staffId }: { staffId: string }) => {
  const { data: procedures = [] } = useQuery({
    queryKey: ["staff-procedures", staffId],
    queryFn: async () => {
      const { data, error } = await supabase.from("procedures").select("*, patients(first_name, last_name)").eq("staff_id", staffId).order("procedure_date", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Procedures ({procedures.length})</CardTitle></CardHeader>
      <CardContent>
        {procedures.length === 0 ? <p className="text-sm text-muted-foreground">No procedures linked.</p> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {procedures.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm">{format(new Date(p.procedure_date), "dd MMM yyyy")}</TableCell>
                  <TableCell>{p.patients ? `${p.patients.first_name} ${p.patients.last_name}` : "—"}</TableCell>
                  <TableCell>{p.service_name}</TableCell>
                  <TableCell><Badge variant={p.status === "Completed" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

/* ---- Education Tab ---- */
const EducationTab = ({ staffId }: { staffId: string }) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ institution: "", degree: "", field_of_study: "", start_year: "", end_year: "", notes: "" });

  const { data: items = [] } = useQuery({
    queryKey: ["staff-education", staffId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("staff_education").select("*").eq("staff_id", staffId).order("end_year", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: any = { staff_id: staffId, institution: form.institution, degree: form.degree, field_of_study: form.field_of_study || null, start_year: form.start_year ? parseInt(form.start_year) : null, end_year: form.end_year ? parseInt(form.end_year) : null, notes: form.notes || null };
      if (editId) {
        const { error } = await (supabase as any).from("staff_education").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("staff_education").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["staff-education", staffId] }); toast.success("Saved"); closeForm(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase as any).from("staff_education").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["staff-education", staffId] }); toast.success("Deleted"); setDeleteId(null); },
  });

  const closeForm = () => { setOpen(false); setEditId(null); setForm({ institution: "", degree: "", field_of_study: "", start_year: "", end_year: "", notes: "" }); };
  const openEdit = (item: any) => { setEditId(item.id); setForm({ institution: item.institution, degree: item.degree, field_of_study: item.field_of_study || "", start_year: item.start_year?.toString() || "", end_year: item.end_year?.toString() || "", notes: item.notes || "" }); setOpen(true); };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Education Background</CardTitle>
          <Button size="sm" onClick={() => { setForm({ institution: "", degree: "", field_of_study: "", start_year: "", end_year: "", notes: "" }); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? <p className="text-sm text-muted-foreground">No education records added yet.</p> : (
          <div className="space-y-3">
            {items.map((item: any) => (
              <div key={item.id} className="flex items-start justify-between p-3 rounded-lg border bg-muted/30">
                <div>
                  <p className="font-medium">{item.degree}{item.field_of_study ? ` in ${item.field_of_study}` : ""}</p>
                  <p className="text-sm text-muted-foreground">{item.institution}</p>
                  <p className="text-xs text-muted-foreground">{item.start_year || "?"} – {item.end_year || "Present"}</p>
                  {item.notes && <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}><Edit className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Education" : "Add Education"}</DialogTitle><DialogDescription>Enter education details</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label>Institution *</Label><Input className="mt-1" value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Degree *</Label><Input className="mt-1" placeholder="e.g. MBBS" value={form.degree} onChange={(e) => setForm({ ...form, degree: e.target.value })} /></div>
              <div><Label>Field of Study</Label><Input className="mt-1" placeholder="e.g. Medicine" value={form.field_of_study} onChange={(e) => setForm({ ...form, field_of_study: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Year</Label><Input type="number" className="mt-1" value={form.start_year} onChange={(e) => setForm({ ...form, start_year: e.target.value })} /></div>
              <div><Label>End Year</Label><Input type="number" className="mt-1" value={form.end_year} onChange={(e) => setForm({ ...form, end_year: e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Textarea className="mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
            <Button onClick={() => saveMut.mutate()} disabled={!form.institution || !form.degree || saveMut.isPending}>{saveMut.isPending ? "Saving..." : editId ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this record?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteId && deleteMut.mutate(deleteId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

/* ---- Experience Tab ---- */
const ExperienceTab = ({ staffId }: { staffId: string }) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ company: "", title: "", start_date: "", end_date: "", notes: "" });

  const { data: items = [] } = useQuery({
    queryKey: ["staff-experience", staffId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("staff_experience").select("*").eq("staff_id", staffId).order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: any = { staff_id: staffId, company: form.company, title: form.title, start_date: form.start_date || null, end_date: form.end_date || null, notes: form.notes || null };
      if (editId) {
        const { error } = await (supabase as any).from("staff_experience").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("staff_experience").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["staff-experience", staffId] }); toast.success("Saved"); closeForm(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase as any).from("staff_experience").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["staff-experience", staffId] }); toast.success("Deleted"); setDeleteId(null); },
  });

  const closeForm = () => { setOpen(false); setEditId(null); setForm({ company: "", title: "", start_date: "", end_date: "", notes: "" }); };
  const openEdit = (item: any) => { setEditId(item.id); setForm({ company: item.company, title: item.title, start_date: item.start_date || "", end_date: item.end_date || "", notes: item.notes || "" }); setOpen(true); };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Work Experience</CardTitle>
          <Button size="sm" onClick={() => { setForm({ company: "", title: "", start_date: "", end_date: "", notes: "" }); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? <p className="text-sm text-muted-foreground">No work experience added yet.</p> : (
          <div className="space-y-3">
            {items.map((item: any) => (
              <div key={item.id} className="flex items-start justify-between p-3 rounded-lg border bg-muted/30">
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.company}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.start_date ? format(new Date(item.start_date), "MMM yyyy") : "?"} – {item.end_date ? format(new Date(item.end_date), "MMM yyyy") : "Present"}
                  </p>
                  {item.notes && <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}><Edit className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Experience" : "Add Experience"}</DialogTitle><DialogDescription>Enter work details</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label>Company *</Label><Input className="mt-1" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            <div><Label>Title *</Label><Input className="mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date</Label><Input type="date" className="mt-1" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><Label>End Date</Label><Input type="date" className="mt-1" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Textarea className="mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
            <Button onClick={() => saveMut.mutate()} disabled={!form.company || !form.title || saveMut.isPending}>{saveMut.isPending ? "Saving..." : editId ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this record?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteId && deleteMut.mutate(deleteId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

/* ---- Aspirations Tab ---- */
const AspirationsTab = ({ staffId }: { staffId: string }) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", target_date: "", status: "Active" });

  const { data: items = [] } = useQuery({
    queryKey: ["staff-aspirations", staffId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("staff_aspirations").select("*").eq("staff_id", staffId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: any = { staff_id: staffId, title: form.title, description: form.description || null, target_date: form.target_date || null, status: form.status };
      if (editId) {
        const { error } = await (supabase as any).from("staff_aspirations").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("staff_aspirations").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["staff-aspirations", staffId] }); toast.success("Saved"); closeForm(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase as any).from("staff_aspirations").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["staff-aspirations", staffId] }); toast.success("Deleted"); setDeleteId(null); },
  });

  const closeForm = () => { setOpen(false); setEditId(null); setForm({ title: "", description: "", target_date: "", status: "Active" }); };
  const openEdit = (item: any) => { setEditId(item.id); setForm({ title: item.title, description: item.description || "", target_date: item.target_date || "", status: item.status }); setOpen(true); };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Aspirations & Goals</CardTitle>
          <Button size="sm" onClick={() => { setForm({ title: "", description: "", target_date: "", status: "Active" }); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? <p className="text-sm text-muted-foreground">No aspirations added yet.</p> : (
          <div className="space-y-3">
            {items.map((item: any) => (
              <div key={item.id} className="flex items-start justify-between p-3 rounded-lg border bg-muted/30">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{item.title}</p>
                    <Badge variant={item.status === "Active" ? "default" : item.status === "Achieved" ? "secondary" : "outline"}>{item.status}</Badge>
                  </div>
                  {item.description && <p className="text-sm text-muted-foreground mt-1">{item.description}</p>}
                  {item.target_date && <p className="text-xs text-muted-foreground mt-1">Target: {format(new Date(item.target_date), "MMM yyyy")}</p>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}><Edit className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Aspiration" : "Add Aspiration"}</DialogTitle><DialogDescription>Set career goals</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input className="mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea className="mt-1" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Target Date</Label><Input type="date" className="mt-1" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Achieved">Achieved</SelectItem>
                    <SelectItem value="On Hold">On Hold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
            <Button onClick={() => saveMut.mutate()} disabled={!form.title || saveMut.isPending}>{saveMut.isPending ? "Saving..." : editId ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this aspiration?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteId && deleteMut.mutate(deleteId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

/* ---- Requests Tab (Support, Ideas, Feedback) ---- */
const REQUEST_TYPES = [
  { value: "support", label: "Support Request", icon: HelpCircle, color: "text-blue-500" },
  { value: "idea", label: "Idea", icon: Lightbulb, color: "text-yellow-500" },
  { value: "feedback", label: "Feedback", icon: MessageCircle, color: "text-green-500" },
];

const RequestsTab = ({ staffId }: { staffId: string }) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ type: "support", title: "", description: "", priority: "Medium", status: "Open" });

  const { data: items = [] } = useQuery({
    queryKey: ["staff-requests", staffId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("staff_requests").select("*").eq("staff_id", staffId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = filter === "all" ? items : items.filter((i: any) => i.type === filter);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: any = { staff_id: staffId, type: form.type, title: form.title, description: form.description || null, priority: form.priority, status: form.status };
      if (editId) {
        const { error } = await (supabase as any).from("staff_requests").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("staff_requests").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["staff-requests", staffId] }); toast.success("Saved"); closeForm(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase as any).from("staff_requests").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["staff-requests", staffId] }); toast.success("Deleted"); setDeleteId(null); },
  });

  const closeForm = () => { setOpen(false); setEditId(null); setForm({ type: "support", title: "", description: "", priority: "Medium", status: "Open" }); };
  const openEdit = (item: any) => { setEditId(item.id); setForm({ type: item.type, title: item.title, description: item.description || "", priority: item.priority, status: item.status }); setOpen(true); };

  const getTypeInfo = (type: string) => REQUEST_TYPES.find((t) => t.value === type) || REQUEST_TYPES[0];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Support, Ideas & Feedback</CardTitle>
          <div className="flex gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="support">Support</SelectItem>
                <SelectItem value="idea">Ideas</SelectItem>
                <SelectItem value="feedback">Feedback</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => { setForm({ type: "support", title: "", description: "", priority: "Medium", status: "Open" }); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Add</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? <p className="text-sm text-muted-foreground">No requests yet.</p> : (
          <div className="space-y-3">
            {filtered.map((item: any) => {
              const typeInfo = getTypeInfo(item.type);
              const Icon = typeInfo.icon;
              return (
                <div key={item.id} className="flex items-start justify-between p-3 rounded-lg border bg-muted/30">
                  <div className="flex gap-3">
                    <Icon className={`h-5 w-5 mt-0.5 ${typeInfo.color}`} />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{item.title}</p>
                        <Badge variant="outline" className="text-xs">{typeInfo.label}</Badge>
                        <Badge variant={item.status === "Open" ? "default" : item.status === "Resolved" ? "secondary" : "outline"} className="text-xs">{item.status}</Badge>
                        <Badge variant="outline" className="text-xs">{item.priority}</Badge>
                      </div>
                      {item.description && <p className="text-sm text-muted-foreground mt-1">{item.description}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{format(new Date(item.created_at), "dd MMM yyyy")}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}><Edit className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Request" : "New Request"}</DialogTitle><DialogDescription>Submit support, idea or feedback</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Type *</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="support">Support Request</SelectItem>
                  <SelectItem value="idea">Idea</SelectItem>
                  <SelectItem value="feedback">Feedback</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Title *</Label><Input className="mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea className="mt-1" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Resolved">Resolved</SelectItem>
                    <SelectItem value="Closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
            <Button onClick={() => saveMut.mutate()} disabled={!form.title || saveMut.isPending}>{saveMut.isPending ? "Saving..." : editId ? "Update" : "Submit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this request?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteId && deleteMut.mutate(deleteId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default StaffDetail;
