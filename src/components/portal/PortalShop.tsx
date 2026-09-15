import { useState } from "react";
import { Search, ShoppingCart, Plus, Minus, X, Trash2, MapPin, Truck, Store, ArrowLeft, Package, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { portalRequest } from "@/lib/portalApi";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatProductUnit } from "@/lib/unitDisplay";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  gstPercent: number;
}

interface PortalShopProps {
  patientId: string;
  patientName: string;
}

const PortalShop = ({ patientId, patientName }: PortalShopProps) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [cart, setCart] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem(`cart_${patientId}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [view, setView] = useState<"browse" | "cart" | "checkout" | "orders" | "product">("browse");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [deliveryMethod, setDeliveryMethod] = useState("pickup");
  const [address, setAddress] = useState({ address: "", city: "", state: "", pincode: "", phone: "" });
  const [orderNotes, setOrderNotes] = useState("");

  const saveCart = (items: CartItem[]) => {
    setCart(items);
    localStorage.setItem(`cart_${patientId}`, JSON.stringify(items));
  };

  const { data: products = [] } = useQuery({
    queryKey: ["shop-products"],
    queryFn: async () => {
      const { data } = await supabase.from("pharma_products").select("*").order("name");
      return data || [];
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["portal-orders", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("portal_orders")
        .select("*, portal_order_items(*)")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: patientData } = useQuery({
    queryKey: ["shop-patient", patientId],
    queryFn: async () => {
      return await portalRequest("shop_address");
    },
  });

  const placeOrder = useMutation({
    mutationFn: async () => {
      const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
      const gst = cart.reduce((s, i) => s + (i.price * i.quantity * i.gstPercent) / 100, 0);
      const grandTotal = total + gst;
      const { data: order, error } = await supabase.from("portal_orders").insert({
        patient_id: patientId,
        patient_name: patientName,
        delivery_method: deliveryMethod,
        address: deliveryMethod === "delivery" ? address.address : null,
        city: deliveryMethod === "delivery" ? address.city : null,
        state: deliveryMethod === "delivery" ? address.state : null,
        pincode: deliveryMethod === "delivery" ? address.pincode : null,
        phone: address.phone || patientData?.phone,
        total_amount: grandTotal,
        notes: orderNotes || null,
      }).select().single();
      if (error) throw error;

      const items = cart.map(item => ({
        order_id: order.id,
        product_id: item.productId,
        product_name: item.name,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.price * item.quantity,
      }));
      const { error: itemsError } = await supabase.from("portal_order_items").insert(items);
      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      saveCart([]);
      queryClient.invalidateQueries({ queryKey: ["portal-orders"] });
      toast.success("Order placed successfully!");
      setView("orders");
      setOrderNotes("");
    },
    onError: () => toast.error("Failed to place order"),
  });

  const addToCart = (product: any) => {
    const existing = cart.find(i => i.productId === product.id);
    if (existing) {
      saveCart(cart.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      saveCart([...cart, { productId: product.id, name: product.name, price: product.selling_price, quantity: 1, category: product.category, gstPercent: Number(product.gst_percent) || 0 }]);
    }
    toast.success(`${product.name} added to cart`);
  };

  const updateQty = (productId: string, delta: number) => {
    const updated = cart.map(i => i.productId === productId ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i);
    saveCart(updated);
  };

  const removeFromCart = (productId: string) => {
    saveCart(cart.filter(i => i.productId !== productId));
  };

  const categories = ["all", ...Array.from(new Set(products.map((p: any) => p.category)))];
  const filtered = products.filter((p: any) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.generic_name || "").toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === "all" || p.category === categoryFilter;
    return matchSearch && matchCat;
  });

  const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartGst = cart.reduce((s, i) => s + (i.price * i.quantity * i.gstPercent) / 100, 0);
  const cartGrandTotal = cartTotal + cartGst;
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const orderStatusColors: Record<string, string> = {
    Pending: "bg-warning/10 text-warning",
    Confirmed: "bg-primary/10 text-primary",
    Processing: "bg-primary/10 text-primary",
    Shipped: "bg-accent/10 text-accent-foreground",
    Delivered: "bg-success/10 text-success",
    Cancelled: "bg-destructive/10 text-destructive",
  };

  // ─── PRODUCT DETAIL VIEW ───
  if (view === "product" && selectedProduct) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => setView("browse")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
          {selectedProduct.image_url ? (
            <img src={selectedProduct.image_url} alt={selectedProduct.name} className="h-48 w-full object-cover" />
          ) : (
            <div className="h-48 bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center">
              <Package className="h-20 w-20 text-primary/30" />
            </div>
          )}
          <div className="p-4 space-y-3">
            <div>
              <Badge variant="secondary" className="text-xs mb-2">{selectedProduct.category}</Badge>
              <h2 className="text-lg font-bold">{selectedProduct.name}</h2>
              {selectedProduct.generic_name && <p className="text-sm text-muted-foreground">{selectedProduct.generic_name}</p>}
              {selectedProduct.manufacturer && <p className="text-xs text-muted-foreground">by {selectedProduct.manufacturer}</p>}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-primary">₹{selectedProduct.selling_price}</span>
              {selectedProduct.mrp > selectedProduct.selling_price && (
                <>
                  <span className="text-sm line-through text-muted-foreground">₹{selectedProduct.mrp}</span>
                  <Badge className="bg-success/10 text-success text-xs">
                    {Math.round((1 - selectedProduct.selling_price / selectedProduct.mrp) * 100)}% off
                  </Badge>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-muted/50 rounded-lg p-2"><span className="text-muted-foreground">Unit:</span> {formatProductUnit(selectedProduct)}</div>
              {selectedProduct.hsn_code && <div className="bg-muted/50 rounded-lg p-2"><span className="text-muted-foreground">HSN:</span> {selectedProduct.hsn_code}</div>}
            </div>
            <Button className="w-full gap-2" onClick={() => { addToCart(selectedProduct); }}>
              <ShoppingCart className="h-4 w-4" /> Add to Cart
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ─── ORDERS VIEW ───
  if (view === "orders") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">My Orders</h2>
          <Button variant="outline" size="sm" onClick={() => setView("browse")}>Continue Shopping</Button>
        </div>
        {orders.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No orders yet</p>
          </div>
        ) : orders.map((o: any) => (
          <div key={o.id} className="bg-card rounded-xl border p-4 shadow-sm space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Order #{o.id.slice(0, 8)}</p>
                <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${orderStatusColors[o.status] || ""}`}>{o.status}</span>
            </div>
            <div className="space-y-1">
              {(o.portal_order_items || []).map((item: any) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>{item.product_name} × {item.quantity}</span>
                  <span className="font-medium">₹{Number(item.total_price).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm pt-1 border-t">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-primary">₹{Number(o.total_amount).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {o.delivery_method === "delivery" ? <Truck className="h-3 w-3" /> : <Store className="h-3 w-3" />}
              {o.delivery_method === "delivery" ? "Delivery" : "Clinic Pickup"}
              {o.tracking_number && <span className="ml-auto">Tracking: {o.tracking_number}</span>}
            </div>
          </div>
        ))}
      </motion.div>
    );
  }

  // ─── CART VIEW ───
  if (view === "cart") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">Cart ({cartCount})</h2>
          <Button variant="ghost" size="sm" onClick={() => setView("browse")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Shop
          </Button>
        </div>
        {cart.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Your cart is empty</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setView("browse")}>Browse Products</Button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {cart.map(item => (
                <div key={item.productId} className="bg-card rounded-xl border p-3 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.category}</p>
                      <p className="text-sm font-semibold text-primary mt-1">₹{item.price} each</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeFromCart(item.productId)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.productId, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="text-sm font-semibold w-8 text-center">{item.quantity}</span>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.productId, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <span className="ml-auto font-bold text-sm">₹{(item.price * item.quantity).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-card rounded-xl border p-4 shadow-sm">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Subtotal ({cartCount} items)</span>
                <span className="font-semibold">₹{cartTotal.toLocaleString()}</span>
              </div>
              <Button className="w-full mt-3" onClick={() => {
                if (patientData) {
                  setAddress({
                    address: patientData.address || "",
                    city: patientData.city || "",
                    state: patientData.state || "",
                    pincode: patientData.pincode || "",
                    phone: patientData.phone || "",
                  });
                }
                setView("checkout");
              }}>
                Proceed to Checkout <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </>
        )}
      </motion.div>
    );
  }

  // ─── CHECKOUT VIEW ───
  if (view === "checkout") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">Checkout</h2>
          <Button variant="ghost" size="sm" onClick={() => setView("cart")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Cart
          </Button>
        </div>

        {/* Order summary */}
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Order Summary</p>
          {cart.map(item => (
            <div key={item.productId} className="flex justify-between text-sm py-1">
              <span>{item.name} × {item.quantity}</span>
              <span>₹{(item.price * item.quantity).toLocaleString()}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm pt-2 border-t mt-2">
            <span className="text-muted-foreground">Subtotal</span>
            <span>₹{cartTotal.toLocaleString()}</span>
          </div>
          {cartGst > 0 && (
            <div className="flex justify-between text-sm py-0.5">
              <span className="text-muted-foreground">GST</span>
              <span>₹{cartGst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold pt-1 border-t mt-1">
            <span>Grand Total</span>
            <span className="text-primary">₹{cartGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Delivery method */}
        <div className="bg-card rounded-xl border p-4 shadow-sm space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Delivery Method</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`p-3 rounded-xl border-2 text-center transition-all ${deliveryMethod === "pickup" ? "border-primary bg-primary/5" : "border-border"}`}
              onClick={() => setDeliveryMethod("pickup")}
            >
              <Store className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-sm font-medium">Clinic Pickup</p>
              <p className="text-xs text-muted-foreground">Free</p>
            </button>
            <button
              className={`p-3 rounded-xl border-2 text-center transition-all ${deliveryMethod === "delivery" ? "border-primary bg-primary/5" : "border-border"}`}
              onClick={() => setDeliveryMethod("delivery")}
            >
              <Truck className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-sm font-medium">Home Delivery</p>
              <p className="text-xs text-muted-foreground">Shipping applies</p>
            </button>
          </div>
        </div>

        {/* Address - delivery only */}
        {deliveryMethod === "delivery" && (
          <div className="bg-card rounded-xl border p-4 shadow-sm space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Delivery Address
            </p>
            <div>
              <Label className="text-xs">Address *</Label>
              <Textarea className="mt-1" rows={2} value={address.address} onChange={e => setAddress(p => ({ ...p, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">City *</Label>
                <Input className="mt-1" value={address.city} onChange={e => setAddress(p => ({ ...p, city: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">State</Label>
                <Input className="mt-1" value={address.state} onChange={e => setAddress(p => ({ ...p, state: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Pincode *</Label>
                <Input className="mt-1" value={address.pincode} onChange={e => setAddress(p => ({ ...p, pincode: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Phone *</Label>
                <Input className="mt-1" value={address.phone} onChange={e => setAddress(p => ({ ...p, phone: e.target.value }))} />
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <Label className="text-xs">Order Notes (optional)</Label>
          <Textarea className="mt-1.5" rows={2} placeholder="Any special instructions..." value={orderNotes} onChange={e => setOrderNotes(e.target.value)} />
        </div>

        {/* Place Order */}
        <Button
          className="w-full h-12 text-base"
          onClick={() => placeOrder.mutate()}
          disabled={placeOrder.isPending || (deliveryMethod === "delivery" && (!address.address || !address.city || !address.pincode))}
        >
          {placeOrder.isPending ? "Placing Order..." : `Place Order — ₹${cartGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        </Button>
        <p className="text-xs text-center text-muted-foreground">Payment will be collected at the clinic or on delivery.</p>
      </motion.div>
    );
  }

  // ─── BROWSE (DEFAULT) ───
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Header with cart & orders */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg">Shop</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setView("orders")}>
            <Package className="h-3.5 w-3.5 mr-1" /> Orders
          </Button>
          <Button variant="outline" size="sm" className="relative" onClick={() => setView("cart")}>
            <ShoppingCart className="h-3.5 w-3.5 mr-1" /> Cart
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Category pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {categories.map(cat => (
          <button
            key={cat}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              categoryFilter === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            onClick={() => setCategoryFilter(cat)}
          >
            {cat === "all" ? "All" : cat}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div className="grid grid-cols-2 gap-3">
        {filtered.map((p: any) => {
          const inCart = cart.find(i => i.productId === p.id);
          return (
            <div
              key={p.id}
              className="bg-card rounded-xl border shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => { setSelectedProduct(p); setView("product"); }}
            >
              <div className="h-24 bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center relative overflow-hidden">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <Package className="h-10 w-10 text-primary/20" />
                )}
                {p.mrp > p.selling_price && (
                  <Badge className="absolute top-1.5 left-1.5 bg-success/90 text-[10px] px-1.5 py-0">
                    {Math.round((1 - p.selling_price / p.mrp) * 100)}% off
                  </Badge>
                )}
              </div>
              <div className="p-2.5">
                <p className="text-xs text-muted-foreground">{p.category}</p>
                <p className="text-sm font-medium leading-tight line-clamp-2 min-h-[2.5rem]">{p.name}</p>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-sm font-bold text-primary">₹{p.selling_price}</span>
                  {p.mrp > p.selling_price && <span className="text-[10px] line-through text-muted-foreground">₹{p.mrp}</span>}
                </div>
                {inCart ? (
                  <div className="flex items-center gap-1 mt-2">
                    <Button variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={(e) => { e.stopPropagation(); if (inCart.quantity <= 1) { removeFromCart(p.id); } else { updateQty(p.id, -1); } }}>
                      {inCart.quantity <= 1 ? <Trash2 className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3" />}
                    </Button>
                    <span className="text-sm font-semibold flex-1 text-center">{inCart.quantity}</span>
                    <Button variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={(e) => { e.stopPropagation(); updateQty(p.id, 1); }}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <span className="text-xs font-bold text-primary ml-1">₹{(p.selling_price * inCart.quantity).toLocaleString()}</span>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    className="w-full mt-2 h-8 text-xs"
                    onClick={(e) => { e.stopPropagation(); addToCart(p); }}
                  >
                    Add to Cart
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No products found</p>
        </div>
      )}

      {/* Floating cart bar */}
      {cartCount > 0 && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-16 left-0 right-0 px-4 pb-2 z-40"
        >
          <div className="max-w-lg mx-auto">
            <Button className="w-full h-12 shadow-lg gap-2 text-base" onClick={() => setView("cart")}>
              <ShoppingCart className="h-4 w-4" />
              {cartCount} item{cartCount > 1 ? "s" : ""} — ₹{cartGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <ChevronRight className="h-4 w-4 ml-auto" />
            </Button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

export default PortalShop;
