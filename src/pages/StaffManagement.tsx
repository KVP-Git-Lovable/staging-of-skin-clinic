import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Edit, Trash2, Loader2, Phone, Mail, Camera, UserCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { TimePicker12h } from "@/components/shared/TimePicker12h";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { moveToTrash } from "@/lib/trash";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion } from "framer-motion";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const FALLBACK_ROLES = ["Doctor", "Nurse", "Receptionist", "Lab Technician", "Therapist", "Admin", "Referral Doctor"];

interface StaffForm {
  first_name: string;
  last_name: string;
  role: string;
  phone: string;
  email: string;
  specialization: string;
  work_start_time: string;
  work_end_time: string;
  photo_url: string;
  is_active: boolean;
  consultation_fee: number;
  consultation_hsn: string;
}

const emptyForm: StaffForm = {
  first_name: "",
  last_name: "",
  role: "Doctor",
  phone: "",
  email: "",
  specialization: "",
  work_start_time: "09:00",
  work_end_time: "18:00",
  photo_url: "",
  is_active: true,
  consultation_fee: 0,
  consultation_hsn: "",
};

const StaffManagement = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const photoRef = useRef<HTMLInputElement>(null);
  // Seeded from ?q= so global search can hand a term to this list view
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("q") || "");
  const [formOpen, setFormOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffForm>({ ...emptyForm });
  const [uploading, setUploading] = useState(false);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["staff-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("*").order("first_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: rolesData = [] } = useQuery({
    queryKey: ["staff-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff_roles").select("name").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Active HSN codes from Tax Master — used for the consultation tax code.
  const { data: hsnCodes = [] } = useQuery({
    queryKey: ["hsn-tax-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hsn_tax_master")
        .select("id, hsn_code, igst, cgst, sgst")
        .eq("is_active", true)
        .order("hsn_code");
      if (error) throw error;
      return data || [];
    },
  });

  const roleOptions = Array.from(new Set([
    ...FALLBACK_ROLES,
    ...rolesData.map((r: any) => r.name).filter(Boolean),
  ]));

  const filtered = staff.filter((s: any) => {
    const q = search.toLowerCase();
    return (
      s.first_name.toLowerCase().includes(q) ||
      s.last_name.toLowerCase().includes(q) ||
      s.role.toLowerCase().includes(q) ||
      (s.specialization || "").toLowerCase().includes(q)
    );
  });

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `staff-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("patient-photos").upload(fileName, file, { upsert: true });
      if (error) throw error;
      const url = `${SUPABASE_URL}/storage/v1/object/public/patient-photos/${fileName}`;
      setForm((prev) => ({ ...prev, photo_url: url }));
      toast.success("Photo uploaded");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        first_name: form.first_name,
        last_name: form.last_name,
        role: form.role,
        phone: form.phone || null,
        email: form.email || null,
        specialization: form.specialization || null,
      };
      // New columns — only include if they exist (types might not be updated yet)
      (payload as any).photo_url = form.photo_url || null;
      (payload as any).work_start_time = form.work_start_time || "09:00";
      (payload as any).work_end_time = form.work_end_time || "18:00";
      (payload as any).is_active = form.is_active;
      (payload as any).consultation_fee = Number(form.consultation_fee) || 0;
      (payload as any).consultation_hsn = form.consultation_hsn || null;

      if (editId) {
        const { error } = await supabase.from("staff").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("staff").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-list"] });
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.success(editId ? "Staff updated" : "Staff created");
      closeForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const error: any = await moveToTrash("staff", id).then(() => null).catch((e: any) => e);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-list"] });
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Staff deleted");
      setDeleteId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (s: any) => {
    setEditId(s.id);
    setForm({
      first_name: s.first_name,
      last_name: s.last_name,
      role: s.role,
      phone: s.phone || "",
      email: s.email || "",
      specialization: s.specialization || "",
      work_start_time: s.work_start_time || "09:00",
      work_end_time: s.work_end_time || "18:00",
      photo_url: s.photo_url || "",
      is_active: s.is_active ?? true,
      consultation_fee: Number(s.consultation_fee) || 0,
      consultation_hsn: s.consultation_hsn || "",
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditId(null);
    setForm({ ...emptyForm });
  };

  const initials = (f: string, l: string) => `${f?.[0] || ""}${l?.[0] || ""}`.toUpperCase();

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Staff Management</h1>
          <p className="page-subtitle">Add and manage doctors, nurses, and clinic staff</p>
        </div>
        <Dialog open={formOpen} onOpenChange={(o) => { if (!o) closeForm(); else { setForm({ ...emptyForm }); setFormOpen(true); } }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Add Staff</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">{editId ? "Edit Staff" : "Add Staff Member"}</DialogTitle>
              <DialogDescription>Fill in the details below</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {/* Photo */}
              <div className="flex items-center gap-4">
                <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} />
                <Avatar className="h-16 w-16 cursor-pointer border-2 border-dashed border-muted-foreground/30" onClick={() => photoRef.current?.click()}>
                  <AvatarImage src={form.photo_url} />
                  <AvatarFallback className="bg-muted"><Camera className="h-6 w-6 text-muted-foreground" /></AvatarFallback>
                </Avatar>
                <div>
                  <Button variant="outline" size="sm" onClick={() => photoRef.current?.click()} disabled={uploading}>
                    {uploading ? "Uploading..." : "Upload Photo"}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">JPG, PNG up to 2MB</p>
                </div>
              </div>

              {/* Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>First Name *</Label>
                  <Input className="mt-1" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                </div>
                <div>
                  <Label>Last Name *</Label>
                  <Input className="mt-1" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                </div>
              </div>

              {/* Role & Specialization */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Role *</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Specialization</Label>
                  <Input className="mt-1" placeholder="e.g. Dermatology" value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
                </div>
              </div>

              {/* Contact */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Phone</Label>
                  <Input className="mt-1" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" className="mt-1" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>

              {/* Work Timing */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Work Start Time</Label>
                  <TimePicker12h className="mt-1" value={form.work_start_time} onChange={(v) => setForm({ ...form, work_start_time: v })} />
                </div>
                <div>
                  <Label>Work End Time</Label>
                  <TimePicker12h className="mt-1" value={form.work_end_time} onChange={(v) => setForm({ ...form, work_end_time: v })} />
                </div>
              </div>

              {/* Consultation Fee (used on invoices when this doctor is selected) */}
              <div>
                <Label>Consultation Fee (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  className="mt-1"
                  placeholder="0"
                  value={form.consultation_fee}
                  onChange={(e) => setForm({ ...form, consultation_fee: parseFloat(e.target.value) || 0 })}
                />
                <p className="text-[11px] text-muted-foreground mt-1">Auto-added as a line item when this doctor is selected on an invoice.</p>
              </div>

              {/* Consultation HSN (drives the tax on the consultation line item) */}
              <div>
                <Label>Consultation HSN</Label>
                <Select
                  value={form.consultation_hsn || "none"}
                  onValueChange={(v) => setForm({ ...form, consultation_hsn: v === "none" ? "" : v })}
                >
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select HSN code" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No HSN (no tax)</SelectItem>
                    {(hsnCodes as any[]).map((h: any) => (
                      <SelectItem key={h.id} value={String(h.hsn_code)}>
                        {h.hsn_code} — {(Number(h.igst) || 0) + (Number(h.cgst) || 0) + (Number(h.sgst) || 0)}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">Tax code applied to this doctor's consultation charge on invoices.</p>
              </div>

              {/* Active */}
              <div className="flex items-center gap-3">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Active Staff Member</Label>
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button variant="outline" onClick={closeForm}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={!form.first_name || !form.last_name || saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editId ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="mb-4 max-w-sm relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search staff..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <UserCircle className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No staff members found</p>
          <p className="text-sm">Click "Add Staff" to create your first staff member</p>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="data-table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Specialization</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Timing</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s: any) => (
                <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate(`/staff/${s.id}`)}>
                  <TableCell>
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={s.photo_url} />
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials(s.first_name, s.last_name)}</AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="font-medium">{s.first_name} {s.last_name}</TableCell>
                  <TableCell><Badge variant="secondary">{s.role}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{s.specialization || "—"}</TableCell>
                  <TableCell>
                    {s.phone ? <span className="flex items-center gap-1 text-sm"><Phone className="h-3 w-3" />{s.phone}</span> : "—"}
                  </TableCell>
                  <TableCell>
                    {s.email ? <span className="flex items-center gap-1 text-sm"><Mail className="h-3 w-3" />{s.email}</span> : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {s.work_start_time?.slice(0, 5) || "09:00"} – {s.work_end_time?.slice(0, 5) || "18:00"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.is_active !== false ? "default" : "outline"}>
                      {s.is_active !== false ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(s.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </motion.div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Staff Member?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the staff member permanently. Existing appointments and procedures linked to them will not be affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default StaffManagement;
