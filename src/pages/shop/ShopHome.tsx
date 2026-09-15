import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Package, ShoppingCart, Plus, Minus, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { formatProductUnit } from "@/lib/unitDisplay";
import { usePharmaProductUnits } from "@/hooks/usePharmaProductUnits";
import { toast } from "sonner";
import { motion } from "framer-motion";

import sampleSerum from "@/assets/sample-products/serum.jpg";
import sampleMoisturizer from "@/assets/sample-products/moisturizer.jpg";
import sampleSunscreen from "@/assets/sample-products/sunscreen.jpg";
import sampleCleanser from "@/assets/sample-products/cleanser.jpg";
import sampleToner from "@/assets/sample-products/toner.jpg";
import sampleEyecream from "@/assets/sample-products/eyecream.jpg";

const sampleImages = [sampleSerum, sampleMoisturizer, sampleSunscreen, sampleCleanser, sampleToner, sampleEyecream];
const getSampleImage = (name: string, index: number) => {
  const lower = name.toLowerCase();
  if (lower.includes("serum")) return sampleSerum;
  if (lower.includes("moistur") || lower.includes("cream")) return sampleMoisturizer;
  if (lower.includes("sun") || lower.includes("spf")) return sampleSunscreen;
  if (lower.includes("clean") || lower.includes("wash") || lower.includes("foam")) return sampleCleanser;
  if (lower.includes("toner") || lower.includes("tonic")) return sampleToner;
  if (lower.includes("eye")) return sampleEyecream;
  return sampleImages[index % sampleImages.length];
};

const ShopHome = () => {
  const navigate = useNavigate();
  const { user, patientId } = useAuth();
  const { addToCart, cartItems, updateQuantity, removeFromCart } = useCart(patientId);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const { data: unitsData } = usePharmaProductUnits();
  const unitsByProduct = unitsData?.byProduct || {};

  const { data: portalSettings } = useQuery({
    queryKey: ["portal-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("portal_settings").select("*").limit(1).single();
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["shop-products"],
    queryFn: async () => {
      const { data } = await supabase.from("pharma_products").select("*").order("name");
      return data || [];
    },
  });

  const { data: inventoryData = [] } = useQuery({
    queryKey: ["shop-inventory-stock"],
    queryFn: async () => {
      const { data } = await supabase.from("pharma_inventory").select("product_id, quantity, expiry_date");
      return data || [];
    },
  });

  const { data: billItemsData = [] } = useQuery({
    queryKey: ["shop-bill-items-consumed"],
    queryFn: async () => {
      const { data } = await supabase.from("pharma_bill_items").select("product_id, quantity");
      return data || [];
    },
  });

  // Compute stock per product
  const stockMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const inv of inventoryData) {
      if (inv.product_id) map[inv.product_id] = (map[inv.product_id] || 0) + Number(inv.quantity);
    }
    for (const item of billItemsData) {
      if (item.product_id) map[item.product_id] = (map[item.product_id] || 0) - Number(item.quantity);
    }
    // Clamp to 0
    for (const k of Object.keys(map)) {
      if (map[k] < 0) map[k] = 0;
    }
    return map;
  }, [inventoryData, billItemsData]);

  // Compute earliest expiry per product
  const expiryMap = useMemo(() => {
    const map: Record<string, Date | null> = {};
    for (const inv of inventoryData) {
      if (!inv.product_id || Number(inv.quantity) <= 0) continue;
      const exp = new Date(inv.expiry_date);
      if (!map[inv.product_id] || exp < map[inv.product_id]!) {
        map[inv.product_id] = exp;
      }
    }
    return map;
  }, [inventoryData]);

  const settings = portalSettings || {
    out_of_stock_behavior: "show_out_of_stock",
    hide_expiring_products: false,
    expiring_threshold_days: 90,
    shop_enabled: true,
    low_stock_threshold: null,
  };

  // If shop disabled
  if (settings.shop_enabled === false) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center px-4">
        <Package className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">Shop is currently unavailable</h2>
        <p className="text-muted-foreground">Please check back later.</p>
      </div>
    );
  }

  const categories = ["all", ...Array.from(new Set(products.map((p: any) => p.category)))];

  // Apply filters
  const filtered = products.filter((p: any) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.generic_name || "").toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === "all" || p.category === categoryFilter;
    if (!matchSearch || !matchCat) return false;

    const stock = stockMap[p.id] || 0;

    // Hide out-of-stock products if behavior is 'hide'
    if (stock <= 0 && settings.out_of_stock_behavior === "hide") return false;

    // Hide expiring products
    if (settings.hide_expiring_products) {
      const earliest = expiryMap[p.id];
      if (earliest) {
        const daysLeft = Math.ceil((earliest.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysLeft <= (settings.expiring_threshold_days || 90) && daysLeft > 0) return false;
      }
    }

    return true;
  });

  const getCartQty = (productId: string) => {
    const item = cartItems.find(i => i.productId === productId);
    return item?.quantity || 0;
  };

  const handleAddToCart = (product: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!user) {
      toast.error("Please sign in to add items to cart");
      navigate("/login");
      return;
    }
    addToCart.mutate(product, {
      onSuccess: () => toast.success(`${product.name} added to cart`),
    });
  };

  const handleUpdateQty = (productId: string, delta: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!user) return;
    const qty = getCartQty(productId);
    if (qty + delta <= 0) {
      removeFromCart.mutate(productId);
    } else {
      updateQuantity.mutate({ productId, delta });
    }
  };

  return (
    <div>
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary/10 via-accent to-background py-12 md:py-20 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-5xl font-display font-bold text-foreground mb-3"
          >
            Simply. Better. Skin.
          </motion.h1>
          <p className="text-muted-foreground md:text-lg mb-8 max-w-md mx-auto">
            Premium skincare products recommended by our dermatologists
          </p>
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              className="pl-10 h-12 bg-card border shadow-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Category filters */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                categoryFilter === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat === "all" ? "All" : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product grid */}
      <div className="max-w-6xl mx-auto px-4 pb-12">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No products found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {filtered.map((product: any, idx: number) => {
              const qty = getCartQty(product.id);
              const imgSrc = product.image_url || getSampleImage(product.name, idx);
              const stock = stockMap[product.id] || 0;
              const isOutOfStock = stock <= 0;
              const isBackorder = isOutOfStock && settings.out_of_stock_behavior === "accept_backorders";
              const isDisabled = isOutOfStock && settings.out_of_stock_behavior === "show_out_of_stock";

              return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`bg-card rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow group cursor-pointer ${isDisabled ? "opacity-75" : ""}`}
                  onClick={() => navigate(`/shop/product/${product.id}`)}
                >
                  <div className="relative">
                    <img src={imgSrc} alt={product.name} className="h-32 md:h-40 w-full object-cover" />
                    {isOutOfStock && settings.out_of_stock_behavior === "show_out_of_stock" && (
                      <div className="absolute top-2 right-2">
                        <Badge variant="destructive" className="text-[10px]">Out of Stock</Badge>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-1 mb-1">
                      <Badge variant="secondary" className="text-[10px]">{product.category}</Badge>
                      <span className="text-[10px] text-muted-foreground ml-auto">{formatProductUnit(product, unitsByProduct[product.id])}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-tight">{product.name}</h3>
                    {product.generic_name && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{product.generic_name}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-primary">₹{product.selling_price}</span>
                        {product.mrp > product.selling_price && (
                          <>
                            <span className="text-xs line-through text-muted-foreground">₹{product.mrp}</span>
                            <Badge className="bg-[hsl(var(--chart-2))]/10 text-[hsl(var(--chart-2))] text-[9px] px-1.5 py-0">
                              {Math.round((1 - product.selling_price / product.mrp) * 100)}% off
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Backorder message */}
                    {isBackorder && (
                      <div className="mt-1.5 flex items-start gap-1 text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded px-1.5 py-1">
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                        <span>Currently unavailable — we will deliver within 2-3 working days</span>
                      </div>
                    )}

                    {/* Quantity controls */}
                    <div className="mt-2" onClick={e => e.stopPropagation()}>
                      {isDisabled ? (
                        <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1" disabled>
                          Out of Stock
                        </Button>
                      ) : qty === 0 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-8 text-xs gap-1"
                          onClick={(e) => handleAddToCart(product, e)}
                        >
                          <ShoppingCart className="h-3 w-3" /> Add to Cart
                        </Button>
                      ) : (
                        <div className="flex items-center justify-between bg-primary/5 rounded-lg px-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => handleUpdateQty(product.id, -1, e)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="text-sm font-semibold text-primary">{qty}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => handleUpdateQty(product.id, 1, e)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ShopHome;
