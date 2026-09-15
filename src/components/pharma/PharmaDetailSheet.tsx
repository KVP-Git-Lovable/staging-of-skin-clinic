import { formatMoney } from "@/lib/currency";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { VendorCombobox } from "@/components/shared/VendorCombobox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash2, Copy, Plus, Check, X, AlertTriangle, Package, PackagePlus, Stethoscope, ShoppingBag, TrendingUp, DollarSign, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { moveToTrash } from "@/lib/trash";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatProductUnit } from "@/lib/unitDisplay";
import { getUomOptions, getSaleUom, toUomQty, fmtQty, type UomOption } from "@/lib/uom";
import { getActiveBatchPrice } from "@/lib/productPricing";
import { UnitConversionsEditor, syncProductUnits, type ConversionRow } from "@/components/pharma/UnitConversionsEditor";
import { useProductUnits } from "@/hooks/usePharmaProductUnits";
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

// ─── Product Detail ──────────────────────────────────────
export function ProductDetailSheet({ productId, onClose, onClone, onAddStock }: { productId: string | null; onClose: () => void; onClone?: (product: any) => void; onAddStock?: (productId: string) => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [summaryUom, setSummaryUom] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState<any>({});
  const [editConversions, setEditConversions] = useState<ConversionRow[]>([]);
  const [priceForm, setPriceForm] = useState({ mrp: 0, selling_price: 0, purchase_price: 0, gst_percent: 0, notes: "", effective_from: new Date().toISOString().split("T")[0] });
  const [showPriceForm, setShowPriceForm] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [showClinicSales, setShowClinicSales] = useState(false);
  const [showPortalSales, setShowPortalSales] = useState(false);

  const { data: product } = useQuery({
    queryKey: ["pharma-product", productId],
    queryFn: async () => {
      if (!productId) return null;
      const { data, error } = await supabase.from("pharma_products").select("*").eq("id", productId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!productId,
  });

  const { data: prices = [] } = useQuery({
    queryKey: ["product-prices", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await supabase.from("product_prices").select("*").eq("product_id", productId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!productId,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: unitMaster = [] } = useQuery({
    queryKey: ["unit-master"],
    queryFn: async () => {
      const { data, error } = await supabase.from("unit_master").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ["product-inventory-stock", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await supabase.from("pharma_inventory").select("*").eq("product_id", productId).order("expiry_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!productId,
  });

  const { data: prescriptionItems = [] } = useQuery({
    queryKey: ["product-prescription-consumed", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await supabase.from("prescriptions").select("quantity, created_at, procedure_id").eq("product_id", productId);
      if (error) throw error;
      // Fetch procedure+patient details for each prescription
      const procedureIds = [...new Set((data || []).map((p: any) => p.procedure_id).filter(Boolean))];
      let procedureMap: Record<string, any> = {};
      if (procedureIds.length > 0) {
        const { data: procs } = await supabase.from("procedures").select("id, patient_id, procedure_date").in("id", procedureIds);
        const patientIds = [...new Set((procs || []).map((p: any) => p.patient_id).filter(Boolean))];
        let patientMap: Record<string, string> = {};
        if (patientIds.length > 0) {
          const { data: patients } = await supabase.from("patients").select("id, first_name, last_name").in("id", patientIds);
          (patients || []).forEach((p: any) => { patientMap[p.id] = `${p.first_name} ${p.last_name}`; });
        }
        (procs || []).forEach((p: any) => { procedureMap[p.id] = { ...p, patient_name: patientMap[p.patient_id] || "Unknown" }; });
      }
      return (data || []).map((item: any) => ({
        ...item,
        patient_name: item.procedure_id ? (procedureMap[item.procedure_id]?.patient_name || "Unknown") : "Unknown",
        date: item.procedure_id ? (procedureMap[item.procedure_id]?.procedure_date || item.created_at) : item.created_at,
      }));
    },
    enabled: !!productId,
  });

  const { data: portalSalesItems = [] } = useQuery({
    queryKey: ["product-portal-sales", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await supabase.from("portal_order_items").select("quantity, total_price, unit_price, order_id").eq("product_id", productId);
      if (error) throw error;
      const orderIds = [...new Set((data || []).map((i: any) => i.order_id).filter(Boolean))];
      let orderMap: Record<string, any> = {};
      if (orderIds.length > 0) {
        const { data: orders } = await supabase.from("portal_orders").select("id, patient_name, created_at").in("id", orderIds);
        (orders || []).forEach((o: any) => { orderMap[o.id] = o; });
      }
      return (data || []).map((item: any) => ({
        ...item,
        patient_name: orderMap[item.order_id]?.patient_name || "Unknown",
        date: orderMap[item.order_id]?.created_at || "",
      }));
    },
    enabled: !!productId,
  });

  const { data: existingUnits = [] } = useProductUnits(productId);

  useEffect(() => {
    if (product) setForm({ ...product });
  }, [product]);

  useEffect(() => {
    if (isEditing) {
      setEditConversions(
        (existingUnits || []).map((u: any, i: number) => ({
          id: u.id,
          sub_unit: u.sub_unit,
          conversion_value: Number(u.conversion_value) || 1,
          is_active: !!u.is_active,
          is_default: !!u.is_default,
          sort_order: u.sort_order ?? i,
        })),
      );
    }
  }, [isEditing, existingUnits]);

  const updateProduct = useMutation({
    mutationFn: async () => {
      const { id, created_at, updated_at, ...rest } = form;
      // Mirror default active conversion to legacy columns for backward compat.
      const def = editConversions.find((r) => r.is_active && r.is_default)
        || editConversions.find((r) => r.is_active)
        || null;
      const payload = {
        ...rest,
        sub_unit: def?.sub_unit || null,
        conversion_value: def ? Number(def.conversion_value) || 1 : 1,
        qty_per_unit: def ? Number(def.conversion_value) || 1 : 1,
      };
      const { error } = await supabase.from("pharma_products").update(payload).eq("id", productId!);
      if (error) throw error;
      await syncProductUnits(supabase, productId!, editConversions);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pharma-products"] });
      queryClient.invalidateQueries({ queryKey: ["pharma-product", productId] });
      queryClient.invalidateQueries({ queryKey: ["pharma-product-units"] });
      toast.success("Product updated");
      setIsEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteProduct = useMutation({
    mutationFn: async () => {
      const error: any = await moveToTrash("pharma_products", productId!).then(() => null).catch((e: any) => e);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pharma-products"] });
      toast.success("Product deleted");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addPrice = useMutation({
    mutationFn: async () => {
      // Deactivate existing active prices
      await supabase.from("product_prices").update({ is_active: false, effective_to: new Date().toISOString() }).eq("product_id", productId!).eq("is_active", true);
      // Insert new active price with gst_percent
      const { error } = await supabase.from("product_prices").insert({
        product_id: productId!,
        mrp: priceForm.mrp,
        selling_price: priceForm.selling_price,
        purchase_price: priceForm.purchase_price,
        gst_percent: priceForm.gst_percent,
        notes: priceForm.notes,
        effective_from: priceForm.effective_from,
        is_active: true,
      } as any);
      if (error) throw error;
      // Update the product's current MRP, selling_price and gst_percent
      await supabase.from("pharma_products").update({
        mrp: priceForm.mrp,
        selling_price: priceForm.selling_price,
        gst_percent: priceForm.gst_percent,
      }).eq("id", productId!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-prices", productId] });
      queryClient.invalidateQueries({ queryKey: ["pharma-products"] });
      queryClient.invalidateQueries({ queryKey: ["pharma-product", productId] });
      toast.success("Price updated — previous prices preserved");
      setShowPriceForm(false);
      setPriceForm({ mrp: 0, selling_price: 0, purchase_price: 0, gst_percent: 0, notes: "", effective_from: new Date().toISOString().split("T")[0] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!product) return null;

  const Field = ({ label, value }: { label: string; value: any }) => (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );

  return (
    <>
      <Sheet open={!!productId} onOpenChange={() => onClose()}>
        <SheetContent className="w-screen max-w-none sm:max-w-none overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display flex items-center justify-between pr-8">
              {isEditing ? "Edit Product" : product.name}
            </SheetTitle>
          </SheetHeader>

          {!isEditing ? (
            <div className="mt-4 space-y-6">
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => { onAddStock?.(productId!); onClose(); }}><PackagePlus className="h-3 w-3 mr-1" />Inward Stock</Button>
                <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
                <Button size="sm" variant="outline" onClick={() => { onClone?.(product); onClose(); }}><Copy className="h-3 w-3 mr-1" />Clone</Button>
                <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
              </div>

              {/* Product Image */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Product Image</p>
                {(product as any).image_url ? (
                  <div className="relative group">
                    <img src={(product as any).image_url} alt={product.name} className="w-full h-40 object-cover rounded-lg border" />
                    <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg cursor-pointer">
                      <span className="text-white text-xs font-medium">Change Image</span>
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const ext = file.name.split(".").pop();
                        const path = `${productId}/${Date.now()}.${ext}`;
                        const { error: uploadErr } = await supabase.storage.from("product-images").upload(path, file);
                        if (uploadErr) { toast.error("Upload failed"); return; }
                        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
                        await supabase.from("pharma_products").update({ image_url: urlData.publicUrl } as any).eq("id", productId!);
                        queryClient.invalidateQueries({ queryKey: ["pharma-product", productId] });
                        queryClient.invalidateQueries({ queryKey: ["pharma-products"] });
                        queryClient.invalidateQueries({ queryKey: ["shop-products"] });
                        toast.success("Image updated");
                      }} />
                    </label>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                    <Plus className="h-6 w-6 text-muted-foreground mb-1" />
                    <span className="text-xs text-muted-foreground">Upload product image</span>
                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const ext = file.name.split(".").pop();
                      const path = `${productId}/${Date.now()}.${ext}`;
                      const { error: uploadErr } = await supabase.storage.from("product-images").upload(path, file);
                      if (uploadErr) { toast.error("Upload failed"); return; }
                      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
                      await supabase.from("pharma_products").update({ image_url: urlData.publicUrl } as any).eq("id", productId!);
                      queryClient.invalidateQueries({ queryKey: ["pharma-product", productId] });
                      queryClient.invalidateQueries({ queryKey: ["pharma-products"] });
                      queryClient.invalidateQueries({ queryKey: ["shop-products"] });
                      toast.success("Image uploaded");
                    }} />
                  </label>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Name" value={product.name} />
                <Field label="Generic Name" value={product.generic_name} />
                <Field label="Category" value={product.category} />
                <Field label="Unit" value={formatProductUnit(product, existingUnits as any)} />
                <Field label="Manufacturer" value={product.manufacturer} />
                <Field label="HSN Code" value={product.hsn_code} />
                <Field label="Reorder Level" value={product.reorder_level} />
              </div>

              {/* Inventory Summary */}
              {(() => {
                const totalStock = inventoryItems.reduce((sum, item) => sum + Number(item.quantity), 0);
                const consumedStock = prescriptionItems.reduce((sum, item) => sum + Number(item.quantity), 0);
                const availableStock = Math.max(0, totalStock - consumedStock);
                const isLowStock = availableStock > 0 && availableStock <= (product.reorder_level || 0);
                const noStockAdded = totalStock === 0 && consumedStock > 0;
                const uomOpts = getUomOptions(product, existingUnits as any);
                const selUom: UomOption =
                  uomOpts.find((o) => o.name === summaryUom) || getSaleUom(product, existingUnits as any);
                const conv = (n: number) => fmtQty(toUomQty(n, selUom.factor));
                // Find nearest expiry from inventory batches
                const nearestExpiry = inventoryItems.length > 0
                  ? inventoryItems.reduce((nearest: any, item: any) => {
                      if (!nearest || new Date(item.expiry_date) < new Date(nearest.expiry_date)) return item;
                      return nearest;
                    }, null)
                  : null;
                const nearestExpiryDays = nearestExpiry ? Math.ceil((new Date(nearestExpiry.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display font-semibold text-sm">Inventory Summary</h3>
                      <Select value={selUom.name} onValueChange={(v) => setSummaryUom(v)}>
                        <SelectTrigger className="h-7 w-[150px] text-xs">
                          <SelectValue placeholder="UOM" />
                        </SelectTrigger>
                        <SelectContent>
                          {uomOpts.map((o) => (
                            <SelectItem key={o.name} value={o.name} className="text-xs">
                              {o.name}{o.isBase ? " (Base)" : ""}
                              {product.sale_unit === o.name && !o.isBase ? " · Sell" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {noStockAdded && (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3">
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">No opening stock added</p>
                          <p className="text-xs text-amber-700 dark:text-amber-400">Prescriptions have been created for this product but no stock has been added yet. Please add opening stock via Inward Stock.</p>
                        </div>
                      </div>
                    )}
                    <div className={`grid ${nearestExpiry ? "grid-cols-3" : "grid-cols-2"} gap-3`}>
                      <div className="rounded-lg border bg-muted/30 p-3 text-center">
                        <Package className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                        <p className="text-xs text-muted-foreground">Total Stock</p>
                        <p className="text-xl font-bold">{conv(totalStock)}</p>
                        <p className="text-[10px] text-muted-foreground">{selUom.name}</p>
                      </div>
                      <div className={`rounded-lg border p-3 text-center ${isLowStock || availableStock === 0 ? "border-destructive bg-destructive/10" : "bg-muted/30"}`}>
                        {isLowStock || availableStock === 0 ? <AlertTriangle className="h-4 w-4 mx-auto text-destructive mb-1" /> : <Package className="h-4 w-4 mx-auto text-muted-foreground mb-1" />}
                        <p className="text-xs text-muted-foreground">Available Stock</p>
                        <p className={`text-xl font-bold ${isLowStock || availableStock === 0 ? "text-destructive" : ""}`}>{conv(availableStock)}</p>
                        <p className="text-[10px] text-muted-foreground">{selUom.name}</p>
                        {isLowStock && <Badge variant="destructive" className="text-[10px] mt-1">Low Stock</Badge>}
                        {availableStock === 0 && <Badge variant="destructive" className="text-[10px] mt-1">Out of Stock</Badge>}
                      </div>
                      {nearestExpiry && (
                        <div className={`rounded-lg border p-3 text-center ${nearestExpiryDays !== null && nearestExpiryDays <= 90 ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "bg-muted/30"}`}>
                          <AlertTriangle className={`h-4 w-4 mx-auto mb-1 ${nearestExpiryDays !== null && nearestExpiryDays <= 0 ? "text-destructive" : nearestExpiryDays !== null && nearestExpiryDays <= 90 ? "text-amber-600" : "text-muted-foreground"}`} />
                          <p className="text-xs text-muted-foreground">Nearest Expiry</p>
                          <p className="text-sm font-bold">{format(new Date(nearestExpiry.expiry_date), "dd MMM yyyy")}</p>
                          {nearestExpiryDays !== null && nearestExpiryDays <= 0 && <Badge variant="destructive" className="text-[10px] mt-1">Expired</Badge>}
                          {nearestExpiryDays !== null && nearestExpiryDays > 0 && nearestExpiryDays <= 90 && <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] mt-1">Expiring Soon</Badge>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              {(() => {
                const resolved = getActiveBatchPrice(product, inventoryItems as any);
                return (
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                    <h3 className="font-display font-semibold text-sm mb-2">Current Pricing (Latest Batch)</h3>
                    {!resolved.hasBatch && resolved.mrp === 0 ? (
                      <p className="text-xs text-muted-foreground">No active batch — add Inward Stock to set pricing.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="MRP" value={`₹${resolved.mrp.toFixed(2)}`} />
                        <Field label="Selling Price" value={`₹${resolved.sellingPrice.toFixed(2)}`} />
                        <Field label="GST %" value={product.gst_percent ? `${product.gst_percent}%` : "—"} />
                        {resolved.subUnitPrice && (
                          <Field label={`Per ${resolved.subUnit}`} value={`₹${resolved.subUnitPrice.toFixed(2)}`} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}




              {/* Purchase Info */}
              {(() => {
              const saleUom = getSaleUom(product, existingUnits as any);
              const f = Number(saleUom.factor) || 1;
              const perUom = (v: number) => Number(v || 0) / f;
              return (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display font-semibold text-sm">Purchase Info</h3>
                  <span className="text-[11px] text-muted-foreground">Shown per Selling UOM: {saleUom.name}</span>
                </div>
                {inventoryItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No purchase batches recorded yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Batch</TableHead>
                          <TableHead className="text-xs">Supplier</TableHead>
                          <TableHead className="text-xs">Qty ({saleUom.name})</TableHead>
                          <TableHead className="text-xs">Buy ₹/{saleUom.name}</TableHead>
                          <TableHead className="text-xs">MRP ₹/{saleUom.name}</TableHead>
                          <TableHead className="text-xs">Sell ₹/{saleUom.name}</TableHead>
                          <TableHead className="text-xs">GST%</TableHead>
                          <TableHead className="text-xs">Expiry</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inventoryItems.map((inv: any) => {
                          const daysLeft = Math.ceil((new Date(inv.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                          const isExpired = daysLeft <= 0;
                          const isLow = !isExpired && Number(inv.quantity) > 0 && Number(inv.quantity) < 10;
                          const supplierName = (() => {
                            if (!inv.supplier) return "—";
                            const vendor = vendors.find((v: any) => v.id === inv.supplier);
                            return vendor ? vendor.name : inv.supplier;
                          })();
                          return (
                            <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedBatch({ ...inv, supplierName, product })}>
                              <TableCell className="text-xs">{format(new Date(inv.received_date), "dd MMM yyyy")}</TableCell>
                              <TableCell className="text-xs">{inv.batch_number}</TableCell>
                              <TableCell className="text-xs">{supplierName}</TableCell>
                              <TableCell className="text-xs">{fmtQty(toUomQty(Number(inv.quantity), f))}</TableCell>
                              <TableCell className="text-xs">₹{perUom(Number(inv.purchase_price)).toFixed(2)}</TableCell>
                              <TableCell className="text-xs">₹{perUom(Number(inv.mrp || 0)).toFixed(2)}</TableCell>
                              <TableCell className="text-xs">₹{perUom(Number(inv.selling_price || inv.mrp || 0)).toFixed(2)}</TableCell>
                              <TableCell className="text-xs">{product.gst_percent ? `${product.gst_percent}%` : "—"}</TableCell>
                              <TableCell className="text-xs">{format(new Date(inv.expiry_date), "dd MMM yyyy")}</TableCell>
                              <TableCell>
                                {isExpired ? <Badge variant="destructive" className="text-[10px]">Expired</Badge>
                                  : isLow ? <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">Low Stock</Badge>
                                  : <Badge className="bg-success/20 text-success border-success/30 text-[10px]">Active</Badge>}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
              );
              })()}

              {/* Batch Detail Modal */}
              <Dialog open={!!selectedBatch} onOpenChange={(open) => !open && setSelectedBatch(null)}>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle className="font-display">Batch Details</DialogTitle></DialogHeader>
                  {selectedBatch && (() => {
                    const daysLeft = Math.ceil((new Date(selectedBatch.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    const isExpired = daysLeft <= 0;
                    const isLow = !isExpired && Number(selectedBatch.quantity) > 0 && Number(selectedBatch.quantity) < 10;
                    return (
                      <div className="space-y-4 pt-2">
                        <div className="flex justify-end">
                          {isExpired ? <Badge variant="destructive">Expired</Badge>
                            : isLow ? <Badge className="bg-amber-100 text-amber-800 border-amber-300">Low Stock</Badge>
                            : <Badge className="bg-success/20 text-success border-success/30">Active</Badge>}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <Field label="Received Date" value={format(new Date(selectedBatch.received_date), "dd MMM yyyy")} />
                          <Field label="Batch Number" value={selectedBatch.batch_number} />
                          <Field label="Supplier" value={selectedBatch.supplierName} />
                          <Field label="Quantity" value={selectedBatch.quantity} />
                          <Field label="Buy Price" value={`₹${Number(selectedBatch.purchase_price).toFixed(2)}`} />
                          <Field label="MRP" value={`₹${Number(selectedBatch.mrp || 0).toFixed(2)}`} />
                          <Field label="Selling Price" value={`₹${Number(selectedBatch.selling_price || selectedBatch.mrp || 0).toFixed(2)}`} />
                          <Field label="GST %" value={selectedBatch.product?.gst_percent ? `${selectedBatch.product.gst_percent}%` : "—"} />
                          <Field label="Expiry Date" value={format(new Date(selectedBatch.expiry_date), "dd MMM yyyy")} />
                          <Field label="Invoice Number" value={selectedBatch.invoice_number} />
                        </div>
                      </div>
                    );
                  })()}
                </DialogContent>
              </Dialog>

              <Separator />

              {/* Sales Info */}
              {(() => {
                const clinicUnits = prescriptionItems.reduce((sum, item) => sum + Number(item.quantity), 0);
                const sellingPrice = Number(product.selling_price) || 0;
                const clinicRevenue = clinicUnits * sellingPrice;
                const portalUnits = portalSalesItems.reduce((sum, item) => sum + Number(item.quantity), 0);
                const portalRevenue = portalSalesItems.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
                const totalUnits = clinicUnits + portalUnits;
                const totalRevenue = clinicRevenue + portalRevenue;
                return (
                  <div className="space-y-3">
                    <h3 className="font-display font-semibold text-sm">Sales Info</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border bg-muted/30 p-3 text-center">
                        <TrendingUp className="h-4 w-4 mx-auto text-primary mb-1" />
                        <p className="text-xs text-muted-foreground">Total Units Sold</p>
                        <p className="text-xl font-bold">{totalUnits}</p>
                      </div>
                      <div className="rounded-lg border bg-muted/30 p-3 text-center">
                        <DollarSign className="h-4 w-4 mx-auto text-success mb-1" />
                        <p className="text-xs text-muted-foreground">Total Revenue</p>
                        <p className="text-xl font-bold">{formatMoney(totalRevenue)}</p>
                        {sellingPrice === 0 && clinicUnits > 0 && (
                          <p className="text-[10px] text-amber-600 mt-1">Clinic revenue estimated at ₹0 — selling price not set</p>
                        )}
                      </div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Source</TableHead>
                          <TableHead className="text-xs text-right">Units Sold</TableHead>
                          <TableHead className="text-xs text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setShowClinicSales(true)}>
                          <TableCell className="text-xs"><span className="inline-flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5 text-primary" />Clinic Procedures <Eye className="h-3 w-3 text-muted-foreground" /></span></TableCell>
                          <TableCell className="text-xs text-right">{clinicUnits}</TableCell>
                          <TableCell className="text-xs text-right">{formatMoney(clinicRevenue)}</TableCell>
                        </TableRow>
                        <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setShowPortalSales(true)}>
                          <TableCell className="text-xs"><span className="inline-flex items-center gap-1.5"><ShoppingBag className="h-3.5 w-3.5 text-accent-foreground" />Portal Orders <Eye className="h-3 w-3 text-muted-foreground" /></span></TableCell>
                          <TableCell className="text-xs text-right">{portalUnits}</TableCell>
                          <TableCell className="text-xs text-right">{formatMoney(portalRevenue)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                );
              })()}

              {/* Clinic Sales Drill-down */}
              <Dialog open={showClinicSales} onOpenChange={setShowClinicSales}>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle className="font-display">Clinic Procedure Sales</DialogTitle></DialogHeader>
                  {prescriptionItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No clinic sales recorded</p>
                  ) : (
                    <div className="max-h-80 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Patient</TableHead>
                            <TableHead className="text-xs">Date</TableHead>
                            <TableHead className="text-xs text-right">Qty</TableHead>
                            <TableHead className="text-xs text-right">Sell Price</TableHead>
                            <TableHead className="text-xs text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {prescriptionItems.map((item: any, idx: number) => {
                            const sp = Number(product?.selling_price) || 0;
                            const qty = Number(item.quantity);
                            return (
                              <TableRow
                                key={idx}
                                className={item.procedure_id ? "cursor-pointer hover:bg-muted/50" : ""}
                                onClick={() => { if (item.procedure_id) { onClose(); navigate(`/procedures?id=${item.procedure_id}`); } }}
                              >
                                <TableCell className="text-xs">
                                  <span className="inline-flex items-center gap-1.5">{item.patient_name}{item.procedure_id && <Eye className="h-3 w-3 text-muted-foreground" />}</span>
                                </TableCell>
                                <TableCell className="text-xs">{item.date ? format(new Date(item.date), "dd MMM yyyy") : "—"}</TableCell>
                                <TableCell className="text-xs text-right">{qty}</TableCell>
                                <TableCell className="text-xs text-right">₹{sp.toFixed(2)}</TableCell>
                                <TableCell className="text-xs text-right">₹{(qty * sp).toFixed(2)}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </DialogContent>
              </Dialog>

              {/* Portal Sales Drill-down */}
              <Dialog open={showPortalSales} onOpenChange={setShowPortalSales}>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle className="font-display">Portal Order Sales</DialogTitle></DialogHeader>
                  {portalSalesItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No portal sales recorded</p>
                  ) : (
                    <div className="max-h-80 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Patient</TableHead>
                            <TableHead className="text-xs">Date</TableHead>
                            <TableHead className="text-xs text-right">Qty</TableHead>
                            <TableHead className="text-xs text-right">Sell Price</TableHead>
                            <TableHead className="text-xs text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {portalSalesItems.map((item: any, idx: number) => (
                            <TableRow
                              key={idx}
                              className={item.order_id ? "cursor-pointer hover:bg-muted/50" : ""}
                              onClick={() => { if (item.order_id) { onClose(); navigate(`/orders?id=${item.order_id}`); } }}
                            >
                              <TableCell className="text-xs">
                                <span className="inline-flex items-center gap-1.5">{item.patient_name}{item.order_id && <Eye className="h-3 w-3 text-muted-foreground" />}</span>
                              </TableCell>
                              <TableCell className="text-xs">{item.date ? format(new Date(item.date), "dd MMM yyyy") : "—"}</TableCell>
                              <TableCell className="text-xs text-right">{Number(item.quantity)}</TableCell>
                              <TableCell className="text-xs text-right">₹{Number(item.unit_price || 0).toFixed(2)}</TableCell>
                              <TableCell className="text-xs text-right">₹{Number(item.total_price || 0).toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </DialogContent>
              </Dialog>

              <Separator />

              {/* Price Management */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display font-semibold text-sm">Price Management</h3>
                  <Button size="sm" variant="outline" onClick={() => {
                    setPriceForm({ mrp: Number(product.mrp), selling_price: Number(product.selling_price), purchase_price: 0, gst_percent: Number(product.gst_percent) || 0, notes: "", effective_from: new Date().toISOString().split("T")[0] });
                    setShowPriceForm(true);
                  }}><Plus className="h-3 w-3 mr-1" />New Price</Button>
                </div>

                {showPriceForm && (
                  <div className="border rounded-lg p-3 mb-3 bg-muted/30 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-xs">MRP (₹)</Label><Input type="number" className="mt-1 h-8" value={priceForm.mrp} onChange={(e) => setPriceForm({ ...priceForm, mrp: parseFloat(e.target.value) || 0 })} /></div>
                      <div><Label className="text-xs">Sell Price (₹)</Label><Input type="number" className="mt-1 h-8" value={priceForm.selling_price} onChange={(e) => setPriceForm({ ...priceForm, selling_price: parseFloat(e.target.value) || 0 })} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-xs">Buy Price (₹)</Label><Input type="number" className="mt-1 h-8" value={priceForm.purchase_price} onChange={(e) => setPriceForm({ ...priceForm, purchase_price: parseFloat(e.target.value) || 0 })} /></div>
                      <div><Label className="text-xs">GST %</Label><Input type="number" className="mt-1 h-8" value={priceForm.gst_percent} onChange={(e) => setPriceForm({ ...priceForm, gst_percent: parseFloat(e.target.value) || 0 })} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-xs">Effective From *</Label><Input type="date" className="mt-1 h-8" value={priceForm.effective_from} onChange={(e) => setPriceForm({ ...priceForm, effective_from: e.target.value })} required /></div>
                      <div><Label className="text-xs">Notes</Label><Input className="mt-1 h-8" value={priceForm.notes} onChange={(e) => setPriceForm({ ...priceForm, notes: e.target.value })} placeholder="Reason for price change" /></div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => addPrice.mutate()} disabled={addPrice.isPending || !priceForm.effective_from}><Check className="h-3 w-3 mr-1" />{addPrice.isPending ? "Saving..." : "Save & Activate"}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowPriceForm(false)}><X className="h-3 w-3 mr-1" />Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Edit Mode */
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Name *</Label><Input className="mt-1" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Generic Name</Label><Input className="mt-1" value={form.generic_name || ""} onChange={(e) => setForm({ ...form, generic_name: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Category</Label><Input className="mt-1" value={form.category || ""} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
                <div><Label>Manufacturer</Label><Input className="mt-1" value={form.manufacturer || ""} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Base Unit</Label>
                  <Select value={form.base_unit || form.unit || ""} onValueChange={(v) => setForm({ ...form, base_unit: v, unit: v })}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="e.g. Bottle, Box" /></SelectTrigger>
                    <SelectContent>{unitMaster.map((u: any) => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <UnitConversionsEditor
                value={editConversions}
                onChange={setEditConversions}
                unitOptions={unitMaster as any}
                baseUnit={form.base_unit || form.unit}
              />
              {(() => {
                const base = form.base_unit || form.unit || "";
                const uomNames = [
                  ...(base ? [base] : []),
                  ...editConversions
                    .filter((r) => r.is_active && r.sub_unit && Number(r.conversion_value) > 0)
                    .map((r) => r.sub_unit),
                ].filter((v, i, a) => v && a.indexOf(v) === i);
                return (
                  <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Units of Measure</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Buying UOM</Label>
                        <Select value={form.purchase_unit || base} onValueChange={(v) => setForm({ ...form, purchase_unit: v })}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="e.g. Box" /></SelectTrigger>
                          <SelectContent>{uomNames.map((u: string) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Selling UOM</Label>
                        <Select value={form.sale_unit || base} onValueChange={(v) => setForm({ ...form, sale_unit: v })}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="e.g. Tube" /></SelectTrigger>
                          <SelectContent>{uomNames.map((u: string) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Stock is kept in the Base Unit; billing defaults to the Selling UOM.</p>
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>HSN Code</Label><Input className="mt-1" value={form.hsn_code || ""} onChange={(e) => setForm({ ...form, hsn_code: e.target.value })} /></div>
                <div><Label>Reorder Level</Label><Input type="number" className="mt-1" value={form.reorder_level || 10} onChange={(e) => setForm({ ...form, reorder_level: parseInt(e.target.value) || 10 })} /></div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prescription Defaults</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Default Frequency</Label><Input className="mt-1" placeholder="e.g. Twice daily" value={form.default_frequency || ""} onChange={(e) => setForm({ ...form, default_frequency: e.target.value })} /></div>
                  <div><Label>Default Duration</Label><Input className="mt-1" placeholder="e.g. 7 days" value={form.default_duration || ""} onChange={(e) => setForm({ ...form, default_duration: e.target.value })} /></div>
                </div>
                <div><Label>Default Special Instructions</Label><Input className="mt-1" placeholder="e.g. Apply after cleansing" value={form.default_instructions || ""} onChange={(e) => setForm({ ...form, default_instructions: e.target.value })} /></div>
              </div>
              <p className="text-xs text-muted-foreground italic">Note: To change MRP, Selling Price or GST%, use "New Price" in view mode to preserve price history.</p>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => updateProduct.mutate()} disabled={updateProduct.isPending}>{updateProduct.isPending ? "Saving..." : "Save"}</Button>
                <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this product and its price history. Continue?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteProduct.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Inventory Detail ────────────────────────────────────
export function InventoryDetailSheet({ inventoryId, onClose, onClone, products }: { inventoryId: string | null; onClose: () => void; onClone?: (inv: any) => void; products: any[] }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState<any>({});

  const { data: record } = useQuery({
    queryKey: ["pharma-inv-detail", inventoryId],
    queryFn: async () => {
      if (!inventoryId) return null;
      const { data, error } = await supabase.from("pharma_inventory").select("*, pharma_products(name)").eq("id", inventoryId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!inventoryId,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (record) setForm({ ...record });
  }, [record]);

  const updateInv = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("pharma_inventory").update({
        product_id: form.product_id,
        batch_number: form.batch_number,
        expiry_date: form.expiry_date,
        quantity: Number(form.quantity),
        purchase_price: Number(form.purchase_price),
        supplier: form.supplier,
        invoice_number: form.invoice_number,
      }).eq("id", inventoryId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pharma-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["pharma-inv-detail", inventoryId] });
      toast.success("Inventory updated");
      setIsEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteInv = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("pharma_inventory").delete().eq("id", inventoryId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pharma-inventory"] });
      toast.success("Inventory record deleted");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!record) return null;

  const exp = new Date(record.expiry_date);
  const daysLeft = Math.ceil((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  const Field = ({ label, value }: { label: string; value: any }) => (
    <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-medium">{value || "—"}</p></div>
  );

  return (
    <>
      <Sheet open={!!inventoryId} onOpenChange={() => onClose()}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display">{isEditing ? "Edit Inventory" : (record as any).pharma_products?.name || "Inventory"}</SheetTitle>
          </SheetHeader>

          {!isEditing ? (
            <div className="mt-4 space-y-4">
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
                <Button size="sm" variant="outline" onClick={() => { onClone?.(record); onClose(); }}><Copy className="h-3 w-3 mr-1" />Clone</Button>
                <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Product" value={(record as any).pharma_products?.name} />
                <Field label="Batch Number" value={record.batch_number} />
                <Field label="Quantity" value={record.quantity} />
                <Field label="Purchase Price" value={`₹${Number(record.purchase_price).toFixed(2)}`} />
                <Field label="Expiry Date" value={format(exp, "dd MMM yyyy")} />
                <Field label="Days to Expiry" value={daysLeft <= 0 ? "Expired" : `${daysLeft} days`} />
                <Field label="Supplier" value={(() => {
                  if (!record.supplier) return "—";
                  const v = vendors.find((v: any) => v.id === record.supplier);
                  return v ? v.name : record.supplier;
                })()} />
                <Field label="Invoice No." value={record.invoice_number} />
                <Field label="Received Date" value={format(new Date(record.received_date), "dd MMM yyyy")} />
              </div>
              {daysLeft <= 0 && <Badge variant="destructive">Expired</Badge>}
              {daysLeft > 0 && daysLeft <= 90 && <Badge className="bg-warning/20 text-warning border-warning/30">Expiring Soon</Badge>}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div>
                <Label>Product *</Label>
                <Select value={form.product_id || ""} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Batch No. *</Label><Input className="mt-1" value={form.batch_number || ""} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} /></div>
                <div><Label>Expiry Date *</Label><Input type="date" className="mt-1" value={form.expiry_date || ""} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Quantity *</Label><Input type="number" className="mt-1" value={form.quantity || 0} onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 0 })} /></div>
                <div><Label>Purchase Price (₹)</Label><Input type="number" className="mt-1" value={form.purchase_price || 0} onChange={(e) => setForm({ ...form, purchase_price: parseFloat(e.target.value) || 0 })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Supplier</Label><div className="mt-1"><VendorCombobox value={form.supplier || ""} onChange={(v) => setForm({ ...form, supplier: v })} placeholder="Select supplier..." /></div></div>
                <div><Label>Invoice No.</Label><Input className="mt-1" value={form.invoice_number || ""} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} /></div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => updateInv.mutate()} disabled={updateInv.isPending}>{updateInv.isPending ? "Saving..." : "Save"}</Button>
                <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Inventory Record</AlertDialogTitle><AlertDialogDescription>This will permanently delete this inventory record. Continue?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteInv.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Bill Detail ─────────────────────────────────────────
export function BillDetailSheet({ billId, onClose, onClone }: { billId: string | null; onClose: () => void; onClone?: (bill: any) => void }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState<any>({});

  const { data: bill } = useQuery({
    queryKey: ["pharma-bill-detail", billId],
    queryFn: async () => {
      if (!billId) return null;
      const { data, error } = await supabase.from("pharma_bills").select("*").eq("id", billId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!billId,
  });

  const { data: billItems = [] } = useQuery({
    queryKey: ["pharma-bill-items", billId],
    queryFn: async () => {
      if (!billId) return [];
      const { data, error } = await supabase.from("pharma_bill_items").select("*").eq("bill_id", billId);
      if (error) throw error;
      return data;
    },
    enabled: !!billId,
  });

  useEffect(() => {
    if (bill) setForm({ ...bill });
  }, [bill]);

  const updateBill = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("pharma_bills").update({
        patient_name: form.patient_name,
        payment_mode: form.payment_mode,
        discount: Number(form.discount),
        status: form.status,
      }).eq("id", billId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pharma-bills"] });
      queryClient.invalidateQueries({ queryKey: ["pharma-bill-detail", billId] });
      toast.success("Bill updated");
      setIsEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteBill = useMutation({
    mutationFn: async () => {
      // Delete items first — no cascade set
      await supabase.from("pharma_bill_items").delete().eq("bill_id", billId!);
      const { error } = await supabase.from("pharma_bills").delete().eq("id", billId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pharma-bills"] });
      toast.success("Bill deleted");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!bill) return null;

  const Field = ({ label, value }: { label: string; value: any }) => (
    <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-medium">{value || "—"}</p></div>
  );

  return (
    <>
      <Sheet open={!!billId} onOpenChange={() => onClose()}>
        <SheetContent className="w-screen max-w-none sm:max-w-none overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display">{isEditing ? "Edit Bill" : `Bill ${bill.bill_number}`}</SheetTitle>
          </SheetHeader>

          {!isEditing ? (
            <div className="mt-4 space-y-4">
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
                <Button size="sm" variant="outline" onClick={() => { onClone?.(bill); onClose(); }}><Copy className="h-3 w-3 mr-1" />Clone</Button>
                <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Bill Number" value={bill.bill_number} />
                <Field label="Date" value={format(new Date(bill.created_at), "dd MMM yyyy, hh:mm a")} />
                <Field label="Patient" value={bill.patient_name} />
                <Field label="Payment Mode" value={bill.payment_mode} />
                <Field label="Status" value={bill.status} />
                <Field label="Total" value={`₹${Number(bill.total_amount).toFixed(2)}`} />
                <Field label="Discount" value={`₹${Number(bill.discount).toFixed(2)}`} />
                <Field label="Tax" value={bill.tax_rate ? `${bill.tax_rate}% (₹${Number(bill.tax_amount).toFixed(2)})` : "—"} />
                <Field label="Net Amount" value={`₹${Number(bill.net_amount).toFixed(2)}`} />
              </div>

              <Separator />

              <div>
                <h3 className="font-display font-semibold text-sm mb-2">Items</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Product</TableHead>
                      <TableHead className="text-xs">Batch</TableHead>
                      <TableHead className="text-xs">Qty</TableHead>
                      <TableHead className="text-xs">Price</TableHead>
                      <TableHead className="text-xs">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billItems.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-xs">{item.product_name}</TableCell>
                        <TableCell className="text-xs">{item.batch_number || "—"}</TableCell>
                        <TableCell className="text-xs">{item.quantity}</TableCell>
                        <TableCell className="text-xs">₹{Number(item.unit_price).toFixed(2)}</TableCell>
                        <TableCell className="text-xs font-medium">₹{Number(item.total_price).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Patient Name</Label><Input className="mt-1" value={form.patient_name || ""} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} /></div>
                <div>
                  <Label>Payment Mode</Label>
                  <Select value={form.payment_mode || "Cash"} onValueChange={(v) => setForm({ ...form, payment_mode: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{["Cash", "Card", "UPI", "Cheque"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Discount (₹)</Label><Input type="number" className="mt-1" value={form.discount || 0} onChange={(e) => setForm({ ...form, discount: parseFloat(e.target.value) || 0 })} /></div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status || "Paid"} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{["Paid", "Pending", "Cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => updateBill.mutate()} disabled={updateBill.isPending}>{updateBill.isPending ? "Saving..." : "Save"}</Button>
                <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Bill</AlertDialogTitle><AlertDialogDescription>This will permanently delete this bill and all its items. Continue?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteBill.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
