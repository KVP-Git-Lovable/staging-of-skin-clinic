import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const VENDOR_CATEGORIES = ["Medical Equipment", "IT Services", "Furniture", "Consumables", "Maintenance", "General"];

interface VendorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VendorFormDialog({ open, onOpenChange }: VendorFormDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "", contact_person: "", phone: "", email: "",
    address: "", city: "", state: "", gst_number: "",
    category: "General", notes: "",
  });

  const update = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("vendors").insert({
        name: form.name,
        contact_person: form.contact_person || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        gst_number: form.gst_number || null,
        category: form.category,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast.success("Vendor added successfully");
      onOpenChange(false);
      setForm({ name: "", contact_person: "", phone: "", email: "", address: "", city: "", state: "", gst_number: "", category: "General", notes: "" });
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Add New Vendor</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Vendor Name *</Label><Input value={form.name} onChange={(e) => update("name", e.target.value)} className="mt-1.5" placeholder="e.g. MedTech Solutions" /></div>
            <div><Label>Contact Person</Label><Input value={form.contact_person} onChange={(e) => update("contact_person", e.target.value)} className="mt-1.5" /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => update("phone", e.target.value)} className="mt-1.5" placeholder="+91 98765 43210" /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} className="mt-1.5" /></div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => update("category", v)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{VENDOR_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Address</Label><Textarea value={form.address} onChange={(e) => update("address", e.target.value)} className="mt-1.5" rows={2} /></div>
          <div className="grid grid-cols-3 gap-4">
            <div><Label>City</Label><Input value={form.city} onChange={(e) => update("city", e.target.value)} className="mt-1.5" /></div>
            <div><Label>State</Label><Input value={form.state} onChange={(e) => update("state", e.target.value)} className="mt-1.5" /></div>
            <div><Label>GST Number</Label><Input value={form.gst_number} onChange={(e) => update("gst_number", e.target.value)} className="mt-1.5" /></div>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} className="mt-1.5" rows={2} /></div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-1" disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving..." : "Add Vendor"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
