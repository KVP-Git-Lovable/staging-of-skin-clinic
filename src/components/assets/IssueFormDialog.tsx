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

interface IssueFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: any[];
  vendors: any[];
  preselectedAssetId?: string;
}

export function IssueFormDialog({ open, onOpenChange, assets, vendors, preselectedAssetId }: IssueFormDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    asset_id: preselectedAssetId || "",
    title: "", description: "", priority: "Medium",
    reported_by: "", vendor_id: "", cost: "",
  });

  const update = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("asset_issues").insert({
        asset_id: form.asset_id,
        title: form.title,
        description: form.description || null,
        priority: form.priority,
        reported_by: form.reported_by || null,
        vendor_id: form.vendor_id || null,
        cost: form.cost ? Number(form.cost) : 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-issues"] });
      toast.success("Issue reported successfully");
      onOpenChange(false);
      setForm({ asset_id: "", title: "", description: "", priority: "Medium", reported_by: "", vendor_id: "", cost: "" });
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Report Asset Issue</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Asset *</Label>
            <Select value={form.asset_id} onValueChange={(v) => update("asset_id", v)}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select asset" /></SelectTrigger>
              <SelectContent>
                {assets.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} {a.asset_code ? `(${a.asset_code})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Issue Title *</Label><Input value={form.title} onChange={(e) => update("title", e.target.value)} className="mt-1.5" placeholder="e.g. Display not working" /></div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => update("description", e.target.value)} className="mt-1.5" rows={3} placeholder="Describe the issue in detail..." /></div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => update("priority", v)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Low", "Medium", "High", "Critical"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reported By</Label><Input value={form.reported_by} onChange={(e) => update("reported_by", e.target.value)} className="mt-1.5" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Assign Vendor</Label>
              <Select value={form.vendor_id} onValueChange={(v) => update("vendor_id", v)}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>{vendors.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Estimated Cost (₹)</Label><Input type="number" value={form.cost} onChange={(e) => update("cost", e.target.value)} className="mt-1.5" /></div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-1" disabled={!form.asset_id || !form.title.trim() || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving..." : "Report Issue"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
