import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { VendorCombobox } from "@/components/shared/VendorCombobox";
import SearchableSelect from "@/components/shared/SearchableSelect";
import { PatientCombobox } from "@/components/patients/PatientCombobox";
import { Plus, Search, Package, ShoppingCart, AlertTriangle, Settings, Trash2, Cloud } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ProductDetailSheet, InventoryDetailSheet, BillDetailSheet } from "@/components/pharma/PharmaDetailSheet";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatProductUnit } from "@/lib/unitDisplay";
import { getActiveBatchPrice } from "@/lib/productPricing";
import { UnitConversionsEditor, syncProductUnits, type ConversionRow } from "@/components/pharma/UnitConversionsEditor";
import { usePharmaProductUnits } from "@/hooks/usePharmaProductUnits";
import { getUomOptions, getSaleUom, getPurchaseUom, findUom, toUomQty, toBaseQty, fmtQty, getBaseUnit } from "@/lib/uom";

// ─── Form Defaults ────────────────────────────────
const emptyProduct = { name: "", generic_name: "", category: "General", manufacturer: "", base_unit: "", purchase_unit: "", sale_unit: "", reorder_level: 10, vendor_ids: [] as string[], hsn_code: "", igst_percent: 0, cgst_percent: 0, gst_percent: 0, default_frequency: "", default_duration: "", default_instructions: "" };
const emptyStock = { product_id: "", batch_number: "", expiry_date: "", quantity: 0, purchase_unit: "", purchase_price: 0, mrp: 0, selling_price: 0, supplier: "", invoice_number: "", hsn_code: "", igst_percent: 0, cgst_percent: 0, gst_percent: 0 };

async function getFunctionErrorMessage(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.text();
    try {
      const parsed = JSON.parse(body);
      return parsed.error || parsed.details || body || error.message;
    } catch {
      return body || error.message;
    }
  }
  return error instanceof Error ? error.message : "Salesforce product sync failed";
}

interface BillItemInput {
  product_id: string;
  inventory_id: string;
  product_name: string;
  batch_number: string;
  quantity: number;
  unit_price: number;
  available: number;
  gst_percent: number;
  igst_percent: number;
  cgst_percent: number;
  /** UOM this line is sold in */
  uom: string;
  /** Units of `uom` per one base unit */
  uom_factor: number;
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <Label className="text-sm font-medium">{label}</Label>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

const Pharma = () => {
  const queryClient = useQueryClient();
  // Seeded from ?q= so global search can hand a term to this list view
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("q") || "");
  const [expiryView, setExpiryView] = useState<"near" | "expired" | null>(null);
  const [productOpen, setProductOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [productForm, setProductForm] = useState({ ...emptyProduct });
  const [stockForm, setStockForm] = useState({ ...emptyStock });
  const [productUnitRows, setProductUnitRows] = useState<ConversionRow[]>([]);
  // Inventory tab: show stock in the selling UOM or the buying/base UOM.
  const [inventoryUomView, setInventoryUomView] = useState<"sale" | "base">("sale");
  // For Inward Stock: which sub-unit the operator entered prices in.
  // null = entering at Base Unit. A row id means convert from sub-unit price → base.
  const [stockSubUnitIdx, setStockSubUnitIdx] = useState<number | null>(null);

  // Detail sheet state
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string | null>(null);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);

  // Bill state
  const [billPatientName, setBillPatientName] = useState("");
  const [billPatientId, setBillPatientId] = useState("");
  const [billPaymentMode, setBillPaymentMode] = useState("Cash");
  const [billDiscount, setBillDiscount] = useState(0);
  const [billItems, setBillItems] = useState<BillItemInput[]>([]);
  // billTaxId removed — tax is now per-item from product master

  // ─── Queries ────────────────────────────────────
  const { data: products = [] } = useQuery({
    queryKey: ["pharma-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pharma_products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: hsnTaxes = [] } = useQuery({
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

  /** Active HSN codes for the dropdowns, keeping any legacy code already saved on a record. */
  const hsnCodes = useMemo(() => (hsnTaxes as any[]).map((h) => String(h.hsn_code)), [hsnTaxes]);
  const hsnOptionsFor = (current?: string) => {
    const cur = (current || "").trim();
    const list = cur && !hsnCodes.includes(cur) ? [cur, ...hsnCodes] : hsnCodes;
    return list.map((c) => ({ id: c, name: c }));
  };

  const { data: unitsData } = usePharmaProductUnits();
  const unitsByProduct = unitsData?.byProduct || {};

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ["pharma-inventory"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pharma_inventory").select("*, pharma_products(name)").order("expiry_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: bills = [] } = useQuery({
    queryKey: ["pharma-bills"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pharma_bills").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: pharmaTaxes = [] } = useQuery({
    queryKey: ["tax-master-active-pharma"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tax_master").select("*").eq("is_active", true).order("rate");
      if (error) throw error;
      return data;
    },
  });

  const { data: unitMaster = [] } = useQuery({
    queryKey: ["unit-master"],
    queryFn: async () => {
      const { data, error } = await supabase.from("unit_master").select("*").eq("is_active", true).order("name");
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

  // ─── Portal Settings ────────────────────────────
  const { data: portalSettings } = useQuery({
    queryKey: ["portal-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("portal_settings").select("*").limit(1).single();
      if (error) throw error;
      return data;
    },
  });

  const [settingsForm, setSettingsForm] = useState({
    out_of_stock_behavior: "show_out_of_stock",
    hide_expiring_products: false,
    expiring_threshold_days: 90,
    shop_enabled: true,
    low_stock_threshold: null as number | null,
    appointments_booking_enabled: true,
    appointments_reschedule_enabled: true,
    treatment_history_enabled: true,
    procedure_history_enabled: true,
    clinical_photos_enabled: true,
    bills_enabled: true,
    outstanding_balance_enabled: true,
    surveys_enabled: true,
    ai_bot_enabled: true,
    our_team_enabled: true,
    clinic_hours_enabled: true,
    quick_action_request_appointment_enabled: true,
    quick_action_order_medicine_enabled: true,
  });

  useEffect(() => {
    if (portalSettings) {
      setSettingsForm({
        out_of_stock_behavior: portalSettings.out_of_stock_behavior,
        hide_expiring_products: portalSettings.hide_expiring_products,
        expiring_threshold_days: portalSettings.expiring_threshold_days,
        shop_enabled: portalSettings.shop_enabled,
        low_stock_threshold: portalSettings.low_stock_threshold,
        appointments_booking_enabled: (portalSettings as any).appointments_booking_enabled ?? true,
        appointments_reschedule_enabled: (portalSettings as any).appointments_reschedule_enabled ?? true,
        treatment_history_enabled: (portalSettings as any).treatment_history_enabled ?? true,
        procedure_history_enabled: (portalSettings as any).procedure_history_enabled ?? true,
        clinical_photos_enabled: (portalSettings as any).clinical_photos_enabled ?? true,
        bills_enabled: (portalSettings as any).bills_enabled ?? true,
        outstanding_balance_enabled: (portalSettings as any).outstanding_balance_enabled ?? true,
        surveys_enabled: (portalSettings as any).surveys_enabled ?? true,
        ai_bot_enabled: (portalSettings as any).ai_bot_enabled ?? true,
        our_team_enabled: (portalSettings as any).our_team_enabled ?? true,
        clinic_hours_enabled: (portalSettings as any).clinic_hours_enabled ?? true,
        quick_action_request_appointment_enabled: (portalSettings as any).quick_action_request_appointment_enabled ?? true,
        quick_action_order_medicine_enabled: (portalSettings as any).quick_action_order_medicine_enabled ?? true,
      });
    }
  }, [portalSettings]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      if (!portalSettings?.id) throw new Error("Settings not found");
      const { error } = await supabase.from("portal_settings").update(settingsForm).eq("id", portalSettings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-settings"] });
      toast.success("Portal settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ─── Mutations ──────────────────────────────────
  const addProduct = useMutation({
    mutationFn: async () => {
      // Pick the default-active row from the editor (if any) to mirror into legacy cols.
      const activeRows = productUnitRows.filter((r) => r.is_active && r.sub_unit && Number(r.conversion_value) > 1);
      const defaultRow = activeRows.find((r) => r.is_default) || activeRows[0] || null;
      const payload: any = {
        name: productForm.name,
        generic_name: productForm.generic_name || null,
        category: productForm.category,
        manufacturer: productForm.manufacturer || null,
        base_unit: productForm.base_unit || null,
        purchase_unit: productForm.purchase_unit || productForm.base_unit || null,
        sale_unit: productForm.sale_unit || productForm.purchase_unit || productForm.base_unit || null,
        sub_unit: defaultRow?.sub_unit || null,
        conversion_value: defaultRow ? Number(defaultRow.conversion_value) || 1 : 1,
        unit: productForm.base_unit || "Nos", // legacy fallback
        reorder_level: productForm.reorder_level,
        vendor_id: productForm.vendor_ids.length > 0 ? productForm.vendor_ids[0] : null,
        qty_per_unit: defaultRow ? Number(defaultRow.conversion_value) || 1 : 1,
        hsn_code: productForm.hsn_code || null,
        igst_percent: Number(productForm.igst_percent) || 0,
        cgst_percent: Number(productForm.cgst_percent) || 0,
        gst_percent: (Number(productForm.igst_percent) || 0) + (Number(productForm.cgst_percent) || 0),
        default_frequency: productForm.default_frequency || null,
        default_duration: productForm.default_duration || null,
        default_instructions: productForm.default_instructions || null,
      };
      const { data: inserted, error } = await supabase.from("pharma_products").insert(payload).select().single();
      if (error) throw error;
      // Persist conversion rows
      if (productUnitRows.length > 0 && inserted?.id) {
        await syncProductUnits(supabase, inserted.id, productUnitRows);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pharma-products"] });
      queryClient.invalidateQueries({ queryKey: ["pharma-product-units"] });
      toast.success("Product added");
      setProductForm({ ...emptyProduct });
      setProductUnitRows([]);
      setProductOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addStock = useMutation({
    mutationFn: async () => {
      const prod = products.find((p: any) => p.id === stockForm.product_id) as any;
      const uomOpts = getUomOptions(prod, unitsByProduct[stockForm.product_id]);
      const uom = uomOpts.find((o) => o.name === stockForm.purchase_unit) || uomOpts[0];
      const mrp = Number(stockForm.mrp) || 0;
      const sp = Number(stockForm.selling_price) || mrp;
      const pp = Number(stockForm.purchase_price) || 0;
      if (mrp <= 0) throw new Error("MRP is required");
      if (pp > mrp) throw new Error("Purchase price cannot be higher than MRP");
      if (sp > mrp) throw new Error("Selling price cannot be higher than MRP");
      // Prices are entered per buying UOM; stock is always kept in base units.
      const factor = uom?.factor || 1;
      const enteredQty = Number(stockForm.quantity) || 0;
      const { error } = await supabase.from("pharma_inventory").insert({
        product_id: stockForm.product_id,
        batch_number: stockForm.batch_number,
        expiry_date: stockForm.expiry_date,
        quantity: toBaseQty(enteredQty, factor),
        purchase_unit: uom?.name || null,
        purchase_quantity: enteredQty,
        purchase_price: pp * factor,
        mrp: mrp * factor,
        selling_price: sp * factor,
        supplier: stockForm.supplier || null,
        invoice_number: stockForm.invoice_number || null,
        hsn_code: stockForm.hsn_code || null,
        igst_percent: Number(stockForm.igst_percent) || 0,
        cgst_percent: Number(stockForm.cgst_percent) || 0,
        gst_percent: (Number(stockForm.igst_percent) || 0) + (Number(stockForm.cgst_percent) || 0),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pharma-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["pharma-products"] });
      toast.success("Stock added");
      setStockForm({ ...emptyStock });
      setStockOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncSalesforceProducts = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sync-salesforce-products");
      if (error) throw new Error(await getFunctionErrorMessage(error));
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["pharma-products"] });
      const stats = `${data.total ?? 0} checked, ${data.imported ?? 0} imported, ${data.updated ?? 0} updated`;
      if (data.success === false) {
        toast.warning(`Sync completed with issues: ${stats}. ${data.errors?.[0] || "Review function logs for details."}`);
        return;
      }
      const removed = data.removedLegacy ? `, ${data.removedLegacy} old incorrect imports removed` : "";
      toast.success(`Sync complete: ${stats}${removed}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAllProducts = useMutation({
    mutationFn: async () => {
      const sentinel = "00000000-0000-0000-0000-000000000000";
      const deleteLinkedRows = async (table: string) => {
        const { error } = await supabase.from(table as any).delete().neq("product_id", sentinel);
        if (error) throw error;
      };

      // Remove editable product configuration rows first; historical bills/orders keep their records
      // and the database now clears their product pointer automatically when products are deleted.
      await deleteLinkedRows("cart_items");
      await deleteLinkedRows("survey_template_products");
      await deleteLinkedRows("tax_master_products");
      await deleteLinkedRows("product_prices");
      await deleteLinkedRows("service_medicines");
      await deleteLinkedRows("pharma_product_units");
      await deleteLinkedRows("pharma_inventory");
      const { error } = await supabase.from("pharma_products").delete().neq("id", sentinel);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pharma-products"] });
      queryClient.invalidateQueries({ queryKey: ["pharma-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["pharma-product-units"] });
      toast.success("All products deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createBill = useMutation({
    mutationFn: async () => {
      // Validate stock availability before creating bill
      for (const item of billItems) {
        if (!item.inventory_id) continue;
        const inv = inventory.find((i: any) => i.id === item.inventory_id) as any;
        if (!inv || inv.quantity <= 0) {
          throw new Error(`Insufficient stock for ${item.product_name || "selected product"}`);
        }
        const availableInUom = toUomQty(Number(inv.quantity), item.uom_factor || 1);
        if (item.quantity > availableInUom + 1e-6) {
          throw new Error(`Insufficient stock for ${item.product_name}. Available: ${fmtQty(availableInUom)} ${item.uom}, Requested: ${fmtQty(item.quantity)} ${item.uom}`);
        }
      }

      const totalAmount = billItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      const taxAmount = billItems.reduce((s, i) => s + (i.quantity * i.unit_price * i.gst_percent) / 100, 0);
      const netAmount = totalAmount + taxAmount - billDiscount;
      const billNum = `PH-${Date.now().toString().slice(-6)}`;

      const { data: bill, error } = await supabase.from("pharma_bills").insert({
        bill_number: billNum,
        patient_name: billPatientName,
        total_amount: totalAmount,
        discount: billDiscount,
        net_amount: netAmount,
        payment_mode: billPaymentMode,
        tax_id: null,
        tax_rate: 0,
        tax_amount: taxAmount,
      }).select().single();
      if (error) throw error;

      const items = billItems.map((i) => ({
        bill_id: bill.id,
        product_id: i.product_id,
        inventory_id: i.inventory_id,
        product_name: i.product_name,
        batch_number: i.batch_number,
        quantity: i.quantity,
        uom: i.uom || null,
        uom_conversion: i.uom_factor || 1,
        unit_price: i.unit_price,
        total_price: i.quantity * i.unit_price,
      })) as any;
      const { error: itemErr } = await supabase.from("pharma_bill_items").insert(items);
      if (itemErr) throw itemErr;

      for (const item of billItems) {
        const invRecord = inventory.find((inv: any) => inv.id === item.inventory_id);
        if (invRecord) {
          const deductBase = toBaseQty(item.quantity, item.uom_factor || 1);
          const remaining = Math.max(0, Number((invRecord as any).quantity) - deductBase);
          await supabase.from("pharma_inventory").update({ quantity: remaining }).eq("id", item.inventory_id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pharma-bills"] });
      queryClient.invalidateQueries({ queryKey: ["pharma-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["pharma-inventory-billing"] });
      queryClient.invalidateQueries({ queryKey: ["pharma-products"] });
      toast.success("Bill created");
      setBillItems([]);
      setBillPatientName("");
      setBillPatientId("");
      setBillDiscount(0);
      setBillOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addBillItem = () => {
    setBillItems([...billItems, { product_id: "", inventory_id: "", product_name: "", batch_number: "", quantity: 1, unit_price: 0, available: 0, gst_percent: 0, igst_percent: 0, cgst_percent: 0, uom: "", uom_factor: 1 }]);
  };

  const updateBillItem = (idx: number, field: string, value: any) => {
    const updated = [...billItems];
    (updated[idx] as any)[field] = value;
    if (field === "inventory_id") {
      const inv = inventory.find((i: any) => i.id === value) as any;
      if (inv) {
        const prod = products.find((p: any) => p.id === inv.product_id) as any;
        // Default to the product's selling UOM; stock is held in base units.
        const saleUom = getSaleUom(prod, unitsByProduct[inv.product_id]);
        updated[idx].product_id = inv.product_id;
        updated[idx].product_name = prod?.name || "";
        updated[idx].batch_number = inv.batch_number;
        updated[idx].uom = saleUom.name;
        updated[idx].uom_factor = saleUom.factor;
        // Prefer batch selling_price → batch mrp → legacy product fields (all per base unit)
        const basePrice = Number(inv.selling_price) || Number(inv.mrp) || Number(prod?.selling_price) || Number(prod?.mrp) || 0;
        updated[idx].unit_price = basePrice / (saleUom.factor || 1);
        updated[idx].available = toUomQty(Number(inv.quantity), saleUom.factor);
        // Tax is driven by the inward batch, falling back to the product master.
        const bIgst = Number(inv.igst_percent) || 0;
        const bCgst = Number(inv.cgst_percent) || 0;
        const pIgst = Number(prod?.igst_percent) || 0;
        const pCgst = Number(prod?.cgst_percent) || 0;
        const igstP = bIgst + bCgst > 0 ? bIgst : pIgst;
        const cgstP = bIgst + bCgst > 0 ? bCgst : pCgst;
        updated[idx].igst_percent = igstP;
        updated[idx].cgst_percent = cgstP;
        updated[idx].gst_percent = igstP + cgstP > 0
          ? igstP + cgstP
          : (Number(inv.gst_percent) || Number(prod?.gst_percent) || 0);
        if (inv.quantity <= 0) {
          toast.warning(`Insufficient stock for ${prod?.name || "this product"}`);
        }
      }
    }
    if (field === "uom") {
      const inv = inventory.find((i: any) => i.id === updated[idx].inventory_id) as any;
      const prod = products.find((p: any) => p.id === updated[idx].product_id) as any;
      if (inv && prod) {
        const uom = findUom(prod, unitsByProduct[prod.id], value);
        const basePrice = Number(inv.selling_price) || Number(inv.mrp) || Number(prod?.selling_price) || Number(prod?.mrp) || 0;
        updated[idx].uom = uom.name;
        updated[idx].uom_factor = uom.factor;
        updated[idx].unit_price = basePrice / (uom.factor || 1);
        updated[idx].available = toUomQty(Number(inv.quantity), uom.factor);
      }
    }
    if (field === "quantity" && updated[idx].available > 0 && value > updated[idx].available) {
      toast.warning(`Only ${fmtQty(updated[idx].available)} ${updated[idx].uom || "units"} available for ${updated[idx].product_name}`);
    }
    setBillItems(updated);
  };

  // Clone handlers
  const handleCloneProduct = (product: any) => {
    setProductForm({
      name: `${product.name} (Copy)`,
      generic_name: product.generic_name || "",
      category: product.category || "General",
      manufacturer: product.manufacturer || "",
      base_unit: product.base_unit || product.unit || "",
      purchase_unit: product.purchase_unit || product.base_unit || product.unit || "",
      sale_unit: product.sale_unit || product.purchase_unit || product.base_unit || product.unit || "",
      reorder_level: product.reorder_level || 10,
      vendor_ids: product.vendor_id ? [product.vendor_id] : [],
      hsn_code: product.hsn_code || "",
      igst_percent: Number(product.igst_percent) || 0,
      cgst_percent: Number(product.cgst_percent) || 0,
      gst_percent: Number(product.gst_percent) || 0,
      default_frequency: product.default_frequency || "",
      default_duration: product.default_duration || "",
      default_instructions: product.default_instructions || "",
    });
    // Seed conversion rows from existing units (if any) or from legacy fields.
    const existing = unitsByProduct[product.id] || [];
    if (existing.length > 0) {
      setProductUnitRows(existing.map((r: any, i: number) => ({
        sub_unit: r.sub_unit,
        conversion_value: Number(r.conversion_value) || 1,
        is_active: !!r.is_active,
        is_default: !!r.is_default,
        sort_order: i,
      })));
    } else if (product.sub_unit) {
      setProductUnitRows([{
        sub_unit: product.sub_unit,
        conversion_value: Number(product.conversion_value ?? product.qty_per_unit ?? 1) || 1,
        is_active: true,
        is_default: true,
        sort_order: 0,
      }]);
    } else {
      setProductUnitRows([]);
    }
    setProductOpen(true);
  };

  const handleCloneInventory = (inv: any) => {
    const prod = products.find((p: any) => p.id === inv.product_id) as any;
    const uom = findUom(prod, unitsByProduct[inv.product_id], inv.purchase_unit || prod?.purchase_unit);
    const f = uom?.factor || 1;
    setStockForm({
      product_id: inv.product_id || "",
      batch_number: "",
      expiry_date: "",
      quantity: Number(inv.purchase_quantity ?? toUomQty(Number(inv.quantity) || 0, f)) || 0,
      purchase_unit: uom?.name || "",
      purchase_price: (Number(inv.purchase_price) || 0) / f,
      mrp: (Number(inv.mrp) || 0) / f,
      selling_price: (Number(inv.selling_price) || 0) / f,
      supplier: inv.supplier || "",
      invoice_number: "",
      hsn_code: inv.hsn_code || "",
      igst_percent: Number(inv.igst_percent) || 0,
      cgst_percent: Number(inv.cgst_percent) || 0,
      gst_percent: Number(inv.gst_percent) || 0,
    });
    setStockOpen(true);
  };

  const handleCloneBill = (bill: any) => {
    setBillPatientName(bill.patient_name || "");
    setBillPatientId("");
    setBillPaymentMode(bill.payment_mode || "Cash");
    setBillDiscount(bill.discount || 0);
    setBillItems([]);
    setBillItems([]);
    setBillOpen(true);
    toast.info("Bill cloned — add items to complete");
  };

  const filteredProducts = products.filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.category?.toLowerCase().includes(search.toLowerCase())
  );

  const nearExpiry = inventory.filter((i: any) => {
    const exp = new Date(i.expiry_date);
    const diff = (exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff <= 90 && diff > 0;
  });

  const expired = inventory.filter((i: any) => new Date(i.expiry_date) < new Date());

  const expiryRows = expiryView === "expired" ? expired : expiryView === "near" ? nearExpiry : [];

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Pharmacy</h1>
          <p className="page-subtitle">Products, inventory & billing</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => syncSalesforceProducts.mutate()}
            disabled={syncSalesforceProducts.isPending}
          >
            <Cloud className="h-4 w-4" />
            {syncSalesforceProducts.isPending ? "Syncing..." : "Sync from Salesforce"}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="h-4 w-4" /> Delete All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all products?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all pharmacy products along with their inventory batches and unit conversions. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => deleteAllProducts.mutate()}
                  disabled={deleteAllProducts.isPending}
                >
                  {deleteAllProducts.isPending ? "Deleting..." : "Delete All"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Dialog open={productOpen} onOpenChange={setProductOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><Package className="h-4 w-4" /> Add Product</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle className="font-display">Add Product</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2 max-h-[70vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Product Name *</Label><Input className="mt-1" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} /></div>
                  <div><Label>Generic Name</Label><Input className="mt-1" value={productForm.generic_name} onChange={(e) => setProductForm({ ...productForm, generic_name: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Category</Label>
                    <Select value={productForm.category} onValueChange={(v) => setProductForm({ ...productForm, category: v })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>{categoryMaster.map((c: any) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Base Unit *</Label>
                    <Select value={productForm.base_unit} onValueChange={(v) => setProductForm({ ...productForm, base_unit: v })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="e.g. Bottle, Box" /></SelectTrigger>
                      <SelectContent>{unitMaster.map((u: any) => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Manufacturer</Label><Input className="mt-1" value={productForm.manufacturer} onChange={(e) => setProductForm({ ...productForm, manufacturer: e.target.value })} /></div>
                </div>
                <div>
                  <Label>Vendor(s)</Label>
                  <div className="mt-1 space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {(productForm.vendor_ids || []).map((vid) => {
                        const v = vendors.find((vn: any) => vn.id === vid);
                        return v ? (
                          <Badge key={vid} variant="secondary" className="gap-1">
                            {v.name}
                            <button type="button" className="ml-1 text-muted-foreground hover:text-foreground" onClick={() => setProductForm({ ...productForm, vendor_ids: productForm.vendor_ids.filter((id) => id !== vid) })}>×</button>
                          </Badge>
                        ) : null;
                      })}
                    </div>
                    <VendorCombobox value="" onChange={(v) => { if (v && !productForm.vendor_ids.includes(v)) setProductForm({ ...productForm, vendor_ids: [...productForm.vendor_ids, v] }); }} placeholder="Add vendor..." />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Reorder Level</Label><Input type="number" className="mt-1" value={productForm.reorder_level} onChange={(e) => setProductForm({ ...productForm, reorder_level: parseInt(e.target.value) || 10 })} /></div>
                </div>
                <UnitConversionsEditor
                  value={productUnitRows}
                  onChange={setProductUnitRows}
                  unitOptions={unitMaster as any}
                  baseUnit={productForm.base_unit}
                />
                {(() => {
                  const uomNames = [
                    ...(productForm.base_unit ? [productForm.base_unit] : []),
                    ...productUnitRows
                      .filter((r) => r.is_active && r.sub_unit && Number(r.conversion_value) > 0)
                      .map((r) => r.sub_unit),
                  ].filter((v, i, a) => v && a.indexOf(v) === i);
                  return (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Units of Measure</div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Buying UOM</Label>
                          <Select value={productForm.purchase_unit || productForm.base_unit} onValueChange={(v) => setProductForm({ ...productForm, purchase_unit: v })}>
                            <SelectTrigger className="mt-1"><SelectValue placeholder="e.g. Box" /></SelectTrigger>
                            <SelectContent>{uomNames.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Selling UOM</Label>
                          <Select value={productForm.sale_unit || productForm.base_unit} onValueChange={(v) => setProductForm({ ...productForm, sale_unit: v })}>
                            <SelectTrigger className="mt-1"><SelectValue placeholder="e.g. Tube" /></SelectTrigger>
                            <SelectContent>{uomNames.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Stock is kept in the Base Unit. Buying UOM is used by default in Inward Stock, Selling UOM in billing — both can be changed per transaction.
                      </p>
                    </div>
                  );
                })()}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>HSN Code</Label>
                    <SearchableSelect
                      className="mt-1"
                      placeholder="Select HSN"
                      searchPlaceholder="Search HSN…"
                      emptyText="No HSN codes"
                      value={productForm.hsn_code}
                      onChange={(v) => setProductForm({ ...productForm, hsn_code: v })}
                      options={hsnOptionsFor(productForm.hsn_code)}
                    />
                  </div>
                  <div><Label>GST % (total)</Label><Input type="number" readOnly className="mt-1 bg-muted/50" value={(Number(productForm.igst_percent) || 0) + (Number(productForm.cgst_percent) || 0)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>IGST %</Label><Input type="number" className="mt-1" value={productForm.igst_percent} onChange={(e) => setProductForm({ ...productForm, igst_percent: parseFloat(e.target.value) || 0 })} /></div>
                  <div><Label>CGST %</Label><Input type="number" className="mt-1" value={productForm.cgst_percent} onChange={(e) => setProductForm({ ...productForm, cgst_percent: parseFloat(e.target.value) || 0 })} /></div>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-1">GST % is the total of IGST % + CGST %.</p>
                <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prescription Defaults</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Default Frequency</Label><Input className="mt-1" placeholder="e.g. Twice daily" value={productForm.default_frequency} onChange={(e) => setProductForm({ ...productForm, default_frequency: e.target.value })} /></div>
                    <div><Label>Default Duration</Label><Input className="mt-1" placeholder="e.g. 7 days" value={productForm.default_duration} onChange={(e) => setProductForm({ ...productForm, default_duration: e.target.value })} /></div>
                  </div>
                  <div><Label>Default Special Instructions</Label><Input className="mt-1" placeholder="e.g. Apply after cleansing" value={productForm.default_instructions} onChange={(e) => setProductForm({ ...productForm, default_instructions: e.target.value })} /></div>
                </div>
                <div className="rounded-md bg-muted/50 border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  💡 Pricing (MRP / Selling Price) is captured per batch in <strong>Inward Stock</strong>.
                </div>
                <Button className="w-full" onClick={() => addProduct.mutate()} disabled={!productForm.name || addProduct.isPending}>
                  {addProduct.isPending ? "Saving..." : "Add Product"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={stockOpen} onOpenChange={setStockOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><Plus className="h-4 w-4" /> Inward Stock</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display">Add Stock (Inward)</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div>
                  <Label>Product *</Label>
                  <Select value={stockForm.product_id} onValueChange={(v) => {
                    const prod = products.find((p: any) => p.id === v) as any;
                    const buyUom = getPurchaseUom(prod, unitsByProduct[v]);
                    setStockForm({
                      ...stockForm,
                      product_id: v,
                      purchase_unit: buyUom.name,
                      hsn_code: prod?.hsn_code || "",
                      igst_percent: Number(prod?.igst_percent) || 0,
                      cgst_percent: Number(prod?.cgst_percent) || 0,
                      gst_percent: (Number(prod?.igst_percent) || 0) + (Number(prod?.cgst_percent) || 0) || Number(prod?.gst_percent) || 0,
                    });
                  }}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {(() => {
                  const sp = products.find((p: any) => p.id === stockForm.product_id) as any;
                  if (!sp) return null;
                  const baseUnit = sp.base_unit || sp.unit || "unit";
                  const activeUnits = (unitsByProduct[sp.id] || []).filter((u: any) => u.is_active && u.sub_unit && Number(u.conversion_value) > 1);
                  return (
                    <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                      <div><strong>Base Unit:</strong> {baseUnit}</div>
                      {activeUnits.length > 0 ? activeUnits.map((u: any, i: number) => (
                        <div key={i}><strong>Conversion:</strong> 1 {baseUnit} = {Number(u.conversion_value)} {u.sub_unit}{u.is_default && " (default)"}</div>
                      )) : (sp.sub_unit && Number(sp.conversion_value ?? sp.qty_per_unit ?? 1) > 1 && (
                        <div><strong>Conversion:</strong> 1 {baseUnit} = {Number(sp.conversion_value ?? sp.qty_per_unit)} {sp.sub_unit}</div>
                      ))}
                    </div>
                  );
                })()}
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Batch No. *</Label><Input className="mt-1" value={stockForm.batch_number} onChange={(e) => setStockForm({ ...stockForm, batch_number: e.target.value })} /></div>
                  <div><Label>Expiry Date *</Label><Input type="date" className="mt-1" value={stockForm.expiry_date} onChange={(e) => setStockForm({ ...stockForm, expiry_date: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>HSN Code</Label>
                    <SearchableSelect
                      className="mt-1"
                      placeholder="From product master"
                      searchPlaceholder="Search HSN…"
                      emptyText="No HSN codes"
                      value={stockForm.hsn_code}
                      onChange={(v) => setStockForm({ ...stockForm, hsn_code: v })}
                      options={hsnOptionsFor(stockForm.hsn_code)}
                    />
                  </div>
                  <div>
                    <Label>GST % (total)</Label>
                    <Input type="number" readOnly className="mt-1 bg-muted/50" value={(Number(stockForm.igst_percent) || 0) + (Number(stockForm.cgst_percent) || 0)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>IGST %</Label><Input type="number" className="mt-1" value={stockForm.igst_percent} onChange={(e) => setStockForm({ ...stockForm, igst_percent: parseFloat(e.target.value) || 0 })} /></div>
                  <div><Label>CGST %</Label><Input type="number" className="mt-1" value={stockForm.cgst_percent} onChange={(e) => setStockForm({ ...stockForm, cgst_percent: parseFloat(e.target.value) || 0 })} /></div>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-1">HSN, IGST & CGST default from the product master; edit here to apply batch-specific tax at billing. GST % = IGST + CGST.</p>
                {(() => {
                  const sp = products.find((p: any) => p.id === stockForm.product_id) as any;
                  const baseUnit = sp ? getBaseUnit(sp) : "";
                  const uomOpts = sp ? getUomOptions(sp, unitsByProduct[sp.id]) : [];
                  const buyUom = sp ? findUom(sp, unitsByProduct[sp.id], stockForm.purchase_unit) : null;
                  const saleUom = sp ? getSaleUom(sp, unitsByProduct[sp.id]) : null;
                  const buyName = buyUom?.name || baseUnit;
                  const perUom = buyName ? ` (per ${buyName})` : "";
                  // Prices are entered per buying UOM; show the equivalent selling-UOM price.
                  const saleHint = (price: number) => {
                    if (!sp || !saleUom || !buyUom || price <= 0 || saleUom.name === buyUom.name) return "";
                    const perBasePrice = price * buyUom.factor;
                    return `= ₹${(perBasePrice / saleUom.factor).toFixed(2)} per ${saleUom.name}`;
                  };
                  const enteredQty = Number(stockForm.quantity) || 0;
                  const baseQty = buyUom ? toBaseQty(enteredQty, buyUom.factor) : enteredQty;
                  return (
                    <>
                      {sp && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Buying UOM *</Label>
                            <Select value={buyName} onValueChange={(v) => setStockForm({ ...stockForm, purchase_unit: v })}>
                              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {uomOpts.map((o) => (
                                  <SelectItem key={o.name} value={o.name}>
                                    {o.name}{o.isBase ? " (base)" : ` — ${o.factor} per ${baseUnit}`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground self-end">
                            <div><strong>Selling UOM:</strong> {saleUom?.name || baseUnit}</div>
                            {enteredQty > 0 && saleUom && (
                              <div>
                                {fmtQty(enteredQty)} {buyName} = {fmtQty(toUomQty(baseQty, saleUom.factor))} {saleUom.name}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-3">
                        <div><Label>Quantity{buyName ? ` (${buyName})` : ""} *</Label><Input type="number" className="mt-1" value={stockForm.quantity} onChange={(e) => setStockForm({ ...stockForm, quantity: parseFloat(e.target.value) || 0 })} /></div>
                        <div>
                          <Label>Purchase Price{perUom}</Label>
                          <Input type="number" className="mt-1" value={stockForm.purchase_price} onChange={(e) => setStockForm({ ...stockForm, purchase_price: parseFloat(e.target.value) || 0 })} />
                          {saleHint(stockForm.purchase_price) && <p className="text-[11px] text-muted-foreground mt-1">{saleHint(stockForm.purchase_price)}</p>}
                          {stockForm.mrp > 0 && stockForm.purchase_price > stockForm.mrp && <p className="text-[11px] text-destructive mt-1">Cannot exceed MRP</p>}
                        </div>
                        <div>
                          <Label>MRP{perUom} *</Label>
                          <Input type="number" className="mt-1" value={stockForm.mrp} onChange={(e) => setStockForm({ ...stockForm, mrp: parseFloat(e.target.value) || 0 })} />
                          {saleHint(stockForm.mrp) && <p className="text-[11px] text-muted-foreground mt-1">{saleHint(stockForm.mrp)}</p>}
                        </div>
                      </div>
                      <div>
                        <Label>Selling Price{perUom} <span className="text-muted-foreground text-xs">(optional, defaults to MRP)</span></Label>
                        <Input type="number" className="mt-1" value={stockForm.selling_price} onChange={(e) => setStockForm({ ...stockForm, selling_price: parseFloat(e.target.value) || 0 })} placeholder={stockForm.mrp ? `${stockForm.mrp}` : ""} />
                        {saleHint(stockForm.selling_price || stockForm.mrp) && <p className="text-[11px] text-muted-foreground mt-1">{saleHint(stockForm.selling_price || stockForm.mrp)}</p>}
                        {stockForm.mrp > 0 && stockForm.selling_price > stockForm.mrp && <p className="text-[11px] text-destructive mt-1">Cannot exceed MRP</p>}
                      </div>
                    </>
                  );
                })()}
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Supplier</Label><div className="mt-1"><VendorCombobox value={stockForm.supplier} onChange={(v) => setStockForm({ ...stockForm, supplier: v })} placeholder="Select supplier..." /></div></div>
                  <div><Label>Invoice No.</Label><Input className="mt-1" value={stockForm.invoice_number} onChange={(e) => setStockForm({ ...stockForm, invoice_number: e.target.value })} /></div>
                </div>
                <Button className="w-full" onClick={() => addStock.mutate()} disabled={!stockForm.product_id || !stockForm.batch_number || !stockForm.expiry_date || !stockForm.mrp || Number(stockForm.purchase_price) > Number(stockForm.mrp) || Number(stockForm.selling_price) > Number(stockForm.mrp) || addStock.isPending}>
                  {addStock.isPending ? "Saving..." : "Add Stock"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={billOpen} onOpenChange={setBillOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><ShoppingCart className="h-4 w-4" /> New Bill</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="font-display">Pharmacy Bill (Outward)</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Patient</Label>
                    <div className="mt-1">
                      <PatientCombobox
                        value={billPatientId}
                        onValueChange={(id, p) => {
                          setBillPatientId(id);
                          if (p) {
                            const name = `${p.first_name || ""} ${p.last_name || ""}`.trim();
                            setBillPatientName(name || p.phone || "");
                          } else {
                            setBillPatientName("");
                          }
                        }}
                        placeholder="Select patient"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Payment Mode</Label>
                    <Select value={billPaymentMode} onValueChange={setBillPaymentMode}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{["Cash", "Card", "UPI", "Cheque"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="font-display font-semibold">Items</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addBillItem}><Plus className="h-3 w-3 mr-1" /> Add Item</Button>
                  </div>
                  {billItems.map((item, idx) => (
                    <div key={idx} className="border rounded-lg p-3 mb-2 space-y-2 bg-muted/30">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Product (Batch)</Label>
                          <Select value={item.inventory_id} onValueChange={(v) => updateBillItem(idx, "inventory_id", v)}>
                            <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              {inventory.filter((i: any) => i.quantity > 0 && new Date(i.expiry_date) > new Date()).map((i: any) => {
                                const prod = products.find((p: any) => p.id === i.product_id);
                                const su = getSaleUom(prod, unitsByProduct[i.product_id]);
                                return (
                                  <SelectItem key={i.id} value={i.id}>
                                    {i.pharma_products?.name} — Batch: {i.batch_number} ({fmtQty(toUomQty(Number(i.quantity), su.factor))} {su.name}, exp {new Date(i.expiry_date).toLocaleDateString()})
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-xs">UOM</Label>
                            {(() => {
                              const prod = products.find((p: any) => p.id === item.product_id);
                              const opts = prod ? getUomOptions(prod, unitsByProduct[prod.id]) : [];
                              return (
                                <Select value={item.uom} onValueChange={(v) => updateBillItem(idx, "uom", v)} disabled={!prod}>
                                  <SelectTrigger className="mt-1"><SelectValue placeholder="Unit" /></SelectTrigger>
                                  <SelectContent>{opts.map((o) => <SelectItem key={o.name} value={o.name}>{o.name}</SelectItem>)}</SelectContent>
                                </Select>
                              );
                            })()}
                          </div>
                          <div><Label className="text-xs">Qty</Label><Input type="number" className="mt-1" value={item.quantity} onChange={(e) => updateBillItem(idx, "quantity", parseFloat(e.target.value) || 0)} max={item.available} /></div>
                          <div><Label className="text-xs">Price (₹)</Label><Input type="number" className="mt-1" value={item.unit_price} onChange={(e) => updateBillItem(idx, "unit_price", parseFloat(e.target.value) || 0)} /></div>
                        </div>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">
                          {item.inventory_id && <>In stock: {fmtQty(item.available)} {item.uom} · </>}
                          Subtotal: ₹{(item.quantity * item.unit_price).toFixed(2)}
                          {item.gst_percent > 0 && ` + GST ${item.gst_percent}% (IGST ${item.igst_percent || 0}% + CGST ${item.cgst_percent || 0}%): ₹${(item.quantity * item.unit_price * item.gst_percent / 100).toFixed(2)}`}
                        </span>
                        <Button type="button" variant="ghost" size="sm" className="h-5 text-xs text-destructive" onClick={() => setBillItems(billItems.filter((_, i) => i !== idx))}>Remove</Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between text-sm"><span>Subtotal</span><span>₹{billItems.reduce((s, i) => s + i.quantity * i.unit_price, 0).toFixed(2)}</span></div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>IGST</span>
                    <span>₹{billItems.reduce((s, i) => s + (i.quantity * i.unit_price * (i.igst_percent || 0)) / 100, 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>CGST</span>
                    <span>₹{billItems.reduce((s, i) => s + (i.quantity * i.unit_price * (i.cgst_percent || 0)) / 100, 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Total GST (per-item)</span>
                    <span>₹{billItems.reduce((s, i) => s + (i.quantity * i.unit_price * i.gst_percent) / 100, 0).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Discount (₹)</span>
                    <Input type="number" className="w-24 h-8 text-right" value={billDiscount} onChange={(e) => setBillDiscount(parseFloat(e.target.value) || 0)} />
                  </div>
                  {(() => {
                    const subtotal = billItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
                    const taxAmt = billItems.reduce((s, i) => s + (i.quantity * i.unit_price * i.gst_percent) / 100, 0);
                    return <div className="flex justify-between font-semibold"><span>Net Amount</span><span>₹{(subtotal + taxAmt - billDiscount).toFixed(2)}</span></div>;
                  })()}
                </div>

                <Button className="w-full" onClick={() => createBill.mutate()} disabled={billItems.length === 0 || createBill.isPending}>
                  {createBill.isPending ? "Creating..." : "Create Bill"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Alerts */}
      {(nearExpiry.length > 0 || expired.length > 0) && (
        <div className="flex gap-3 mb-6 flex-wrap">
          {expired.length > 0 && (
            <div className="flex items-center gap-2 bg-destructive/10 text-destructive rounded-lg px-4 py-2 text-sm">
              <AlertTriangle className="h-4 w-4" /> {expired.length} batch(es) expired
              <button className="underline underline-offset-2 font-medium" onClick={() => setExpiryView("expired")}>View all</button>
            </div>
          )}
          {nearExpiry.length > 0 && (
            <div className="flex items-center gap-2 bg-warning/10 text-warning rounded-lg px-4 py-2 text-sm">
              <AlertTriangle className="h-4 w-4" /> {nearExpiry.length} batch(es) expiring within 90 days
              <button className="underline underline-offset-2 font-medium" onClick={() => setExpiryView("near")}>View all</button>
            </div>
          )}
        </div>
      )}

      {/* Expiring / expired stock detail */}
      <Dialog open={!!expiryView} onOpenChange={(o) => { if (!o) setExpiryView(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{expiryView === "expired" ? "Expired stock" : "Stock expiring within 90 days"}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="text-right">{expiryView === "expired" ? "Expired" : "Days left"}</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Value (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiryRows.map((i: any) => {
                  const days = Math.ceil((new Date(i.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  const value = (Number(i.quantity) || 0) * (Number(i.selling_price ?? i.mrp) || 0);
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.pharma_products?.name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{i.batch_number || "—"}</TableCell>
                      <TableCell>{format(new Date(i.expiry_date), "dd MMM yyyy")}</TableCell>
                      <TableCell className={`text-right ${expiryView === "expired" ? "text-destructive" : "text-warning"}`}>
                        {expiryView === "expired" ? `${Math.abs(days)} day(s) ago` : `${days} day(s)`}
                      </TableCell>
                      <TableCell className="text-right">{i.quantity}</TableCell>
                      <TableCell className="text-right">{value ? value.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}</TableCell>
                    </TableRow>
                  );
                })}
                {expiryRows.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No batches found.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="products">
        <TabsList className="mb-4">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="bills">Bills</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1"><Settings className="h-3.5 w-3.5" /> Customer Portal Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <div className="relative max-w-md mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search products..." className="pl-9 bg-card border" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="data-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>MRP</TableHead>
                  <TableHead>Selling Price</TableHead>
                  <TableHead>GST%</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Reorder Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No products found</TableCell></TableRow>
                ) : filteredProducts.map((p: any) => {
                  const productUnits = unitsByProduct[p.id];
                  const price = getActiveBatchPrice(p, inventory as any, productUnits);
                  return (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => setSelectedProductId(p.id)}>
                    <TableCell>
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{p.name}<br /><span className="text-xs text-muted-foreground">{p.generic_name}</span></TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{p.category}</Badge></TableCell>
                    <TableCell>
                      {price.hasBatch || price.mrp > 0 ? `₹${price.mrp.toFixed(2)}` : <span className="text-xs text-muted-foreground">No batch</span>}
                      {price.subUnitPrice && <div className="text-[11px] text-muted-foreground">₹{price.subUnitPrice.toFixed(2)}/{price.subUnit}</div>}
                    </TableCell>
                    <TableCell>
                      {price.hasBatch || price.sellingPrice > 0 ? `₹${price.sellingPrice.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell>{Number(p.gst_percent)}%</TableCell>
                    <TableCell>
                      {formatProductUnit(p, productUnits)}
                      <div className="text-[11px] text-muted-foreground">
                        Buy: {getPurchaseUom(p, productUnits).name} · Sell: {getSaleUom(p, productUnits).name}
                      </div>
                    </TableCell>
                    <TableCell>{p.reorder_level}</TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </motion.div>
        </TabsContent>

        <TabsContent value="inventory">
          <div className="flex items-center gap-2 mb-3">
            <Label className="text-xs text-muted-foreground">Show stock in</Label>
            <Select value={inventoryUomView} onValueChange={(v) => setInventoryUomView(v as "sale" | "base")}>
              <SelectTrigger className="h-8 w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sale">Selling UOM</SelectItem>
                <SelectItem value="base">Buying / Base UOM</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="data-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Stock in hand</TableHead>
                  <TableHead>Purchase</TableHead>
                  <TableHead>MRP</TableHead>
                  <TableHead>Selling</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No inventory records</TableCell></TableRow>
                ) : inventory.map((i: any) => {
                  const exp = new Date(i.expiry_date);
                  const daysLeft = Math.ceil((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  const isExpired = daysLeft <= 0;
                  const isNear = daysLeft > 0 && daysLeft <= 90;
                  const prod = products.find((p: any) => p.id === i.product_id);
                  const pUnits = unitsByProduct[i.product_id];
                  const baseUnit = prod ? getBaseUnit(prod) : "";
                  const viewUom = inventoryUomView === "sale"
                    ? getSaleUom(prod, pUnits)
                    : findUom(prod, pUnits, i.purchase_unit || prod?.purchase_unit || baseUnit);
                  const baseQty = Number(i.quantity) || 0;
                  const shownQty = toUomQty(baseQty, viewUom.factor);
                  const priceIn = (perBase: number) => perBase / (viewUom.factor || 1);
                  return (
                    <TableRow key={i.id} className="cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => setSelectedInventoryId(i.id)}>
                      <TableCell className="font-medium">{i.pharma_products?.name}</TableCell>
                      <TableCell>{i.batch_number}</TableCell>
                      <TableCell>
                        <span className="font-medium">{fmtQty(shownQty)} {viewUom.name}</span>
                        {!viewUom.isBase && baseUnit && (
                          <div className="text-[11px] text-muted-foreground">{fmtQty(baseQty)} {baseUnit}</div>
                        )}
                      </TableCell>
                      <TableCell>₹{priceIn(Number(i.purchase_price) || 0).toFixed(2)}<div className="text-[11px] text-muted-foreground">/{viewUom.name}</div></TableCell>
                      <TableCell>₹{priceIn(Number(i.mrp) || 0).toFixed(2)}</TableCell>
                      <TableCell>₹{priceIn(Number(i.selling_price || i.mrp) || 0).toFixed(2)}</TableCell>
                      <TableCell>{exp.toLocaleDateString()}</TableCell>
                      <TableCell className="text-muted-foreground">{(() => {
                        if (!i.supplier) return "—";
                        const vendor = vendors.find((v: any) => v.id === i.supplier);
                        return vendor ? vendor.name : i.supplier;
                      })()}</TableCell>
                      <TableCell>
                        {isExpired ? <Badge variant="destructive" className="text-xs">Expired</Badge>
                          : isNear ? <Badge className="bg-warning/20 text-warning border-warning/30 text-xs">Expiring Soon</Badge>
                          : <Badge variant="secondary" className="text-xs">OK</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </motion.div>
        </TabsContent>

        <TabsContent value="bills">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="data-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No bills yet</TableCell></TableRow>
                ) : bills.map((b: any) => (
                  <TableRow key={b.id} className="cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => setSelectedBillId(b.id)}>
                    <TableCell className="font-medium">{b.bill_number}</TableCell>
                    <TableCell>{new Date(b.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>{b.patient_name || "—"}</TableCell>
                    <TableCell>₹{Number(b.total_amount).toFixed(2)}</TableCell>
                    <TableCell>₹{Number(b.discount).toFixed(2)}</TableCell>
                    <TableCell className="font-semibold">₹{Number(b.net_amount).toFixed(2)}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{b.payment_mode}</Badge></TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{b.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </motion.div>
        </TabsContent>

        <TabsContent value="settings">
          <div className="max-w-2xl space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-display">Customer Portal Configuration</CardTitle>
                <CardDescription>Toggle which sections patients see in their portal. Each switch instantly shows or hides that section.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Appointments */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Appointments</p>
                  <div className="space-y-3">
                    <ToggleRow label="Enable Appointment Booking" desc="Allow patients to request appointments from the portal" checked={settingsForm.appointments_booking_enabled} onChange={(v) => setSettingsForm({ ...settingsForm, appointments_booking_enabled: v })} />
                    <ToggleRow label="Enable Cancellation / Reschedule" desc="Show cancel and reschedule controls on patient appointments" checked={settingsForm.appointments_reschedule_enabled} onChange={(v) => setSettingsForm({ ...settingsForm, appointments_reschedule_enabled: v })} />
                  </div>
                </div>

                {/* History */}
                <div className="border-t pt-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">History</p>
                  <div className="space-y-3">
                    <ToggleRow label="Enable Treatment History" desc="Show past treatments to patients" checked={settingsForm.treatment_history_enabled} onChange={(v) => setSettingsForm({ ...settingsForm, treatment_history_enabled: v })} />
                    <ToggleRow label="Enable Procedure History" desc="Show clinical procedure records to patients" checked={settingsForm.procedure_history_enabled} onChange={(v) => setSettingsForm({ ...settingsForm, procedure_history_enabled: v })} />
                  </div>
                </div>

                {/* Photos */}
                <div className="border-t pt-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Photos</p>
                  <ToggleRow label="Enable Clinical Photos" desc="Allow patients to view their before / after photos" checked={settingsForm.clinical_photos_enabled} onChange={(v) => setSettingsForm({ ...settingsForm, clinical_photos_enabled: v })} />
                </div>

                {/* Bills */}
                <div className="border-t pt-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Bills</p>
                  <div className="space-y-3">
                    <ToggleRow label="Enable Bills / Invoices" desc="Show invoice list and statuses to patients" checked={settingsForm.bills_enabled} onChange={(v) => setSettingsForm({ ...settingsForm, bills_enabled: v })} />
                    <ToggleRow label="Show Outstanding Balance" desc="Display total outstanding amount on the home screen" checked={settingsForm.outstanding_balance_enabled} onChange={(v) => setSettingsForm({ ...settingsForm, outstanding_balance_enabled: v })} />
                  </div>
                </div>

                {/* Surveys */}
                <div className="border-t pt-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Surveys</p>
                  <ToggleRow label="Enable Surveys" desc="Let patients fill assigned and self-serve surveys" checked={settingsForm.surveys_enabled} onChange={(v) => setSettingsForm({ ...settingsForm, surveys_enabled: v })} />
                </div>

                {/* AI Bot */}
                <div className="border-t pt-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">AI Bot</p>
                  <ToggleRow label="Enable AI Bot" desc="Show the AI assistant tab in the portal" checked={settingsForm.ai_bot_enabled} onChange={(v) => setSettingsForm({ ...settingsForm, ai_bot_enabled: v })} />
                </div>

                {/* Our Team */}
                <div className="border-t pt-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Our Team</p>
                  <ToggleRow label="Enable Our Team Section" desc="Show the team / doctors block on the home screen. Manage which staff appear from the Staff module." checked={settingsForm.our_team_enabled} onChange={(v) => setSettingsForm({ ...settingsForm, our_team_enabled: v })} />
                </div>

                {/* Clinic Hours */}
                <div className="border-t pt-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Clinic Hours</p>
                  <ToggleRow label="Enable Clinic Hours Display" desc="Show opening hours on the patient home screen" checked={settingsForm.clinic_hours_enabled} onChange={(v) => setSettingsForm({ ...settingsForm, clinic_hours_enabled: v })} />
                </div>

                {/* Quick Actions */}
                <div className="border-t pt-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Quick Actions</p>
                  <div className="space-y-3">
                    <ToggleRow label='Enable "Request Appointment" button' desc="Show the request-appointment shortcut on the home screen" checked={settingsForm.quick_action_request_appointment_enabled} onChange={(v) => setSettingsForm({ ...settingsForm, quick_action_request_appointment_enabled: v })} />
                    <ToggleRow label='Enable "Order Medicine" button' desc="Show the order-medicine shortcut on the home screen" checked={settingsForm.quick_action_order_medicine_enabled} onChange={(v) => setSettingsForm({ ...settingsForm, quick_action_order_medicine_enabled: v })} />
                  </div>
                </div>

                {/* Shop / Pharmacy */}
                <div className="border-t pt-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Shop / Pharmacy</p>
                  <ToggleRow label="Enable Shop" desc="Toggle the entire shop on/off for patients" checked={settingsForm.shop_enabled} onChange={(v) => setSettingsForm({ ...settingsForm, shop_enabled: v })} />
                </div>

                <div className="border-t pt-4">
                  <Label className="text-sm font-medium">When a product is Out of Stock</Label>
                  <RadioGroup value={settingsForm.out_of_stock_behavior} onValueChange={(v) => setSettingsForm({ ...settingsForm, out_of_stock_behavior: v })} className="mt-3 space-y-3">
                    <div className="flex items-start gap-3">
                      <RadioGroupItem value="hide" id="oos-hide" className="mt-0.5" />
                      <div>
                        <Label htmlFor="oos-hide" className="text-sm font-medium cursor-pointer">Hide product</Label>
                        <p className="text-xs text-muted-foreground">Don't show the product on the portal at all</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <RadioGroupItem value="show_out_of_stock" id="oos-show" className="mt-0.5" />
                      <div>
                        <Label htmlFor="oos-show" className="text-sm font-medium cursor-pointer">Show as Out of Stock</Label>
                        <p className="text-xs text-muted-foreground">Display with an "Out of Stock" badge and disable Add to Cart</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <RadioGroupItem value="accept_backorders" id="oos-backorder" className="mt-0.5" />
                      <div>
                        <Label htmlFor="oos-backorder" className="text-sm font-medium cursor-pointer">Accept backorders</Label>
                        <p className="text-xs text-muted-foreground">Allow patients to order with a "Currently unavailable — we will deliver within 2-3 working days" message</p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Hide Expiring Products</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Hide products with all batches expiring within {settingsForm.expiring_threshold_days} days</p>
                    </div>
                    <Switch checked={settingsForm.hide_expiring_products} onCheckedChange={(v) => setSettingsForm({ ...settingsForm, hide_expiring_products: v })} />
                  </div>
                  {settingsForm.hide_expiring_products && (
                    <div className="mt-3">
                      <Label className="text-xs">Expiry threshold (days)</Label>
                      <Input type="number" className="mt-1 w-32" value={settingsForm.expiring_threshold_days} onChange={(e) => setSettingsForm({ ...settingsForm, expiring_threshold_days: parseInt(e.target.value) || 90 })} />
                    </div>
                  )}
                </div>

                <div className="border-t pt-4">
                  <Label className="text-sm font-medium">Low Stock Threshold Override</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Override the per-product reorder level for "Low Stock" warnings. Leave empty to use each product's reorder level.</p>
                  <Input type="number" className="mt-2 w-32" placeholder="Use reorder level" value={settingsForm.low_stock_threshold ?? ""} onChange={(e) => setSettingsForm({ ...settingsForm, low_stock_threshold: e.target.value ? parseInt(e.target.value) : null })} />
                </div>

                <Button className="w-full" onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
                  {saveSettings.isPending ? "Saving..." : "Save Settings"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Detail Sheets */}
      <ProductDetailSheet
        productId={selectedProductId}
        onClose={() => setSelectedProductId(null)}
        onClone={handleCloneProduct}
        onAddStock={(pid) => {
          setStockForm({ ...emptyStock, product_id: pid });
          setStockOpen(true);
        }}
      />
      <InventoryDetailSheet
        inventoryId={selectedInventoryId}
        onClose={() => setSelectedInventoryId(null)}
        onClone={handleCloneInventory}
        products={products}
      />
      <BillDetailSheet
        billId={selectedBillId}
        onClose={() => setSelectedBillId(null)}
        onClone={handleCloneBill}
      />
    </div>
  );
};

export default Pharma;
