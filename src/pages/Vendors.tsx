import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { moveToTrash } from "@/lib/trash";
import { toast } from "sonner";
import { Plus, Search, Trash2, Globe, Building2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";

interface ContactRow {
  contact_name: string;
  phone: string;
  email: string;
}

const emptyContact: ContactRow = { contact_name: "", phone: "", email: "" };

const emptyVendor = {
  name: "",
  gst_number: "",
  address: "",
  website: "",
};

export default function Vendors() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<any>(null);
  const [form, setForm] = useState(emptyVendor);
  const [contacts, setContacts] = useState<ContactRow[]>([{ ...emptyContact }]);
  const [selectedVendor, setSelectedVendor] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["vendors", search],
    queryFn: async () => {
      let q = supabase.from("vendors").select("*").order("name");
      if (search) q = q.ilike("name", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: vendorContacts = [] } = useQuery({
    queryKey: ["vendor-contacts", selectedVendor?.id],
    queryFn: async () => {
      if (!selectedVendor?.id) return [];
      const { data, error } = await supabase.from("vendor_contacts").select("*").eq("vendor_id", selectedVendor.id).order("created_at");
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedVendor?.id,
  });

  // Count contacts per vendor for list display
  const { data: contactCounts = {} } = useQuery({
    queryKey: ["vendor-contact-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendor_contacts").select("vendor_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((c) => { counts[c.vendor_id] = (counts[c.vendor_id] || 0) + 1; });
      return counts;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingVendor) {
        const { error } = await supabase.from("vendors").update({
          name: form.name, gst_number: form.gst_number || null, address: form.address || null, website: (form as any).website || null,
        }).eq("id", editingVendor.id);
        if (error) throw error;
        // Delete old contacts and re-insert
        await supabase.from("vendor_contacts").delete().eq("vendor_id", editingVendor.id);
        const validContacts = contacts.filter(c => c.contact_name.trim());
        if (validContacts.length > 0) {
          const { error: cErr } = await supabase.from("vendor_contacts").insert(
            validContacts.map(c => ({ vendor_id: editingVendor.id, contact_name: c.contact_name, phone: c.phone || null, email: c.email || null }))
          );
          if (cErr) throw cErr;
        }
      } else {
        const { data: newVendor, error } = await supabase.from("vendors").insert({
          name: form.name, gst_number: form.gst_number || null, address: form.address || null, website: (form as any).website || null,
        }).select().single();
        if (error) throw error;
        const validContacts = contacts.filter(c => c.contact_name.trim());
        if (validContacts.length > 0) {
          const { error: cErr } = await supabase.from("vendor_contacts").insert(
            validContacts.map(c => ({ vendor_id: newVendor.id, contact_name: c.contact_name, phone: c.phone || null, email: c.email || null }))
          );
          if (cErr) throw cErr;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-contact-counts"] });
      queryClient.invalidateQueries({ queryKey: ["vendors-list"] });
      toast.success(editingVendor ? "Vendor updated" : "Vendor created");
      setDialogOpen(false);
      setEditingVendor(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const error: any = await moveToTrash("vendors", id).then(() => null).catch((e: any) => e);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-contact-counts"] });
      queryClient.invalidateQueries({ queryKey: ["vendors-list"] });
      toast.success("Vendor deleted");
      setDeleteId(null);
      setSheetOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openAdd = () => {
    setEditingVendor(null);
    setForm(emptyVendor);
    setContacts([{ ...emptyContact }]);
    setDialogOpen(true);
  };

  const openEdit = async (vendor: any) => {
    setEditingVendor(vendor);
    setForm({ name: vendor.name, gst_number: vendor.gst_number || "", address: vendor.address || "", website: vendor.website || "" });
    const { data } = await supabase.from("vendor_contacts").select("*").eq("vendor_id", vendor.id).order("created_at");
    setContacts(data && data.length > 0 ? data.map(c => ({ contact_name: c.contact_name, phone: c.phone || "", email: c.email || "" })) : [{ ...emptyContact }]);
    setDialogOpen(true);
  };

  const openDetail = (vendor: any) => {
    setSelectedVendor(vendor);
    setSheetOpen(true);
  };

  const updateContact = (idx: number, field: keyof ContactRow, value: string) => {
    setContacts(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const removeContact = (idx: number) => {
    setContacts(prev => prev.length <= 1 ? [{ ...emptyContact }] : prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold">Vendor Master</h1>
          <p className="text-sm text-muted-foreground">Manage your vendors and contacts</p>
        </div>
        <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" />Add Vendor</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search vendors..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor Name</TableHead>
                <TableHead>GST Number</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Contacts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : vendors.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No vendors found</TableCell></TableRow>
              ) : vendors.map((v, i) => (
                <motion.tr key={v.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                  className="border-b cursor-pointer hover:bg-muted/50" onClick={() => openDetail(v)}>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell className="text-sm">{v.gst_number || "—"}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{v.address || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{contactCounts[v.id] || 0} contacts</Badge>
                  </TableCell>
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVendor ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
            <DialogDescription>{editingVendor ? "Update vendor details" : "Create a new vendor with contacts"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Vendor Name *</Label>
              <Input className="mt-1" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Company name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>GST Number</Label>
                <Input className="mt-1" value={form.gst_number} onChange={e => setForm(p => ({ ...p, gst_number: e.target.value }))} placeholder="GSTIN" />
              </div>
              <div>
                <Label>Website</Label>
                <Input className="mt-1" value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))} placeholder="https://..." />
              </div>
            </div>
            <div>
              <Label>Office Address</Label>
              <Textarea className="mt-1" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} rows={2} placeholder="Full address" />
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold flex items-center gap-2"><Users className="h-4 w-4" />Contacts</Label>
                <Button variant="outline" size="sm" onClick={() => setContacts(p => [...p, { ...emptyContact }])}>
                  <Plus className="mr-1 h-3 w-3" />Add Contact
                </Button>
              </div>
              {contacts.map((c, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                  <div>
                    {idx === 0 && <Label className="text-xs">Name</Label>}
                    <Input value={c.contact_name} onChange={e => updateContact(idx, "contact_name", e.target.value)} placeholder="Name" />
                  </div>
                  <div>
                    {idx === 0 && <Label className="text-xs">Phone</Label>}
                    <Input value={c.phone} onChange={e => updateContact(idx, "phone", e.target.value)} placeholder="Phone" />
                  </div>
                  <div>
                    {idx === 0 && <Label className="text-xs">Email</Label>}
                    <Input value={c.email} onChange={e => updateContact(idx, "email", e.target.value)} placeholder="Email" />
                  </div>
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeContact(idx)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>

            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={!form.name.trim() || saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : editingVendor ? "Update Vendor" : "Create Vendor"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-screen max-w-none sm:max-w-none overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedVendor?.name}</SheetTitle>
            <SheetDescription>Vendor details</SheetDescription>
          </SheetHeader>
          {selectedVendor && (
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">GST Number</p>
                  <p className="font-medium">{selectedVendor.gst_number || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Website</p>
                  {selectedVendor.website ? (
                    <a href={selectedVendor.website} target="_blank" rel="noopener noreferrer" className="font-medium text-primary flex items-center gap-1">
                      <Globe className="h-3 w-3" />{selectedVendor.website}
                    </a>
                  ) : <p className="font-medium">—</p>}
                </div>
              </div>
              {selectedVendor.address && (
                <div>
                  <p className="text-xs text-muted-foreground">Address</p>
                  <p className="font-medium">{selectedVendor.address}</p>
                </div>
              )}

              <Separator />

              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Users className="h-4 w-4" />Contacts ({vendorContacts.length})</h3>
                {vendorContacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No contacts added</p>
                ) : (
                  <div className="space-y-3">
                    {vendorContacts.map((c: any) => (
                      <Card key={c.id}>
                        <CardContent className="p-3">
                          <p className="font-medium">{c.contact_name}</p>
                          <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                            {c.phone && <span>📞 {c.phone}</span>}
                            {c.email && <span>✉️ {c.email}</span>}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-4">
                <Button variant="outline" className="flex-1" onClick={() => { setSheetOpen(false); openEdit(selectedVendor); }}>Edit</Button>
                <Button variant="destructive" className="flex-1" onClick={() => setDeleteId(selectedVendor.id)}>Delete</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vendor?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this vendor and all its contacts.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
