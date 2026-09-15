import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { moveToTrash } from "@/lib/trash";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Package, AlertTriangle, Link2, Plus, Trash2, Shield, Wrench } from "lucide-react";
import { IssueFormDialog } from "./IssueFormDialog";
import { toast } from "sonner";

interface AssetDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: any;
  vendors: any[];
}

export function AssetDetailSheet({ open, onOpenChange, asset, vendors }: AssetDetailSheetProps) {
  const queryClient = useQueryClient();
  const [issueFormOpen, setIssueFormOpen] = useState(false);
  const [linkServiceOpen, setLinkServiceOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [isRequired, setIsRequired] = useState(false);

  const { data: issues = [] } = useQuery({
    queryKey: ["asset-issues", asset.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_issues")
        .select("*, vendor:vendors(name)")
        .eq("asset_id", asset.id)
        .order("reported_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: linkedServices = [] } = useQuery({
    queryKey: ["asset-service-links", asset.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_service_links")
        .select("*, service:services(id, name, category)")
        .eq("asset_id", asset.id);
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: allServices = [] } = useQuery({
    queryKey: ["services-for-link"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("id, name, category").order("name");
      if (error) throw error;
      return data;
    },
    enabled: linkServiceOpen,
  });

  const linkService = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("asset_service_links").insert({
        asset_id: asset.id,
        service_id: selectedServiceId,
        is_required: isRequired,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-service-links", asset.id] });
      toast.success("Service linked");
      setLinkServiceOpen(false);
      setSelectedServiceId("");
      setIsRequired(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const unlinkService = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase.from("asset_service_links").delete().eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-service-links", asset.id] });
      toast.success("Service unlinked");
    },
  });

  const deleteAsset = useMutation({
    mutationFn: async () => {
      const error: any = await moveToTrash("assets", asset.id).then(() => null).catch((e: any) => e);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success("Asset deleted");
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const isWarrantyActive = asset.warranty_end_date && new Date(asset.warranty_end_date) > new Date();
  const isAmcActive = asset.amc_end_date && new Date(asset.amc_end_date) > new Date();

  const priorityColors: Record<string, string> = {
    Low: "bg-muted text-muted-foreground", Medium: "bg-warning/10 text-warning",
    High: "bg-destructive/10 text-destructive", Critical: "bg-destructive text-destructive-foreground",
  };
  const issueStatusColors: Record<string, string> = {
    Open: "bg-destructive/10 text-destructive", "In Progress": "bg-warning/10 text-warning",
    Resolved: "bg-success/10 text-success", Closed: "bg-muted text-muted-foreground",
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-screen max-w-none sm:max-w-none overflow-y-auto">
          <SheetHeader>
            <Badge variant="outline" className="text-[10px] text-muted-foreground w-fit font-normal">Asset</Badge>
            <SheetTitle className="font-display flex items-center gap-2">
              <Package className="h-5 w-5" /> {asset.name}
            </SheetTitle>
          </SheetHeader>

          {/* Quick info badges */}
          <div className="flex flex-wrap gap-2 mt-4">
            <Badge variant="outline">{asset.category}</Badge>
            <Badge className={`text-xs ${asset.status === 'Active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
              {asset.status}
            </Badge>
            {asset.warranty_end_date && (
              <Badge className={`text-xs ${isWarrantyActive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                <Shield className="h-3 w-3 mr-1" /> Warranty {isWarrantyActive ? "Active" : "Expired"}
              </Badge>
            )}
            {asset.amc_end_date && (
              <Badge className={`text-xs ${isAmcActive ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
                <Wrench className="h-3 w-3 mr-1" /> AMC {isAmcActive ? "Active" : "Expired"}
              </Badge>
            )}
          </div>

          <Tabs defaultValue="details" className="mt-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
              <TabsTrigger value="issues" className="text-xs">Issues ({issues.length})</TabsTrigger>
              <TabsTrigger value="services" className="text-xs">Services ({linkedServices.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4 space-y-4">
              {/* Details grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  ["Asset Code", asset.asset_code],
                  ["Serial Number", asset.serial_number],
                  ["Model", asset.model_number],
                  ["Manufacturer", asset.manufacturer],
                  ["Location", asset.location],
                  ["Condition", asset.condition],
                  ["Vendor", asset.vendor?.name],
                  ["Purchase Date", asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString() : null],
                  ["Purchase Price", asset.purchase_price ? `₹${Number(asset.purchase_price).toLocaleString()}` : null],
                  ["Invoice #", asset.invoice_number],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-medium">{value || "—"}</p>
                  </div>
                ))}
              </div>

              {/* Warranty section */}
              {asset.warranty_end_date && (
                <div className="border rounded-lg p-4">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2"><Shield className="h-4 w-4" /> Warranty</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><p className="text-xs text-muted-foreground">Start</p><p>{asset.warranty_start_date ? new Date(asset.warranty_start_date).toLocaleDateString() : "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">End</p><p>{new Date(asset.warranty_end_date).toLocaleDateString()}</p></div>
                  </div>
                  {asset.warranty_terms && <p className="text-xs text-muted-foreground mt-2">{asset.warranty_terms}</p>}
                </div>
              )}

              {/* AMC section */}
              {asset.amc_end_date && (
                <div className="border rounded-lg p-4">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2"><Wrench className="h-4 w-4" /> AMC</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><p className="text-xs text-muted-foreground">Start</p><p>{asset.amc_start_date ? new Date(asset.amc_start_date).toLocaleDateString() : "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">End</p><p>{new Date(asset.amc_end_date).toLocaleDateString()}</p></div>
                    <div><p className="text-xs text-muted-foreground">AMC Vendor</p><p>{asset.amc_vendor?.name || "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Cost</p><p>{asset.amc_cost ? `₹${Number(asset.amc_cost).toLocaleString()}` : "—"}</p></div>
                  </div>
                  {asset.amc_terms && <p className="text-xs text-muted-foreground mt-2">{asset.amc_terms}</p>}
                </div>
              )}

              {asset.notes && (
                <div><p className="text-xs text-muted-foreground">Notes</p><p className="text-sm mt-1">{asset.notes}</p></div>
              )}

              {/* Delete */}
              <div className="pt-4 border-t">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive gap-1.5">
                      <Trash2 className="h-3.5 w-3.5" /> Delete Asset
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {asset.name}?</AlertDialogTitle>
                      <AlertDialogDescription>This will permanently remove this asset and all its issues and service links.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteAsset.mutate()}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </TabsContent>

            <TabsContent value="issues" className="mt-4">
              <div className="flex justify-end mb-3">
                <Button size="sm" className="gap-1.5" onClick={() => setIssueFormOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Report Issue
                </Button>
              </div>
              {issues.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No issues reported for this asset</div>
              ) : (
                <div className="space-y-3">
                  {issues.map((issue: any) => (
                    <div key={issue.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm">{issue.title}</p>
                          {issue.description && <p className="text-xs text-muted-foreground mt-1">{issue.description}</p>}
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${priorityColors[issue.priority]}`}>{issue.priority}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${issueStatusColors[issue.status]}`}>{issue.status}</span>
                        </div>
                      </div>
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        <span>{new Date(issue.reported_date).toLocaleDateString()}</span>
                        {issue.reported_by && <span>By: {issue.reported_by}</span>}
                        {issue.vendor?.name && <span>Vendor: {issue.vendor.name}</span>}
                        {issue.cost > 0 && <span>Cost: ₹{Number(issue.cost).toLocaleString()}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="services" className="mt-4">
              <div className="flex justify-end mb-3">
                <Button size="sm" className="gap-1.5" onClick={() => setLinkServiceOpen(!linkServiceOpen)}>
                  <Link2 className="h-3.5 w-3.5" /> Link Service
                </Button>
              </div>

              {linkServiceOpen && (
                <div className="border rounded-lg p-4 mb-4 space-y-3">
                  <div>
                    <Label>Service</Label>
                    <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select service" /></SelectTrigger>
                      <SelectContent>
                        {allServices
                          .filter((s: any) => !linkedServices.some((ls: any) => ls.service_id === s.id))
                          .map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.category})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="is-required" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} className="rounded" />
                    <Label htmlFor="is-required" className="text-sm cursor-pointer">Required for this service</Label>
                  </div>
                  <Button size="sm" disabled={!selectedServiceId || linkService.isPending} onClick={() => linkService.mutate()}>
                    {linkService.isPending ? "Linking..." : "Link"}
                  </Button>
                </div>
              )}

              {linkedServices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No services linked to this asset</div>
              ) : (
                <div className="space-y-2">
                  {linkedServices.map((link: any) => (
                    <div key={link.id} className="flex items-center justify-between border rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{link.service?.name}</p>
                        <Badge variant="outline" className="text-[10px]">{link.service?.category}</Badge>
                        {link.is_required && <Badge className="text-[10px] bg-primary/10 text-primary">Required</Badge>}
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive" onClick={() => unlinkService.mutate(link.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <IssueFormDialog open={issueFormOpen} onOpenChange={setIssueFormOpen} assets={[asset]} vendors={vendors} preselectedAssetId={asset.id} />
    </>
  );
}
