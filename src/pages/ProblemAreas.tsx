import { useState } from "react";
import { Plus, Pencil, Trash2, Search, ArrowLeft, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { moveToTrash } from "@/lib/trash";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

const ProblemAreas = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [selectedArea, setSelectedArea] = useState<any>(null);
  const [patientSearch, setPatientSearch] = useState("");

  const { data: problemAreas = [], isLoading } = useQuery({
    queryKey: ["problem-areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("problem_areas").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: areaPatients = [], isLoading: patientsLoading } = useQuery({
    queryKey: ["problem-area-patients", selectedArea?.id],
    enabled: !!selectedArea,
    queryFn: async () => {
      // Get all appointments that contain this primary concern id
      const { data: appointments, error } = await supabase
        .from("appointments")
        .select("patient_id, patient_name, start_time")
        .contains("problem_area_ids", [selectedArea.id]);
      if (error) throw error;
      if (!appointments || appointments.length === 0) return [];

      // Group by patient_id
      const patientMap = new Map<string, { patient_id: string; patient_name: string; lastAppointment: string; totalVisits: number }>();
      for (const appt of appointments) {
        if (!appt.patient_id) continue;
        const existing = patientMap.get(appt.patient_id);
        if (existing) {
          existing.totalVisits++;
          if (appt.start_time > existing.lastAppointment) existing.lastAppointment = appt.start_time;
        } else {
          patientMap.set(appt.patient_id, {
            patient_id: appt.patient_id,
            patient_name: appt.patient_name || "Unknown",
            lastAppointment: appt.start_time,
            totalVisits: 1,
          });
        }
      }

      // Fetch patient details (phone, status)
      const patientIds = Array.from(patientMap.keys());
      const { data: patients } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone, status")
        .in("id", patientIds);

      return Array.from(patientMap.values()).map((p) => {
        const patient = patients?.find((pt) => pt.id === p.patient_id);
        return {
          ...p,
          patient_name: patient ? `${patient.first_name} ${patient.last_name}` : p.patient_name,
          phone: patient?.phone || "—",
          status: patient?.status || "Active",
        };
      }).sort((a, b) => b.lastAppointment.localeCompare(a.lastAppointment));
    },
  });

  const filteredPatients = areaPatients.filter((p) => {
    if (!patientSearch) return true;
    const q = patientSearch.toLowerCase();
    return p.patient_name.toLowerCase().includes(q) || p.phone.toLowerCase().includes(q);
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required");
      if (editId) {
        const { error } = await supabase.from("problem_areas").update({ name: name.trim(), description: description.trim() || null, is_active: isActive }).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("problem_areas").insert({ name: name.trim(), description: description.trim() || null, is_active: isActive });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["problem-areas"] });
      toast.success(editId ? "Updated" : "Created");
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const error: any = await moveToTrash("problem_areas", id).then(() => null).catch((e: any) => e);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["problem-areas"] });
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    setEditId(item.id);
    setName(item.name);
    setDescription(item.description || "");
    setIsActive(item.is_active);
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    setEditId(null);
    setName("");
    setDescription("");
    setIsActive(true);
  };

  // Detail view for a selected primary concern
  if (selectedArea) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => { setSelectedArea(null); setPatientSearch(""); }}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">{selectedArea.name}</h1>
            <p className="text-sm text-muted-foreground">{selectedArea.description || "Primary concern detail"}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span className="font-medium text-foreground">{areaPatients.length}</span> patient{areaPatients.length !== 1 ? "s" : ""} with {selectedArea.name}
          </div>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone..."
              className="pl-9"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Last Appointment</TableHead>
                <TableHead>Total Visits</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patientsLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filteredPatients.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No patients found</TableCell></TableRow>
              ) : (
                filteredPatients.map((p) => (
                  <TableRow
                    key={p.patient_id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/patients/${p.patient_id}`)}
                  >
                    <TableCell className="font-medium">{p.patient_name}</TableCell>
                    <TableCell>{p.phone}</TableCell>
                    <TableCell>{format(new Date(p.lastAppointment), "dd MMM yyyy")}</TableCell>
                    <TableCell>{p.totalVisits}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "Active" ? "default" : "secondary"}>
                        {p.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Primary Concern Master</h1>
          <p className="text-sm text-muted-foreground">Define patient primary concerns for appointments</p>
        </div>
        <Button onClick={() => { closeDialog(); setOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Add Primary Concern
        </Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : problemAreas.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No primary concerns defined yet</TableCell></TableRow>
            ) : (
              problemAreas.map((item: any) => (
                <TableRow key={item.id} className="cursor-pointer" onClick={() => setSelectedArea(item)}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{item.description || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={item.is_active ? "default" : "secondary"}>
                      {item.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => openEdit(e, item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(item.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit" : "New"} Primary Concern</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Name *</Label>
              <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acne, Pigmentation" />
            </div>
            <div>
              <Label>Description</Label>
              <Input className="mt-1.5" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : editId ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProblemAreas;
