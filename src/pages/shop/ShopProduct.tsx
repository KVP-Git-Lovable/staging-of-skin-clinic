import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Package, ShoppingCart, Plus, Minus, Play, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { formatProductUnit } from "@/lib/unitDisplay";
import { useProductUnits, usePharmaProductUnits } from "@/hooks/usePharmaProductUnits";
import { motion } from "framer-motion";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

import sampleSerum from "@/assets/sample-products/serum.jpg";
import sampleMoisturizer from "@/assets/sample-products/moisturizer.jpg";
import sampleSunscreen from "@/assets/sample-products/sunscreen.jpg";
import sampleCleanser from "@/assets/sample-products/cleanser.jpg";
import sampleToner from "@/assets/sample-products/toner.jpg";
import sampleEyecream from "@/assets/sample-products/eyecream.jpg";

const sampleImages = [sampleSerum, sampleMoisturizer, sampleSunscreen, sampleCleanser, sampleToner, sampleEyecream];
const getSampleImage = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes("serum")) return sampleSerum;
  if (lower.includes("moistur") || lower.includes("cream")) return sampleMoisturizer;
  if (lower.includes("sun") || lower.includes("spf")) return sampleSunscreen;
  if (lower.includes("clean") || lower.includes("wash") || lower.includes("foam")) return sampleCleanser;
  if (lower.includes("toner") || lower.includes("tonic")) return sampleToner;
  if (lower.includes("eye")) return sampleEyecream;
  return sampleImages[Math.floor(Math.random() * sampleImages.length)];
};

const generateDescription = (product: any) =>
  `${product.name} is a premium dermatologist-recommended skincare product designed for effective results. Formulated with clinically proven ingredients${product.generic_name ? ` including ${product.generic_name}` : ""}, this product is suitable for daily use and helps improve overall skin health.`;

const generateInstructions = (product: any) => [
  "Cleanse your face thoroughly before application.",
  `Apply a small amount of ${product.name} evenly on the affected area.`,
  "Gently massage in circular motions until fully absorbed.",
  "Use twice daily — morning and night — for best results.",
  "Follow up with sunscreen during daytime use.",
  "Avoid contact with eyes. In case of irritation, discontinue use.",
];

const generateFAQ = (product: any) => [
  { q: `How often should I use ${product.name}?`, a: "For best results, use twice daily — once in the morning and once at night after cleansing." },
  { q: "Is this product suitable for sensitive skin?", a: "Yes, this product is dermatologically tested and suitable for most skin types including sensitive skin. We recommend a patch test before first use." },
  { q: "Can I use this with other skincare products?", a: "Yes, this product can be layered with your existing skincare routine. Apply lighter products first, followed by heavier creams." },
  { q: "How long before I see results?", a: "Most users notice visible improvement within 4-6 weeks of consistent use. Individual results may vary." },
  { q: "Does this product contain parabens or sulfates?", a: "Our products are formulated without harmful parabens and sulfates, ensuring gentle care for your skin." },
];

const ShopProduct = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, patientId } = useAuth();
  const { addToCart, cartItems, updateQuantity, removeFromCart } = useCart(patientId);
  const { data: productUnits = [] } = useProductUnits(id);
  const { data: allUnitsData } = usePharmaProductUnits();
  const unitsByProduct = allUnitsData?.byProduct || {};

  const { data: product, isLoading } = useQuery({
    queryKey: ["shop-product", id],
    queryFn: async () => {
      const { data } = await supabase.from("pharma_products").select("*").eq("id", id!).single();
      return data;
    },
    enabled: !!id,
  });

  const { data: portalSettings } = useQuery({
    queryKey: ["portal-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("portal_settings").select("*").limit(1).single();
      return data;
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

  const stock = useMemo(() => {
    if (!id) return 0;
    let total = 0;
    for (const inv of inventoryData) {
      if (inv.product_id === id) total += Number(inv.quantity);
    }
    for (const item of billItemsData) {
      if (item.product_id === id) total -= Number(item.quantity);
    }
    return Math.max(total, 0);
  }, [id, inventoryData, billItemsData]);

  const settings = portalSettings || {
    out_of_stock_behavior: "show_out_of_stock",
    hide_expiring_products: false,
    expiring_threshold_days: 90,
    shop_enabled: true,
    low_stock_threshold: null,
  };

  const isOutOfStock = stock <= 0;
  const isBackorder = isOutOfStock && settings.out_of_stock_behavior === "accept_backorders";
  const isDisabled = isOutOfStock && settings.out_of_stock_behavior === "show_out_of_stock";

  const { data: similarProducts = [] } = useQuery({
    queryKey: ["similar-products", product?.category, id],
    queryFn: async () => {
      const { data } = await supabase
        .from("pharma_products")
        .select("*")
        .eq("category", product!.category)
        .neq("id", id!)
        .limit(6);
      return data || [];
    },
    enabled: !!product?.category,
  });

  const cartQty = cartItems.find(i => i.productId === id)?.quantity || 0;

  const handleAdd = () => {
    if (!user) { navigate("/login"); return; }
    if (!product) return;
    addToCart.mutate(product, {
      onSuccess: () => toast.success(`${product.name} added to cart`),
    });
  };

  const handleQtyChange = (delta: number) => {
    if (!user || !id) return;
    const newQty = cartQty + delta;
    if (newQty <= 0) {
      removeFromCart.mutate(id);
    } else {
      updateQuantity.mutate({ productId: id, delta });
    }
  };

  if (isLoading) return <div className="text-center py-20 text-muted-foreground">Loading...</div>;
  if (!product) return <div className="text-center py-20 text-muted-foreground">Product not found</div>;

  const imgSrc = product.image_url || getSampleImage(product.name);
  const instructions = generateInstructions(product);
  const faqs = generateFAQ(product);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => navigate("/shop")}>
        <ArrowLeft className="h-4 w-4" /> Back to Shop
      </Button>

      {/* Product Hero */}
      <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
        <div className="md:flex">
          <img src={imgSrc} alt={product.name} className="h-64 md:h-80 md:w-1/2 w-full object-cover" />
          <div className="p-5 md:p-6 flex-1 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary">{product.category}</Badge>
                <span className="text-xs text-muted-foreground">UOM: {formatProductUnit(product, productUnits)}</span>
              </div>
              <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">{product.name}</h1>
              {product.generic_name && <p className="text-sm text-muted-foreground mt-1">{product.generic_name}</p>}
              {product.manufacturer && <p className="text-xs text-muted-foreground">by {product.manufacturer}</p>}
            </div>

            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-primary">₹{product.selling_price}</span>
              {product.mrp > product.selling_price && (
                <>
                  <span className="text-lg line-through text-muted-foreground">₹{product.mrp}</span>
                  <Badge className="bg-[hsl(var(--chart-2))]/10 text-[hsl(var(--chart-2))]">
                    {Math.round((1 - product.selling_price / product.mrp) * 100)}% off
                  </Badge>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">Unit:</span> {formatProductUnit(product, productUnits)}</div>
              {product.hsn_code && <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">HSN:</span> {product.hsn_code}</div>}
            </div>

            {/* Stock status badges */}
            {isOutOfStock && settings.out_of_stock_behavior === "show_out_of_stock" && (
              <Badge variant="destructive" className="w-fit">Out of Stock</Badge>
            )}

            {/* Backorder message */}
            {isBackorder && (
              <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Currently unavailable — we will deliver within 2-3 working days</span>
              </div>
            )}

            {/* Cart quantity or Add button */}
            {isDisabled ? (
              <Button className="w-full h-12 text-base gap-2" disabled>
                Out of Stock
              </Button>
            ) : cartQty === 0 ? (
              <Button className="w-full h-12 text-base gap-2" onClick={handleAdd}>
                <ShoppingCart className="h-5 w-5" /> Add to Cart
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-primary/5 rounded-xl px-3 py-2 flex-1 justify-center">
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => handleQtyChange(-1)}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="text-lg font-bold text-primary w-10 text-center">{cartQty}</span>
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => handleQtyChange(1)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <Button variant="outline" className="h-12" onClick={() => navigate("/shop/cart")}>
                  View Cart
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="bg-card rounded-xl border p-5 shadow-sm space-y-3">
        <h2 className="text-lg font-display font-bold text-foreground">About this Product</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{generateDescription(product)}</p>
      </div>

      {/* Video Section */}
      <div className="bg-card rounded-xl border p-5 shadow-sm space-y-3">
        <h2 className="text-lg font-display font-bold text-foreground">Product Video</h2>
        <div className="relative bg-muted rounded-xl aspect-video flex items-center justify-center cursor-pointer group overflow-hidden">
          <img src={imgSrc} alt="" className="w-full h-full object-cover opacity-60" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-16 w-16 rounded-full bg-primary/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Play className="h-7 w-7 text-primary-foreground ml-1" />
            </div>
          </div>
          <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-muted-foreground">Video coming soon</p>
        </div>
      </div>

      {/* How to Use */}
      <div className="bg-card rounded-xl border p-5 shadow-sm space-y-3">
        <h2 className="text-lg font-display font-bold text-foreground">How to Use</h2>
        <ol className="space-y-2">
          {instructions.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="flex-shrink-0 h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{i + 1}</span>
              <span className="text-muted-foreground pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* FAQ */}
      <div className="bg-card rounded-xl border p-5 shadow-sm space-y-3">
        <h2 className="text-lg font-display font-bold text-foreground">Frequently Asked Questions</h2>
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-sm text-left font-medium">{faq.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">{faq.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      {/* Similar Products */}
      {similarProducts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-display font-bold text-foreground">You May Also Like</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {similarProducts.map((sp: any, idx: number) => {
              const spImg = sp.image_url || sampleImages[idx % sampleImages.length];
              return (
                <motion.div
                  key={sp.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-card rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/shop/product/${sp.id}`)}
                >
                  <img src={spImg} alt={sp.name} className="h-28 md:h-32 w-full object-cover" />
                  <div className="p-2.5">
                    <p className="text-xs text-muted-foreground">{formatProductUnit(sp, unitsByProduct[sp.id])}</p>
                    <h3 className="text-sm font-semibold text-foreground line-clamp-1">{sp.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-bold text-primary">₹{sp.selling_price}</span>
                      {sp.mrp > sp.selling_price && (
                        <span className="text-xs line-through text-muted-foreground">₹{sp.mrp}</span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ShopProduct;
