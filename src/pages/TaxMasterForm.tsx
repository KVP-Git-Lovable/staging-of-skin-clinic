import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, ChevronsUpDown, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type ProductLink = { product_id: string; is_active: boolean };
type ServiceLink = { service_id: string; is_active: boolean };

const TaxMasterForm = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cgst, setCgst] = useState("");
  const [sgst, setSgst] = useState("");
  const [igst, setIgst] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [productLinks, setProductLinks] = useState<ProductLink[]>([]);
  const [originalActiveProductIds, setOriginalActiveProductIds] = useState<string[]>([]);
  const [serviceLinks, setServiceLinks] = useState<ServiceLink[]>([]);
  const [originalRate, setOriginalRate] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [pickerSpecificOpen, setPickerSpecificOpen] = useState(false);
  const [selectedToUpdate, setSelectedToUpdate] = useState<string[]>([]);

  // Load existing tax + its product links (with is_active)
  const { data: existing, isLoading } = useQuery({
    queryKey: ["tax-master", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax_master" as any)
        .select("*, tax_master_products(product_id, is_active), tax_master_services(service_id, is_active)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  // All products for picker
  const { data: pharmaProducts = [] } = useQuery({
    queryKey: ["pharma-products-for-tax"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pharma_products").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Cross-tax claim map: products already actively mapped to OTHER active tax rates
  const { data: claims = [] } = useQuery({
    queryKey: ["tax-product-claims", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax_master_products" as any)
        .select("product_id, tax_id, is_active, tax_master!inner(id, name, rate, is_active)");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  // All services for picker
  const { data: servicesList = [] } = useQuery({
    queryKey: ["services-for-tax"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Cross-tax claim map for services
  const { data: serviceClaims = [] } = useQuery({
    queryKey: ["tax-service-claims", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax_master_services" as any)
        .select("service_id, tax_id, is_active, tax_master!inner(id, name, rate, is_active)");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const serviceClaimMap = useMemo(() => {
    const m = new Map<string, { taxId: string; taxName: string; rate: number }>();
    serviceClaims.forEach((c: any) => {
      if (!c.is_active) return;
      if (!c.tax_master?.is_active) return;
      if (!isNew && c.tax_id === id) return;
      m.set(c.service_id, {
        taxId: c.tax_id,
        taxName: c.tax_master.name,
        rate: Number(c.tax_master.rate || 0),
      });
    });
    return m;
  }, [serviceClaims, id, isNew]);

  const serviceMap = useMemo(() => {
    const m = new Map<string, string>();
    servicesList.forEach((s: any) => m.set(s.id, s.name));
    return m;
  }, [servicesList]);

  const linkedServiceIds = useMemo(() => new Set(serviceLinks.map((l) => l.service_id)), [serviceLinks]);

  const toggleService = (sid: string) => {
    setServiceLinks((prev) =>
      prev.find((l) => l.service_id === sid)
        ? prev.filter((l) => l.service_id !== sid)
        : [...prev, { service_id: sid, is_active: true }],
    );
  };
  const setServiceLinkActive = (sid: string, active: boolean) => {
    setServiceLinks((prev) => prev.map((l) => (l.service_id === sid ? { ...l, is_active: active } : l)));
  };
  const removeServiceLink = (sid: string) => {
    setServiceLinks((prev) => prev.filter((l) => l.service_id !== sid));
  };

  const claimMap = useMemo(() => {
    const m = new Map<string, { taxId: string; taxName: string; rate: number }>();
    claims.forEach((c: any) => {
      if (!c.is_active) return;
      if (!c.tax_master?.is_active) return;
      if (!isNew && c.tax_id === id) return; // exclude current tax
      m.set(c.product_id, {
        taxId: c.tax_id,
        taxName: c.tax_master.name,
        rate: Number(c.tax_master.rate || 0),
      });
    });
    return m;
  }, [claims, id, isNew]);

  useEffect(() => {
    if (existing) {
      setName(existing.name || "");
      setDescription(existing.description || "");
      setCgst(existing.cgst != null ? String(existing.cgst) : "");
      setSgst(existing.sgst != null ? String(existing.sgst) : "");
      setIgst(existing.igst != null ? String(existing.igst) : "");
      setIsActive(existing.is_active ?? true);
      const links: ProductLink[] = (existing.tax_master_products || [])
        .filter((l: any) => l.product_id)
        .map((l: any) => ({ product_id: l.product_id, is_active: l.is_active ?? true }));
      setProductLinks(links);
      setOriginalActiveProductIds(links.filter((l) => l.is_active).map((l) => l.product_id));
      const sLinks: ServiceLink[] = (existing.tax_master_services || [])
        .filter((l: any) => l.service_id)
        .map((l: any) => ({ service_id: l.service_id, is_active: l.is_active ?? true }));
      setServiceLinks(sLinks);
      setOriginalRate(Number(existing.rate || 0));
    }
  }, [existing]);

  const cgstNum = parseFloat(cgst) || 0;
  const sgstNum = parseFloat(sgst) || 0;
  const igstNum = parseFloat(igst) || 0;
  const totalRate = cgstNum + sgstNum + igstNum;
  const rateChanged = !isNew && Math.abs(totalRate - originalRate) > 0.001;

  const productMap = useMemo(() => {
    const m = new Map<string, string>();
    pharmaProducts.forEach((p: any) => m.set(p.id, p.name));
    return m;
  }, [pharmaProducts]);

  const linkedIds = useMemo(() => new Set(productLinks.map((l) => l.product_id)), [productLinks]);

  const toggleProduct = (pid: string) => {
    setProductLinks((prev) =>
      prev.find((l) => l.product_id === pid)
        ? prev.filter((l) => l.product_id !== pid)
        : [...prev, { product_id: pid, is_active: true }],
    );
  };

  const setLinkActive = (pid: string, active: boolean) => {
    setProductLinks((prev) => prev.map((l) => (l.product_id === pid ? { ...l, is_active: active } : l)));
  };

  const removeLink = (pid: string) => {
    setProductLinks((prev) => prev.filter((l) => l.product_id !== pid));
  };

  const performSave = async (updateProductIds: string[] | null) => {
    setSaving(true);
    try {
      const payload: any = {
        name,
        cgst: cgstNum,
        sgst: sgstNum,
        igst: igstNum,
        rate: totalRate,
        description: description || null,
        is_active: isActive,
      };

      const activeLinkIds = productLinks.filter((l) => l.is_active).map((l) => l.product_id);

      if (isNew) {
        const { data: inserted, error } = await supabase.from("tax_master" as any).insert(payload).select().single();
        if (error) throw error;
        const newTaxId = (inserted as any).id;
        if (productLinks.length > 0) {
          const links = productLinks.map((l) => ({ tax_id: newTaxId, product_id: l.product_id, is_active: l.is_active }));
          const { error: linkErr } = await supabase.from("tax_master_products" as any).insert(links);
          if (linkErr) throw linkErr;
          if (activeLinkIds.length > 0) {
            await supabase.from("pharma_products").update({ gst_percent: totalRate }).in("id", activeLinkIds);
          }
        }
        if (serviceLinks.length > 0) {
          const sLinks = serviceLinks.map((l) => ({ tax_id: newTaxId, service_id: l.service_id, is_active: l.is_active }));
          const { error: sErr } = await supabase.from("tax_master_services" as any).insert(sLinks);
          if (sErr) throw sErr;
        }
        toast.success("Tax rate created");
      } else if (rateChanged && originalActiveProductIds.length > 0 && updateProductIds !== null) {
        // Versioning path
        const { error: deactErr } = await supabase
          .from("tax_master" as any)
          .update({ is_active: false })
          .eq("id", id);
        if (deactErr) throw deactErr;

        const { data: inserted, error: insErr } = await supabase
          .from("tax_master" as any)
          .insert(payload)
          .select()
          .single();
        if (insErr) throw insErr;
        const newTaxId = (inserted as any).id;

        if (updateProductIds.length > 0) {
          const { error: delErr } = await supabase
            .from("tax_master_products" as any)
            .delete()
            .eq("tax_id", id)
            .in("product_id", updateProductIds);
          if (delErr) throw delErr;
          const links = updateProductIds.map((pid) => ({ tax_id: newTaxId, product_id: pid, is_active: true }));
          const { error: linkErr } = await supabase.from("tax_master_products" as any).insert(links);
          if (linkErr) throw linkErr;
          await supabase.from("pharma_products").update({ gst_percent: totalRate }).in("id", updateProductIds);
        }
        // Carry service links to new tax version (active ones move; inactive stay archived on old)
        const activeServiceIds = serviceLinks.filter((l) => l.is_active).map((l) => l.service_id);
        if (activeServiceIds.length > 0) {
          await supabase.from("tax_master_services" as any).delete().eq("tax_id", id).in("service_id", activeServiceIds);
          const sLinks = activeServiceIds.map((sid) => ({ tax_id: newTaxId, service_id: sid, is_active: true }));
          const { error: sErr } = await supabase.from("tax_master_services" as any).insert(sLinks);
          if (sErr) throw sErr;
        }
        toast.success("New tax version created. Previous version archived.");
      } else {
        // In-place update + sync links (preserves is_active flag per row)
        const { error } = await supabase.from("tax_master" as any).update(payload).eq("id", id);
        if (error) throw error;
        const { error: delErr } = await supabase.from("tax_master_products" as any).delete().eq("tax_id", id);
        if (delErr) throw delErr;
        if (productLinks.length > 0) {
          const links = productLinks.map((l) => ({ tax_id: id!, product_id: l.product_id, is_active: l.is_active }));
          const { error: linkErr } = await supabase.from("tax_master_products" as any).insert(links);
          if (linkErr) throw linkErr;
          if (rateChanged && activeLinkIds.length > 0) {
            await supabase.from("pharma_products").update({ gst_percent: totalRate }).in("id", activeLinkIds);
          }
        }
        // Sync service links
        const { error: sDelErr } = await supabase.from("tax_master_services" as any).delete().eq("tax_id", id);
        if (sDelErr) throw sDelErr;
        if (serviceLinks.length > 0) {
          const sLinks = serviceLinks.map((l) => ({ tax_id: id!, service_id: l.service_id, is_active: l.is_active }));
          const { error: sErr } = await supabase.from("tax_master_services" as any).insert(sLinks);
          if (sErr) throw sErr;
        }
        toast.success("Tax rate updated");
      }

      queryClient.invalidateQueries({ queryKey: ["tax-master"] });
      queryClient.invalidateQueries({ queryKey: ["pharma-products-for-tax"] });
      queryClient.invalidateQueries({ queryKey: ["tax-product-claims"] });
      queryClient.invalidateQueries({ queryKey: ["services-for-tax"] });
      queryClient.invalidateQueries({ queryKey: ["tax-service-claims"] });
      queryClient.invalidateQueries({ queryKey: ["tax-master-services-active"] });
      navigate("/settings?tab=tax");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
      setWarningOpen(false);
      setPickerSpecificOpen(false);
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Tax name is required");
      return;
    }
    if (!isNew && rateChanged && originalActiveProductIds.length > 0) {
      setSelectedToUpdate(originalActiveProductIds);
      setWarningOpen(true);
      return;
    }
    performSave(null);
  };

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings?tab=tax")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-display font-semibold truncate">
              {isNew ? "New Tax Rate" : "Edit Tax Rate"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Define tax components and map to products and services
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid gap-6 lg:grid-cols-3"
      >
        {/* Main form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border bg-card p-6 space-y-5">
            <div>
              <Label>Tax Name *</Label>
              <Input
                className="mt-1.5"
                placeholder="e.g. GST 18%"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                className="mt-1.5"
                placeholder="Optional description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>CGST (%)</Label>
                <Input type="number" step="0.01" className="mt-1.5" placeholder="0" value={cgst} onChange={(e) => setCgst(e.target.value)} />
              </div>
              <div>
                <Label>SGST (%)</Label>
                <Input type="number" step="0.01" className="mt-1.5" placeholder="0" value={sgst} onChange={(e) => setSgst(e.target.value)} />
              </div>
              <div>
                <Label>IGST (%)</Label>
                <Input type="number" step="0.01" className="mt-1.5" placeholder="0" value={igst} onChange={(e) => setIgst(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
              <span className="text-sm text-muted-foreground">Total Rate</span>
              <span className="text-lg font-semibold">{totalRate.toFixed(2)}%</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div>
                <Label className="cursor-pointer">Active</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Inactive rates are preserved for history</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
        </div>

        {/* Mapped products */}
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div>
              <h3 className="font-display font-semibold">Mapped Products</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Toggle inactive to free a product for another tax rate
              </p>
            </div>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {productLinks.length > 0 ? `${productLinks.length} product(s) selected` : "Add products..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search products..." />
                  <CommandList>
                    <CommandEmpty>No products found.</CommandEmpty>
                    <CommandGroup>
                      {pharmaProducts.map((p: any) => {
                        const checked = linkedIds.has(p.id);
                        const claim = claimMap.get(p.id);
                        const disabled = !!claim && !checked;

                        const item = (
                          <CommandItem
                            key={p.id}
                            value={p.name}
                            disabled={disabled}
                            onSelect={() => {
                              if (disabled) return;
                              toggleProduct(p.id);
                            }}
                            className={cn(disabled && "opacity-50 cursor-not-allowed")}
                          >
                            <Check className={cn("mr-2 h-4 w-4", checked ? "opacity-100" : "opacity-0")} />
                            <span className="flex-1">{p.name}</span>
                            {claim && (
                              <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                                {claim.taxName}
                              </span>
                            )}
                          </CommandItem>
                        );

                        if (disabled) {
                          return (
                            <Tooltip key={p.id}>
                              <TooltipTrigger asChild>
                                <div>{item}</div>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                Already mapped to {claim!.taxName} {claim!.rate}% — deactivate there first
                              </TooltipContent>
                            </Tooltip>
                          );
                        }
                        return item;
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {productLinks.length > 0 && (
              <div className="space-y-1.5">
                {productLinks.map((l) => (
                  <div
                    key={l.product_id}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg border px-3 py-2",
                      !l.is_active && "opacity-60 bg-muted/40",
                    )}
                  >
                    <span className={cn("text-sm flex-1 truncate", !l.is_active && "line-through")}>
                      {productMap.get(l.product_id) || l.product_id}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <Switch
                              checked={l.is_active}
                              onCheckedChange={(v) => setLinkActive(l.product_id, v)}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {l.is_active ? "Active — used for billing" : "Inactive — available for other tax rates"}
                        </TooltipContent>
                      </Tooltip>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeLink(l.product_id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mapped Services */}
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div>
              <h3 className="font-display font-semibold">Mapped Services</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Toggle inactive to free a service for another tax rate
              </p>
            </div>
            <Popover open={servicePickerOpen} onOpenChange={setServicePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {serviceLinks.length > 0 ? `${serviceLinks.length} service(s) selected` : "Add services..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search services..." />
                  <CommandList>
                    <CommandEmpty>No services found.</CommandEmpty>
                    <CommandGroup>
                      {servicesList.map((s: any) => {
                        const checked = linkedServiceIds.has(s.id);
                        const claim = serviceClaimMap.get(s.id);
                        const disabled = !!claim && !checked;

                        const item = (
                          <CommandItem
                            key={s.id}
                            value={s.name}
                            disabled={disabled}
                            onSelect={() => {
                              if (disabled) return;
                              toggleService(s.id);
                            }}
                            className={cn(disabled && "opacity-50 cursor-not-allowed")}
                          >
                            <Check className={cn("mr-2 h-4 w-4", checked ? "opacity-100" : "opacity-0")} />
                            <span className="flex-1">{s.name}</span>
                            {claim && (
                              <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                                {claim.taxName}
                              </span>
                            )}
                          </CommandItem>
                        );

                        if (disabled) {
                          return (
                            <Tooltip key={s.id}>
                              <TooltipTrigger asChild>
                                <div>{item}</div>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                Already mapped to {claim!.taxName} {claim!.rate}% — deactivate there first
                              </TooltipContent>
                            </Tooltip>
                          );
                        }
                        return item;
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {serviceLinks.length > 0 && (
              <div className="space-y-1.5">
                {serviceLinks.map((l) => (
                  <div
                    key={l.service_id}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg border px-3 py-2",
                      !l.is_active && "opacity-60 bg-muted/40",
                    )}
                  >
                    <span className={cn("text-sm flex-1 truncate", !l.is_active && "line-through")}>
                      {serviceMap.get(l.service_id) || l.service_id}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <Switch
                              checked={l.is_active}
                              onCheckedChange={(v) => setServiceLinkActive(l.service_id, v)}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {l.is_active ? "Active — used for billing" : "Inactive — available for other tax rates"}
                        </TooltipContent>
                      </Tooltip>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeServiceLink(l.service_id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Versioning warning dialog */}
      <AlertDialog open={warningOpen} onOpenChange={setWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tax rate change detected</AlertDialogTitle>
            <AlertDialogDescription>
              This will affect all mapped products. The previous tax version will be archived; old invoices keep their original tax. Choose how to apply the new rate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setWarningOpen(false);
                setSelectedToUpdate(originalActiveProductIds);
                setPickerSpecificOpen(true);
              }}
            >
              Update Specific
            </Button>
            <AlertDialogAction onClick={() => performSave(originalActiveProductIds)}>
              Update All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Specific product checklist dialog */}
      <AlertDialog open={pickerSpecificOpen} onOpenChange={setPickerSpecificOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Select products to update</AlertDialogTitle>
            <AlertDialogDescription>
              Only checked products will receive the new rate. Unchecked products remain on the previous (archived) rate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-72 overflow-y-auto space-y-2 py-2">
            {originalActiveProductIds.map((pid) => {
              const checked = selectedToUpdate.includes(pid);
              return (
                <label
                  key={pid}
                  className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-accent"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      setSelectedToUpdate((prev) =>
                        v ? [...prev, pid] : prev.filter((x) => x !== pid),
                      );
                    }}
                  />
                  <span className="text-sm">{productMap.get(pid) || pid}</span>
                </label>
              );
            })}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => performSave(selectedToUpdate)}>
              Apply to {selectedToUpdate.length} product(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
};

export default TaxMasterForm;
