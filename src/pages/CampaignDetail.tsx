import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Edit2, Save, Plus, X, IndianRupee, Users, TrendingUp, Wallet, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/dashboard/StatCard";
import { PatientCombobox } from "@/components/patients/PatientCombobox";
import { format, differenceInDays } from "date-fns";
import { CAMPAIGN_TYPES, CAMPAIGN_STATUSES } from "./Campaigns";

const statusColors: Record<string, string> = {
  Planning: "bg-info/10 text-info",
  Active: "bg-success/10 text-success",
  Completed: "bg-muted text-muted-foreground",
};

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [spentEdit, setSpentEdit] = useState<string>("");
  const [linkPatientId, setLinkPatientId] = useState("");
  const [newNote, setNewNote] = useState("");

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns" as any).select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  const { data: linkedPatients = [] } = useQuery({
    queryKey: ["campaign-patients", id],
    queryFn: async () => {
      const { data, error } = await (supabase.from("patient_campaigns") as any)
        .select("id, linked_date, patients(id, first_name, last_name, phone, source, created_at)")
        .eq("campaign_id", id!)
        .order("linked_date", { ascending: false });
      if (error) throw error;
      return (data || []).map((row: any) => ({
        link_id: row.id,
        linked_date: row.linked_date,
        ...(row.patients || {}),
      }));
    },
    enabled: !!id,
  });

  const { data: revenueData = { total: 0 } } = useQuery({
    queryKey: ["campaign-revenue", id, linkedPatients.map((p: any) => p.id)],
    queryFn: async () => {
      if (linkedPatients.length === 0) return { total: 0 };
      const ids = linkedPatients.map((p: any) => p.id);
      const { data, error } = await supabase.from("invoices").select("total_amount").in("patient_id", ids);
      if (error) throw error;
      const total = (data || []).reduce((s, inv: any) => s + Number(inv.total_amount || 0), 0);
      return { total };
    },
    enabled: linkedPatients.length > 0,
  });

  const { data: revenueByPatient = {} } = useQuery({
    queryKey: ["campaign-revenue-by-patient", id, linkedPatients.map((p: any) => p.id)],
    queryFn: async () => {
      if (linkedPatients.length === 0) return {} as Record<string, number>;
      const ids = linkedPatients.map((p: any) => p.id);
      const { data, error } = await supabase.from("invoices").select("patient_id, total_amount").in("patient_id", ids);
      if (error) throw error;
      const map: Record<string, number> = {};
      (data || []).forEach((inv: any) => {
        map[inv.patient_id] = (map[inv.patient_id] || 0) + Number(inv.total_amount || 0);
      });
      return map;
    },
    enabled: linkedPatients.length > 0,
  });

  const { data: updates = [] } = useQuery({
    queryKey: ["campaign-updates", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaign_updates" as any).select("*").eq("campaign_id", id!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await supabase.from("campaigns" as any).update(patch).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign", id] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const linkMutation = useMutation({
    mutationFn: async (patientId: string) => {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await (supabase.from("patient_campaigns") as any).insert({
        patient_id: patientId,
        campaign_id: id,
        linked_by: userRes?.user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-patients", id] });
      qc.invalidateQueries({ queryKey: ["patient-campaigns"] });
      setLinkPatientId("");
      toast.success("Patient linked");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const unlinkMutation = useMutation({
    mutationFn: async (patientId: string) => {
      const { error } = await (supabase.from("patient_campaigns") as any)
        .delete()
        .eq("campaign_id", id!)
        .eq("patient_id", patientId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-patients", id] });
      qc.invalidateQueries({ queryKey: ["patient-campaigns"] });
      toast.success("Patient unlinked");
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async () => {
      if (!newNote.trim()) throw new Error("Note required");
      const { error } = await supabase.from("campaign_updates" as any).insert({ campaign_id: id, note: newNote.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-updates", id] });
      setNewNote("");
      toast.success("Update added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!campaign) return <div className="p-8 text-muted-foreground">Campaign not found</div>;

  const budget = Number(campaign.budget || 0);
  const spent = Number(campaign.amount_spent || 0);
  const newPatients = linkedPatients.length;
  const revenue = revenueData.total;
  const roi = spent > 0 ? ((revenue - spent) / spent) * 100 : 0;
  const duration = campaign.start_date && campaign.end_date
    ? `${differenceInDays(new Date(campaign.end_date), new Date(campaign.start_date)) + 1} days`
    : "—";

  const openEdit = () => {
    setEditForm({
      name: campaign.name,
      type: campaign.type,
      status: campaign.status,
      start_date: campaign.start_date || "",
      end_date: campaign.end_date || "",
      budget: campaign.budget,
      target_audience: campaign.target_audience || "",
      goals: campaign.goals || "",
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    await updateMutation.mutateAsync({
      ...editForm,
      start_date: editForm.start_date || null,
      end_date: editForm.end_date || null,
      budget: Number(editForm.budget) || 0,
    });
    setEditOpen(false);
  };

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/campaigns")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Megaphone className="h-6 w-6 text-primary" /> {campaign.name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline">{campaign.type}</Badge>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[campaign.status]}`}>{campaign.status}</span>
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={openEdit}><Edit2 className="h-4 w-4 mr-2" /> Edit</Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="spend">Spend & ROI</TabsTrigger>
          <TabsTrigger value="patients">Linked Patients</TabsTrigger>
          <TabsTrigger value="notes">Notes & Updates</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <Card><CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Name" value={campaign.name} />
            <Field label="Type" value={campaign.type} />
            <Field label="Status" value={campaign.status} />
            <Field label="Budget" value={`₹${budget.toLocaleString()}`} />
            <Field label="Duration" value={duration} />
            <Field label="Start → End" value={`${campaign.start_date ? format(new Date(campaign.start_date), "dd MMM yyyy") : "—"} → ${campaign.end_date ? format(new Date(campaign.end_date), "dd MMM yyyy") : "—"}`} />
            <Field label="Target Audience" value={campaign.target_audience || "—"} className="sm:col-span-2" />
            <Field label="Goals / Description" value={campaign.goals || "—"} className="sm:col-span-2" />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="spend" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
            <StatCard compact title="Total Budget" value={`₹${budget.toLocaleString()}`} icon={Wallet} />
            <StatCard compact title="Amount Spent" value={`₹${spent.toLocaleString()}`} icon={IndianRupee} iconColor="bg-warning/10 text-warning" />
            <StatCard compact title="New Patients" value={newPatients} icon={Users} iconColor="bg-info/10 text-info" />
            <StatCard compact title="Revenue" value={`₹${revenue.toLocaleString()}`} icon={IndianRupee} iconColor="bg-success/10 text-success" />
            <StatCard compact title="ROI" value={spent > 0 ? `${roi.toFixed(1)}%` : "—"} icon={TrendingUp} iconColor={roi >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"} />
          </div>
          <Card><CardContent className="p-6 space-y-3">
            <Label>Update Amount Spent (₹)</Label>
            <div className="flex gap-2 max-w-md">
              <Input type="number" placeholder={String(spent)} value={spentEdit} onChange={(e) => setSpentEdit(e.target.value)} />
              <Button onClick={async () => {
                await updateMutation.mutateAsync({ amount_spent: Number(spentEdit) || 0 });
                setSpentEdit("");
              }}>
                <Save className="h-4 w-4 mr-2" /> Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">ROI auto-calculated as (Revenue − Spend) / Spend × 100. Revenue is summed from invoices of linked patients.</p>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="patients" className="space-y-4 mt-4">
          <Card><CardContent className="p-4 space-y-3">
            <Label>Link a patient to this campaign</Label>
            <div className="flex gap-2">
              <div className="flex-1"><PatientCombobox value={linkPatientId} onValueChange={setLinkPatientId} placeholder="Select patient…" /></div>
              <Button onClick={() => linkPatientId && linkMutation.mutate(linkPatientId)} disabled={!linkPatientId || linkMutation.isPending}>
                <Plus className="h-4 w-4 mr-2" /> Link
              </Button>
            </div>
          </CardContent></Card>

          <div className="data-table">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Date Linked</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {linkedPatients.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No patients linked yet</TableCell></TableRow>
                ) : linkedPatients.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium text-primary cursor-pointer" onClick={() => navigate(`/patients/${p.id}`)}>{p.first_name} {p.last_name}</TableCell>
                    <TableCell>{p.phone || "—"}</TableCell>
                    <TableCell>{p.linked_date ? format(new Date(p.linked_date), "dd MMM yyyy") : "—"}</TableCell>
                    <TableCell>₹{((revenueByPatient as any)[p.id] || 0).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => unlinkMutation.mutate(p.id)}>
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="notes" className="space-y-4 mt-4">
          <Card><CardContent className="p-4 space-y-3">
            <Label>Add Update</Label>
            <Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={3} placeholder="What's new with this campaign?" />
            <Button onClick={() => addNoteMutation.mutate()} disabled={addNoteMutation.isPending || !newNote.trim()}>
              <Plus className="h-4 w-4 mr-2" /> Add Update
            </Button>
          </CardContent></Card>

          <div className="space-y-3">
            {updates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No updates yet</p>
            ) : updates.map((u: any) => (
              <Card key={u.id}><CardContent className="p-4">
                <p className="text-sm whitespace-pre-wrap">{u.note}</p>
                <p className="text-xs text-muted-foreground mt-2">{format(new Date(u.created_at), "dd MMM yyyy, h:mm a")}</p>
              </CardContent></Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit Campaign</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Campaign Name *</Label>
              <Input value={editForm.name || ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={editForm.type} onValueChange={(v) => setEditForm({ ...editForm, type: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{CAMPAIGN_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{CAMPAIGN_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={editForm.start_date || ""} onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="date" value={editForm.end_date || ""} onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })} className="mt-1.5" />
              </div>
            </div>
            <div>
              <Label>Budget (₹)</Label>
              <Input type="number" value={editForm.budget ?? 0} onChange={(e) => setEditForm({ ...editForm, budget: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label>Target Audience</Label>
              <Input value={editForm.target_audience || ""} onChange={(e) => setEditForm({ ...editForm, target_audience: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label>Goals / Description</Label>
              <Textarea value={editForm.goals || ""} onChange={(e) => setEditForm({ ...editForm, goals: e.target.value })} rows={3} className="mt-1.5" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={updateMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5 whitespace-pre-wrap">{value}</p>
    </div>
  );
}