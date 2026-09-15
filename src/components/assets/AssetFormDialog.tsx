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

const CATEGORIES = ["Equipment", "Furniture", "IT", "Medical Device", "Consumable", "Vehicle", "Other"];
const CONDITIONS = ["New", "Good", "Fair", "Poor"];

interface AssetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendors: any[];
}

export function AssetFormDialog({ open, onOpenChange, vendors }: AssetFormDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "", asset_code: "", category: "Equipment", description: "",
    vendor_id: "", purchase_date: "", purchase_price: "", invoice_number: "",
    serial_number: "", model_number: "", manufacturer: "", location: "",
    warranty_start_date: "", warranty_end_date: "", warranty_terms: "",
    amc_start_date: "", amc_end_date: "", amc_vendor_id: "", amc_cost: "", amc_terms: "",
    status: "Active", condition: "Good", notes: "",
  });

  const update = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("assets").insert({
        name: form.name,
        asset_code: form.asset_code || null,
        category: form.category,
        description: form.description || null,
        vendor_id: form.vendor_id || null,
        purchase_date: form.purchase_date || null,
        purchase_price: form.purchase_price ? Number(form.purchase_price) : 0,
        invoice_number: form.invoice_number || null,
        serial_number: form.serial_number || null,
        model_number: form.model_number || null,
        manufacturer: form.manufacturer || null,
        location: form.location || null,
        warranty_start_date: form.warranty_start_date || null,
        warranty_end_date: form.warranty_end_date || null,
        warranty_terms: form.warranty_terms || null,
        amc_start_date: form.amc_start_date || null,
        amc_end_date: form.amc_end_date || null,
        amc_vendor_id: form.amc_vendor_id || null,
        amc_cost: form.amc_cost ? Number(form.amc_cost) : 0,
        amc_terms: form.amc_terms || null,
        status: form.status,
        condition: form.condition,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success("Asset added successfully");
      onOpenChange(false);
      setForm({
        name: "", asset_code: "", category: "Equipment", description: "",
        vendor_id: "", purchase_date: "", purchase_price: "", invoice_number: "",
        serial_number: "", model_number: "", manufacturer: "", location: "",
        warranty_start_date: "", warranty_end_date: "", warranty_terms: "",
        amc_start_date: "", amc_end_date: "", amc_vendor_id: "", amc_cost: "", amc_terms: "",
        status: "Active", condition: "Good", notes: "",
      });
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Add New Asset</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 mt-2">
          {/* Basic Info */}
          <div>
            <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Basic Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Asset Name *</Label><Input value={form.name} onChange={(e) => update("name", e.target.value)} className="mt-1.5" placeholder="e.g. CO2 Laser Machine" /></div>
              <div><Label>Asset Code</Label><Input value={form.asset_code} onChange={(e) => update("asset_code", e.target.value)} className="mt-1.5" placeholder="AST-001" /></div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => update("category", v)}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Condition</Label>
                <Select value={form.condition} onValueChange={(v) => update("condition", v)}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Manufacturer</Label><Input value={form.manufacturer} onChange={(e) => update("manufacturer", e.target.value)} className="mt-1.5" /></div>
              <div><Label>Model Number</Label><Input value={form.model_number} onChange={(e) => update("model_number", e.target.value)} className="mt-1.5" /></div>
              <div><Label>Serial Number</Label><Input value={form.serial_number} onChange={(e) => update("serial_number", e.target.value)} className="mt-1.5" /></div>
              <div><Label>Location</Label><Input value={form.location} onChange={(e) => update("location", e.target.value)} className="mt-1.5" placeholder="Room 3, OT" /></div>
            </div>
            <div className="mt-3"><Label>Description</Label><Textarea value={form.description} onChange={(e) => update("description", e.target.value)} className="mt-1.5" rows={2} /></div>
          </div>

          {/* Purchase */}
          <div>
            <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Purchase Details</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Vendor</Label>
                <Select value={form.vendor_id} onValueChange={(v) => update("vendor_id", v)}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>{vendors.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Purchase Date</Label><Input type="date" value={form.purchase_date} onChange={(e) => update("purchase_date", e.target.value)} className="mt-1.5" /></div>
              <div><Label>Purchase Price (₹)</Label><Input type="number" value={form.purchase_price} onChange={(e) => update("purchase_price", e.target.value)} className="mt-1.5" /></div>
              <div><Label>Invoice Number</Label><Input value={form.invoice_number} onChange={(e) => update("invoice_number", e.target.value)} className="mt-1.5" /></div>
            </div>
          </div>

          {/* Warranty */}
          <div>
            <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Warranty</h4>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Warranty Start</Label><Input type="date" value={form.warranty_start_date} onChange={(e) => update("warranty_start_date", e.target.value)} className="mt-1.5" /></div>
              <div><Label>Warranty End</Label><Input type="date" value={form.warranty_end_date} onChange={(e) => update("warranty_end_date", e.target.value)} className="mt-1.5" /></div>
            </div>
            <div className="mt-3"><Label>Warranty Terms</Label><Textarea value={form.warranty_terms} onChange={(e) => update("warranty_terms", e.target.value)} className="mt-1.5" rows={2} /></div>
          </div>

          {/* AMC */}
          <div>
            <h4 className="text-sm font-semibold mb-3 text-muted-foreground">AMC (Annual Maintenance Contract)</h4>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>AMC Start</Label><Input type="date" value={form.amc_start_date} onChange={(e) => update("amc_start_date", e.target.value)} className="mt-1.5" /></div>
              <div><Label>AMC End</Label><Input type="date" value={form.amc_end_date} onChange={(e) => update("amc_end_date", e.target.value)} className="mt-1.5" /></div>
              <div>
                <Label>AMC Vendor</Label>
                <Select value={form.amc_vendor_id} onValueChange={(v) => update("amc_vendor_id", v)}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>{vendors.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>AMC Cost (₹)</Label><Input type="number" value={form.amc_cost} onChange={(e) => update("amc_cost", e.target.value)} className="mt-1.5" /></div>
            </div>
            <div className="mt-3"><Label>AMC Terms</Label><Textarea value={form.amc_terms} onChange={(e) => update("amc_terms", e.target.value)} className="mt-1.5" rows={2} /></div>
          </div>

          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} className="mt-1.5" rows={2} /></div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-1" disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving..." : "Add Asset"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
