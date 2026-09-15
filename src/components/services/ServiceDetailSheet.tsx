import { useState, useEffect } from "react";
import { Save, Trash2, Plus, Pill, Sparkles, Loader2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { moveToTrash } from "@/lib/trash";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface MedicineInput {
  id?: string;
  product_id: string;
  product_name: string;
  frequency: string;
  duration: string;
  instructions: string;
}

interface AssetLinkInput {
  id?: string;
  asset_id: string;
  asset_name: string;
  usage_guideline: string;
  time_taken: string;
}

interface ServiceDetailSheetProps {
  serviceId: string | null;
  onClose: () => void;
}

export function ServiceDetailSheet({ serviceId, onClose }: ServiceDetailSheetProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [duration, setDuration] = useState("");
  const [price, setPrice] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [gstPercent, setGstPercent] = useState("");
  const [materialPercent, setMaterialPercent] = useState("");
  const [procedureNotes, setProcedureNotes] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [medicines, setMedicines] = useState<MedicineInput[]>([]);
  const [assetLinks, setAssetLinks] = useState<AssetLinkInput[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [elaborating, setElaborating] = useState<string | null>(null);

  const { data: service } = useQuery({
    queryKey: ["service-detail", serviceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*").eq("id", serviceId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!serviceId,
  });

  const { data: serviceMeds = [] } = useQuery({
    queryKey: ["service-medicines-detail", serviceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_medicines")
        .select("*, pharma_products(name)")
        .eq("service_id", serviceId!);
      if (error) throw error;
      return data;
    },
    enabled: !!serviceId,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["pharma-products-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pharma_products")
        .select("id, name, default_frequency, default_duration, default_instructions")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: allAssets = [] } = useQuery({
    queryKey: ["assets-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase.from("assets").select("id, name").eq("status", "Active").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: serviceAssetLinks = [] } = useQuery({
    queryKey: ["service-asset-links", serviceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_service_links")
        .select("*, assets(name)")
        .eq("service_id", serviceId!);
      if (error) throw error;
      return data;
    },
    enabled: !!serviceId,
  });

  const { data: hsnTaxes = [] } = useQuery({
    queryKey: ["hsn-tax-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hsn_tax_master")
        .select("id, hsn_code, igst, cgst")
        .eq("is_active", true)
        .order("hsn_code");
      if (error) throw error;
      return data;
    },
  });

  const selectedHsn = hsnTaxes.find((h: any) => h.hsn_code === hsnCode);

  useEffect(() => {
    if (service && !initialized) {
      setName(service.name);
      setCategory(service.category);
      setDuration(String(service.duration));
      setPrice(String(service.price));
      setHsnCode((service as any).hsn_code || "");
      setGstPercent(String((service as any).gst_percent ?? ""));
      setMaterialPercent((service as any).material_percent === null || (service as any).material_percent === undefined ? "" : String((service as any).material_percent));
      setProcedureNotes(service.procedure_notes || "");
      setRecommendations((service.recommendations || []).join("\n"));
      setInitialized(true);
    }
  }, [service, initialized]);

  useEffect(() => {
    if (serviceMeds.length > 0 && initialized) {
      setMedicines(serviceMeds.map((m: any) => ({
        id: m.id,
        product_id: m.product_id,
        product_name: m.pharma_products?.name || "",
        frequency: m.frequency || "",
        duration: m.duration || "",
        instructions: m.instructions || "",
      })));
    }
  }, [serviceMeds, initialized]);

  useEffect(() => {
    if (serviceAssetLinks.length > 0 && initialized) {
      setAssetLinks(serviceAssetLinks.map((a: any) => ({
        id: a.id,
        asset_id: a.asset_id,
        asset_name: a.assets?.name || "",
        usage_guideline: a.usage_guideline || "",
        time_taken: a.time_taken ? String(a.time_taken) : "",
      })));
    }
  }, [serviceAssetLinks, initialized]);

  const handleClose = () => {
    setInitialized(false);
    setMedicines([]);
    setAssetLinks([]);
    onClose();
  };

  const elaborate = async (fieldType: "procedure_notes" | "recommendations") => {
    if (!name.trim()) { toast.error("Enter a service name first"); return; }
    const currentText = fieldType === "procedure_notes" ? procedureNotes : recommendations;
    setElaborating(fieldType);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elaborate-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ serviceName: name, fieldType, currentText }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "AI request failed" })); throw new Error(err.error || "AI request failed"); }
      const { text } = await res.json();
      if (fieldType === "procedure_notes") setProcedureNotes(text);
      else setRecommendations(text);
      toast.success("Text elaborated");
    } catch (e: any) { toast.error(e.message || "Failed to elaborate"); }
    finally { setElaborating(null); }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const recs = recommendations.split("\n").filter((r) => r.trim());
      const { error } = await supabase.from("services").update({
        name, category: category || "General", duration: parseInt(duration) || 30,
        price: parseFloat(price) || 0,
        hsn_code: hsnCode || null,
        gst_percent: selectedHsn ? Number(selectedHsn.igst || 0) + Number(selectedHsn.cgst || 0) : 0,
        material_percent: materialPercent.trim() === "" ? null : parseFloat(materialPercent),
        procedure_notes: procedureNotes || null, recommendations: recs,
      } as any).eq("id", serviceId!);
      if (error) throw error;

      // Delete old medicines, re-insert
      await supabase.from("service_medicines").delete().eq("service_id", serviceId!);
      const rows = medicines.filter((m) => m.product_id).map((m) => ({
        service_id: serviceId!, product_id: m.product_id,
        frequency: m.frequency || null, duration: m.duration || null, instructions: m.instructions || null,
      }));
      if (rows.length > 0) {
        const { error: mErr } = await supabase.from("service_medicines").insert(rows);
        if (mErr) throw mErr;
      }

      // Delete old asset links, re-insert
      await supabase.from("asset_service_links").delete().eq("service_id", serviceId!);
      const assetRows = assetLinks.filter((a) => a.asset_id).map((a) => ({
        service_id: serviceId!, asset_id: a.asset_id,
        usage_guideline: a.usage_guideline || null,
        time_taken: a.time_taken ? parseInt(a.time_taken) : null,
      }));
      if (assetRows.length > 0) {
        const { error: aErr } = await supabase.from("asset_service_links").insert(assetRows);
        if (aErr) throw aErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      queryClient.invalidateQueries({ queryKey: ["service-medicines"] });
      queryClient.invalidateQueries({ queryKey: ["service-asset-links"] });
      toast.success("Service updated");
      handleClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await supabase.from("service_medicines").delete().eq("service_id", serviceId!);
      await supabase.from("asset_service_links").delete().eq("service_id", serviceId!);
      const error: any = await moveToTrash("services", serviceId!).then(() => null).catch((e: any) => e);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      queryClient.invalidateQueries({ queryKey: ["service-medicines"] });
      queryClient.invalidateQueries({ queryKey: ["service-asset-links"] });
      toast.success("Service deleted");
      handleClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMedicine = () => setMedicines([...medicines, { product_id: "", product_name: "", frequency: "", duration: "", instructions: "" }]);
  const updateMedicine = (i: number, field: keyof MedicineInput, value: string) => {
    const updated = [...medicines];
    updated[i][field] = value;
    if (field === "product_id") {
      const prod: any = products.find((p: any) => p.id === value);
      updated[i].product_name = prod?.name || "";
      if (prod) {
        if (!updated[i].frequency) updated[i].frequency = prod.default_frequency || "";
        if (!updated[i].duration) updated[i].duration = prod.default_duration || "";
        if (!updated[i].instructions) updated[i].instructions = prod.default_instructions || "";
      }
    }
    setMedicines(updated);
  };
  const removeMedicine = (i: number) => setMedicines(medicines.filter((_, idx) => idx !== i));

  const addAssetLink = () => setAssetLinks([...assetLinks, { asset_id: "", asset_name: "", usage_guideline: "", time_taken: "" }]);
  const updateAssetLink = (i: number, field: keyof AssetLinkInput, value: string) => {
    const updated = [...assetLinks];
    (updated[i] as any)[field] = value;
    if (field === "asset_id") { updated[i].asset_name = allAssets.find((a) => a.id === value)?.name || ""; }
    setAssetLinks(updated);
  };
  const removeAssetLink = (i: number) => setAssetLinks(assetLinks.filter((_, idx) => idx !== i));

  return (
    <Sheet open={!!serviceId} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <SheetContent className="w-screen max-w-none sm:max-w-none overflow-y-auto">
        <SheetHeader>
          <Badge variant="outline" className="text-[10px] text-muted-foreground w-fit font-normal">Service</Badge>
          <SheetTitle className="font-display">Edit Service</SheetTitle>
        </SheetHeader>
        {!service ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-4 pt-4">
            <div>
              <Label>Service Name *</Label>
              <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Input className="mt-1.5" value={category} onChange={(e) => setCategory(e.target.value)} />
              </div>
              <div>
                <Label>Duration (mins)</Label>
                <Input type="number" className="mt-1.5" value={duration} onChange={(e) => setDuration(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Price (₹)</Label>
                <Input type="number" className="mt-1.5" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div>
                <Label>HSN Code</Label>
                <Select value={hsnCode} onValueChange={setHsnCode}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select HSN code" /></SelectTrigger>
                  <SelectContent>
                    {hsnTaxes.map((h: any) => (
                      <SelectItem key={h.id} value={h.hsn_code}>{h.hsn_code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedHsn && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    IGST {Number(selectedHsn.igst)}% · CGST {Number(selectedHsn.cgst)}% · Total {Number(selectedHsn.igst) + Number(selectedHsn.cgst)}%
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Material (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  placeholder="e.g. 20"
                  className="mt-1.5"
                  value={materialPercent}
                  onChange={(e) => setMaterialPercent(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1.5">Leave blank if this service has no material component</p>
              </div>
            </div>

            {/* Procedure Notes */}
            <div>
              <div className="flex items-center justify-between">
                <Label>Procedure Notes</Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary" onClick={() => elaborate("procedure_notes")} disabled={elaborating !== null}>
                  {elaborating === "procedure_notes" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Elaborate AI
                </Button>
              </div>
              <Textarea className="mt-1.5" rows={2} value={procedureNotes} onChange={(e) => setProcedureNotes(e.target.value)} />
            </div>

            {/* Recommendations */}
            <div>
              <div className="flex items-center justify-between">
                <Label>Recommendations (one per line)</Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary" onClick={() => elaborate("recommendations")} disabled={elaborating !== null}>
                  {elaborating === "recommendations" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Elaborate AI
                </Button>
              </div>
              <Textarea className="mt-1.5" rows={3} value={recommendations} onChange={(e) => setRecommendations(e.target.value)} />
            </div>

            {/* Medicines */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-display font-semibold flex items-center gap-2">
                  <Pill className="h-4 w-4" /> Medicines
                </Label>
                <Button type="button" variant="outline" size="sm" onClick={addMedicine}>
                  <Plus className="h-3 w-3 mr-1" /> Add Medicine
                </Button>
              </div>
              {medicines.map((med, i) => (
                <div key={i} className="border rounded-lg p-3 mb-3 space-y-2 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Medicine {i + 1}</span>
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => removeMedicine(i)}>Remove</Button>
                  </div>
                  <Select value={med.product_id} onValueChange={(v) => updateMedicine(i, "product_id", v)}>
                    <SelectTrigger><SelectValue placeholder="Select medicine" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-3 gap-2">
                    <Input placeholder="Frequency" value={med.frequency} onChange={(e) => updateMedicine(i, "frequency", e.target.value)} />
                    <Input placeholder="Duration" value={med.duration} onChange={(e) => updateMedicine(i, "duration", e.target.value)} />
                    <Input placeholder="Instructions" value={med.instructions} onChange={(e) => updateMedicine(i, "instructions", e.target.value)} />
                  </div>
                </div>
              ))}
            </div>

            {/* Assets */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-display font-semibold flex items-center gap-2">
                  <Wrench className="h-4 w-4" /> Required Assets
                </Label>
                <Button type="button" variant="outline" size="sm" onClick={addAssetLink}>
                  <Plus className="h-3 w-3 mr-1" /> Add Asset
                </Button>
              </div>
              {assetLinks.map((al, i) => (
                <div key={i} className="border rounded-lg p-3 mb-3 space-y-2 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Asset {i + 1}</span>
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => removeAssetLink(i)}>Remove</Button>
                  </div>
                  <Select value={al.asset_id} onValueChange={(v) => updateAssetLink(i, "asset_id", v)}>
                    <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
                    <SelectContent>
                      {allAssets.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Usage guideline" value={al.usage_guideline} onChange={(e) => updateAssetLink(i, "usage_guideline", e.target.value)} />
                    <Input type="number" placeholder="Time taken (mins)" value={al.time_taken} onChange={(e) => updateAssetLink(i, "time_taken", e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-4 border-t">
              <Button className="flex-1 gap-2" onClick={() => updateMutation.mutate()} disabled={!name || updateMutation.isPending}>
                <Save className="h-4 w-4" /> {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="icon"><Trash2 className="h-4 w-4" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this service?</AlertDialogTitle>
                    <AlertDialogDescription>This will permanently remove this service and its linked medicines.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
