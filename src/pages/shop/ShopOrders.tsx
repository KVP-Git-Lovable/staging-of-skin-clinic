import { useNavigate } from "react-router-dom";
import { Package, Truck, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";

const ShopOrders = () => {
  const navigate = useNavigate();
  const { user, patientId } = useAuth();

  if (!user) { navigate("/login"); return null; }

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["shop-orders", patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("portal_orders")
        .select("*, portal_order_items(*)")
        .eq("patient_id", patientId!)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const statusColors: Record<string, string> = {
    Pending: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
    Confirmed: "bg-primary/10 text-primary",
    Processing: "bg-primary/10 text-primary",
    Shipped: "bg-accent text-accent-foreground",
    Delivered: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
    Cancelled: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-display font-bold">My Orders</h1>
        <Button variant="outline" size="sm" onClick={() => navigate("/shop")}>Continue Shopping</Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No orders yet</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={() => navigate("/shop")}>Start Shopping</Button>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          {orders.map((o: any) => (
            <div key={o.id} className="bg-card rounded-xl border p-4 shadow-sm space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Order #{o.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[o.status] || ""}`}>
                  {o.status}
                </span>
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
      )}
    </div>
  );
};

export default ShopOrders;
