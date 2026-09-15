import { useState, useMemo } from "react";
import { Plus, Search, Edit2, Trash2, Clock, IndianRupee, Pill, Sparkles, Loader2, Wrench, Cloud } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { moveToTrash } from "@/lib/trash";
import { normalizeName } from "@/lib/textNormalize";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ServiceDetailSheet } from "@/components/services/ServiceDetailSheet";
import { MicButton } from "@/components/shared/MicButton";
import { SearchableSelect } from "@/components/shared/SearchableSelect";

interface MedicineInput {
  product_id: string;
  product_name: string;
  frequency: string;
  duration: string;
  instructions: string;
}

interface AssetLinkInput {
  asset_id: string;
  asset_name: string;
  usage_guideline: string;
  time_taken: string;
}

const categories = ["All", "Skin Treatment", "Injectable", "Laser Treatment", "Regenerative", "General"];

const Services = () => {
  const queryClient = useQueryClient();
  // Seeded from ?q= so global search can hand a term to this list view
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("q") || "");
  const [activeCategory, setActiveCategory] = useState("All");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState(false);
  const [duration, setDuration] = useState("");
  const [price, setPrice] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [materialPercent, setMaterialPercent] = useState("");
  const [gstPercent, setGstPercent] = useState("");
  const [problemAreaIds, setProblemAreaIds] = useState<string[]>([]);
  const [procedureNotes, setProcedureNotes] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [medicines, setMedicines] = useState<MedicineInput[]>([]);
  const [assetLinks, setAssetLinks] = useState<AssetLinkInput[]>([]);
  const [elaborating, setElaborating] = useState<string | null>(null);

  const elaborate = async (fieldType: "procedure_notes" | "recommendations") => {
    if (!name.trim()) {
      toast.error("Enter a service name first");
      return;
    }
    const currentText = fieldType === "procedure_notes" ? procedureNotes : recommendations;
    setElaborating(fieldType);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elaborate-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ serviceName: name, fieldType, currentText }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "AI request failed" }));
        throw new Error(err.error || "AI request failed");
      }
      const { text } = await res.json();
      if (fieldType === "procedure_notes") setProcedureNotes(text);
      else setRecommendations(text);
      toast.success("Text elaborated — review and edit as needed");
    } catch (e: any) {
      toast.error(e.message || "Failed to elaborate");
    } finally {
      setElaborating(null);
    }
  };

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: categoryMaster = [] } = useQuery({
    queryKey: ["category-master"],
    queryFn: async () => {
      const { data, error } = await supabase.from("category_master").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  // Category Master entries plus any category already in use (Salesforce sync
  // writes categories that were never added to Category Master), so the
  // dropdown never hides an existing, filterable category.
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    (categoryMaster as any[]).forEach((c: any) => c?.name && set.add(String(c.name)));
    (services as any[]).forEach((s: any) => s?.category && set.add(String(s.category)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [categoryMaster, services]);

  const { data: serviceMedicines = [] } = useQuery({
    queryKey: ["service-medicines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_medicines")
        .select("*, pharma_products(name)");
      if (error) throw error;
      return data;
    },
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
      const { data, error } = await supabase
        .from("assets")
        .select("id, name")
        .eq("status", "Active")
        .order("name");
      if (error) throw error;
      return data;
    },
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

  const { data: problemAreas = [] } = useQuery({
    queryKey: ["problem-areas-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("problem_areas")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const dupe = services.find((s: any) => normalizeName(s.name) === normalizeName(name));
      if (dupe) throw new Error(`A service named "${dupe.name}" already exists`);

      const recs = recommendations.split("\n").filter((r) => r.trim());
      const { data: svc, error } = await supabase
        .from("services")
        .insert({
          name,
          category: category || "General",
          duration: parseInt(duration) || 30,
          price: parseFloat(price) || 0,
          hsn_code: hsnCode || null,
          gst_percent: selectedHsn ? Number(selectedHsn.igst || 0) + Number(selectedHsn.cgst || 0) : 0,
          material_percent: materialPercent.trim() === "" ? null : parseFloat(materialPercent),
          problem_area_ids: problemAreaIds,
          procedure_notes: procedureNotes || null,
          recommendations: recs,
        } as any)
        .select()
        .single();
      if (error) throw error;

      if (medicines.length > 0) {
        const rows = medicines
          .filter((m) => m.product_id)
          .map((m) => ({
            service_id: svc.id,
            product_id: m.product_id,
            frequency: m.frequency || null,
            duration: m.duration || null,
            instructions: m.instructions || null,
          }));
        if (rows.length > 0) {
          const { error: mErr } = await supabase.from("service_medicines").insert(rows);
          if (mErr) throw mErr;
        }
      }

      if (assetLinks.length > 0) {
        const aRows = assetLinks
          .filter((a) => a.asset_id)
          .map((a) => ({
            service_id: svc.id,
            asset_id: a.asset_id,
            usage_guideline: a.usage_guideline || null,
            time_taken: a.time_taken ? parseInt(a.time_taken) : null,
          }));
        if (aRows.length > 0) {
          const { error: aErr } = await supabase.from("asset_service_links").insert(aRows);
          if (aErr) throw aErr;
        }
      }
      return svc;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      queryClient.invalidateQueries({ queryKey: ["service-medicines"] });
      queryClient.invalidateQueries({ queryKey: ["service-asset-links"] });
      toast.success("Service created successfully");
      resetForm();
      setDialogOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.code === "23505" ? "A service with this name already exists" : err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("service_medicines").delete().eq("service_id", id);
      await supabase.from("asset_service_links").delete().eq("service_id", id);
      const error: any = await moveToTrash("services", id).then(() => null).catch((e: any) => e);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      queryClient.invalidateQueries({ queryKey: ["service-medicines"] });
      toast.success("Service deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      await supabase.from("service_medicines").delete().neq("service_id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("asset_service_links").delete().neq("service_id", "00000000-0000-0000-0000-000000000000");
      const { error } = await supabase.from("services").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      queryClient.invalidateQueries({ queryKey: ["service-medicines"] });
      queryClient.invalidateQueries({ queryKey: ["service-asset-links"] });
      toast.success("All services deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const syncSalesforceeMutation = useMutation({
    mutationFn: async () => {
      // Call Edge Function to fetch from Salesforce
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-salesforce-services`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch from Salesforce");
      }

      const data = await response.json();
      const sfServices = data.services || [];

      // Re-fetch fresh rather than trusting the (possibly stale) query-cache
      // `services` value, so this never races the initial page load.
      const { data: existing, error: fetchErr } = await supabase.from("services").select("*");
      if (fetchErr) throw fetchErr;
      const existingByNorm = new Map((existing || []).map((s: any) => [normalizeName(s.name), s]));

      const toInsert: any[] = [];
      const toUpdate: { id: string; patch: Record<string, any> }[] = [];
      const conflicts: string[] = [];
      let unchangedCount = 0;

      for (const sf of sfServices) {
        const recs = sf.Recommendations__c
          ? sf.Recommendations__c.split("\n").filter((r: string) => r.trim())
          : [];
        const match = existingByNorm.get(normalizeName(sf.Name));

        if (!match) {
          toInsert.push({
            name: sf.Name,
            category: sf.Category__c || "General",
            price: sf.Cost__c || 0,
            duration: sf.Duration__c || 30,
            procedure_notes: sf.Procedure_Notes__c || null,
            recommendations: recs,
            salesforce_id: sf.Id,
          });
          continue;
        }

        // Only fill in currently-empty fields - never overwrite a value a
        // staff member may have edited in-app after the row was created.
        const patch: Record<string, any> = {};
        if (!match.procedure_notes && sf.Procedure_Notes__c) patch.procedure_notes = sf.Procedure_Notes__c;
        if ((!match.recommendations || match.recommendations.length === 0) && recs.length > 0) {
          patch.recommendations = recs;
        }
        if (!match.salesforce_id) {
          patch.salesforce_id = sf.Id;
        } else if (match.salesforce_id !== sf.Id) {
          conflicts.push(sf.Name);
        }

        if (Object.keys(patch).length > 0) toUpdate.push({ id: match.id, patch });
        else unchangedCount++;
      }

      if (toInsert.length > 0) {
        const { error } = await supabase.from("services").upsert(toInsert, { onConflict: "salesforce_id" });
        if (error) throw error;
      }

      let updateErrors = 0;
      for (const { id, patch } of toUpdate) {
        const { error } = await supabase.from("services").update(patch as any).eq("id", id);
        if (error) updateErrors++;
      }
      if (updateErrors > 0 && updateErrors === toUpdate.length) {
        throw new Error(`Failed to update ${updateErrors} service(s)`);
      }

      return {
        total: sfServices.length,
        insertedCount: toInsert.length,
        updatedCount: toUpdate.length - updateErrors,
        unchangedCount,
        conflictCount: conflicts.length,
        stats: data.stats as
          | { from_template: number; from_visits: number; no_content: number }
          | undefined,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      toast.success(
        `Synced from Salesforce: ${data.insertedCount} new, ${data.updatedCount} updated, ${data.unchangedCount} already up to date` +
        (data.conflictCount ? `, ${data.conflictCount} skipped (salesforce_id conflict)` : ""),
        data.stats
          ? {
              description:
                `Notes: ${data.stats.from_template} from Salesforce service templates, ` +
                `${data.stats.from_visits} derived from past visits, ` +
                `${data.stats.no_content} with no content in Salesforce.`,
            }
          : undefined
      );
    },

    onError: (err: Error) => toast.error(err.message),
  });

  const resetForm = () => {
    setName("");
    setCategory("");
    setCustomCategory(false);
    setDuration("");
    setPrice("");
    setHsnCode("");
    setMaterialPercent("");
    setGstPercent("");
    setProblemAreaIds([]);
    setProcedureNotes("");
    setRecommendations("");
    setMedicines([]);
    setAssetLinks([]);
  };

  const addMedicine = () => {
    setMedicines([...medicines, { product_id: "", product_name: "", frequency: "", duration: "", instructions: "" }]);
  };

  const updateMedicine = (index: number, field: keyof MedicineInput, value: string) => {
    const updated = [...medicines];
    const row = { ...updated[index] };
    if (field === "product_id") {
      const prevProd: any = products.find((p: any) => p.id === row.product_id);
      const prod: any = products.find((p: any) => p.id === value);
      row.product_id = value;
      row.product_name = prod?.name || "";
      // Only carry a field forward if it's empty or still matches the
      // previous medicine's autofilled default - a manually typed value is
      // never overwritten, but switching medicines should swap in the new
      // medicine's own defaults instead of leaving the old one's behind.
      const carryOver = (current: string, prevDefault?: string) =>
        !current || current === (prevDefault || "");
      row.frequency = carryOver(row.frequency, prevProd?.default_frequency)
        ? prod?.default_frequency || ""
        : row.frequency;
      row.duration = carryOver(row.duration, prevProd?.default_duration)
        ? prod?.default_duration || ""
        : row.duration;
      row.instructions = carryOver(row.instructions, prevProd?.default_instructions)
        ? prod?.default_instructions || ""
        : row.instructions;
    } else {
      (row[field] as string) = value;
    }
    updated[index] = row;
    setMedicines(updated);
  };

  const removeMedicine = (index: number) => {
    setMedicines(medicines.filter((_, i) => i !== index));
  };

  const addAssetLink = () =>
    setAssetLinks([...assetLinks, { asset_id: "", asset_name: "", usage_guideline: "", time_taken: "" }]);
  const updateAssetLink = (index: number, field: keyof AssetLinkInput, value: string) => {
    const updated = [...assetLinks];
    (updated[index] as any)[field] = value;
    if (field === "asset_id") {
      updated[index].asset_name = allAssets.find((a) => a.id === value)?.name || "";
    }
    setAssetLinks(updated);
  };
  const removeAssetLink = (index: number) =>
    setAssetLinks(assetLinks.filter((_, i) => i !== index));

  const filtered = services.filter((s: any) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === "All" || s.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const getMedicinesForService = (serviceId: string) => {
    return serviceMedicines.filter((sm: any) => sm.service_id === serviceId);
  };

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Service Master</h1>
          <p className="page-subtitle">Manage clinic services, medicines and recommendations</p>
        </div>
        <div className="flex gap-2 w-fit">
        <Button variant="outline" className="gap-2" onClick={() => syncSalesforceeMutation.mutate()} disabled={syncSalesforceeMutation.isPending || isLoading}>
          {syncSalesforceeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
          {syncSalesforceeMutation.isPending ? "Syncing..." : "Sync from Salesforce"}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive" disabled={services.length === 0 || deleteAllMutation.isPending}>
              <Trash2 className="h-4 w-4" /> Delete All
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete all services?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all {services.length} services along with their linked medicines and assets. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteAllMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 w-fit">
              <Plus className="h-4 w-4" />
              Add Service
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">Add New Service</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Service Name *</Label>
                <Input placeholder="e.g. Chemical Peel" className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Category</Label>
                  {customCategory ? (
                    <div className="mt-1.5 flex gap-2">
                      <Input
                        autoFocus
                        placeholder="Type a category"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => { setCustomCategory(false); setCategory(""); }}
                      >
                        List
                      </Button>
                    </div>
                  ) : (
                    <Select
                      value={category}
                      onValueChange={(v) => {
                        if (v === "__custom__") { setCustomCategory(true); setCategory(""); }
                        else setCategory(v);
                      }}
                    >
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        <SelectItem value="__custom__">Other (type your own)…</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div>
                  <Label>Duration (mins)</Label>
                  <Input type="number" placeholder="45" className="mt-1.5" value={duration} onChange={(e) => setDuration(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Price (₹)</Label>
                  <Input type="number" placeholder="3500" className="mt-1.5" value={price} onChange={(e) => setPrice(e.target.value)} />
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
              <div>
                <Label>Primary Concern</Label>
                <div className="mt-1.5 flex flex-wrap gap-2 rounded-md border p-2">
                  {problemAreas.length === 0 && (
                    <p className="text-xs text-muted-foreground">No primary concerns defined yet</p>
                  )}
                  {problemAreas.map((pa: any) => {
                    const active = problemAreaIds.includes(pa.id);
                    return (
                      <button
                        key={pa.id}
                        type="button"
                        onClick={() =>
                          setProblemAreaIds((prev) =>
                            active ? prev.filter((id) => id !== pa.id) : [...prev, pa.id]
                          )
                        }
                        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {pa.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label>Procedure Notes</Label>
                  <div className="flex items-center gap-1">
                    <MicButton value={procedureNotes} onChange={setProcedureNotes} />
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary" onClick={() => elaborate("procedure_notes")} disabled={elaborating !== null}>
                      {elaborating === "procedure_notes" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      Enrich with AI
                    </Button>
                  </div>
                </div>
                <Textarea placeholder="Procedure notes template..." className="mt-1.5" rows={2} value={procedureNotes} onChange={(e) => setProcedureNotes(e.target.value)} />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label>Recommendations (one per line)</Label>
                  <div className="flex items-center gap-1">
                    <MicButton value={recommendations} onChange={setRecommendations} />
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary" onClick={() => elaborate("recommendations")} disabled={elaborating !== null}>
                      {elaborating === "recommendations" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      Enrich with AI
                    </Button>
                  </div>
                </div>
                <Textarea placeholder="Avoid sun exposure 48hrs&#10;Apply moisturizer daily" className="mt-1.5" rows={3} value={recommendations} onChange={(e) => setRecommendations(e.target.value)} />
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
                    <div>
                      <SearchableSelect
                        value={med.product_id}
                        onChange={(v) => updateMedicine(i, "product_id", v)}
                        options={products}
                        placeholder="Select medicine"
                        searchPlaceholder="Search medicines..."
                        emptyText="No medicine found."
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Input placeholder="Frequency" value={med.frequency} onChange={(e) => updateMedicine(i, "frequency", e.target.value)} />
                      <Input placeholder="Duration" value={med.duration} onChange={(e) => updateMedicine(i, "duration", e.target.value)} />
                      <Input placeholder="Special instructions" value={med.instructions} onChange={(e) => updateMedicine(i, "instructions", e.target.value)} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Required Assets */}
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
                    <SearchableSelect
                      value={al.asset_id}
                      onChange={(v) => updateAssetLink(i, "asset_id", v)}
                      options={allAssets}
                      placeholder="Select asset"
                      searchPlaceholder="Search assets..."
                      emptyText="No asset found."
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Usage guideline" value={al.usage_guideline} onChange={(e) => updateAssetLink(i, "usage_guideline", e.target.value)} />
                      <Input type="number" placeholder="Time taken (mins)" value={al.time_taken} onChange={(e) => updateAssetLink(i, "time_taken", e.target.value)} />
                    </div>
                  </div>
                ))}
              </div>

              <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!name || createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : "Create Service"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search services..."
            className="pl-9 bg-card border"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={activeCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveCategory(cat)}
              className="text-xs"
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Loading services...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No services found. Add your first service above.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((service: any, i: number) => {
            const meds = getMedicinesForService(service.id);
            return (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="stat-card group cursor-pointer"
                onClick={() => setSelectedServiceId(service.id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-display font-semibold">{service.name}</h3>
                    <Badge variant="secondary" className="mt-1 text-xs">{service.category}</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setSelectedServiceId(service.id); }}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => e.stopPropagation()}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this service?</AlertDialogTitle>
                          <AlertDialogDescription>
                            "{service.name}" and its linked medicines/assets will be permanently removed.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(service.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {service.procedure_notes && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-muted-foreground">Procedure Notes</p>
                    <p className="text-sm">{service.procedure_notes}</p>
                  </div>
                )}

                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-1.5 text-sm">
                    <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-semibold">₹{Number(service.price).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{service.duration} mins</span>
                  </div>
                </div>

                {service.recommendations && service.recommendations.length > 0 && (
                  <div className="border-t pt-3 mb-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Recommendations</p>
                    <div className="space-y-1">
                      {service.recommendations.map((rec: string, j: number) => (
                        <p key={j} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-primary mt-0.5">•</span>
                          {rec}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {meds.length > 0 && (
                  <div className="border-t pt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Pill className="h-3 w-3" /> Medicines ({meds.length})
                    </p>
                    <div className="space-y-1">
                      {meds.map((m: any) => (
                        <p key={m.id} className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{m.pharma_products?.name || "—"}</span>
                          {m.frequency && ` · ${m.frequency}`}
                          {m.duration && ` · ${m.duration}`}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
      <ServiceDetailSheet serviceId={selectedServiceId} onClose={() => setSelectedServiceId(null)} />
    </div>
  );
};

export default Services;
