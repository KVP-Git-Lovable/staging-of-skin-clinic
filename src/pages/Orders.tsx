import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Package, Truck, Store, Eye, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";

const statusOptions = ["Pending", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled"];

const statusColors: Record<string, string> = {
  Pending: "bg-warning/10 text-warning border-warning/30",
  Confirmed: "bg-primary/10 text-primary border-primary/30",
  Processing: "bg-primary/10 text-primary border-primary/30",
  Shipped: "bg-accent/10 text-accent-foreground border-accent/30",
  Delivered: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  Cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};

const paymentColors: Record<string, string> = {
  Pending: "bg-warning/10 text-warning",
  Paid: "bg-emerald-500/10 text-emerald-600",
  Refunded: "bg-destructive/10 text-destructive",
};

const Orders = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(searchParams.get("id"));

  const { data: orders = [] } = useQuery({
    queryKey: ["clinic-portal-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_orders")
        .select("*, portal_order_items(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = orders.filter((o: any) => {
    const matchSearch = !search || (o.patient_name || "").toLowerCase().includes(search.toLowerCase()) || o.id.includes(search);
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const selectedOrder = orders.find((o: any) => o.id === selectedOrderId);

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Portal Orders</h1>
          <p className="page-subtitle">Manage patient shop orders</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="outline" className="gap-1">
            <Package className="h-3 w-3" /> {orders.length} orders
          </Badge>
          <Badge variant="outline" className="gap-1 bg-warning/10 text-warning border-warning/30">
            {orders.filter((o: any) => o.status === "Pending").length} pending
          </Badge>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by patient name or order ID..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No orders found</TableCell></TableRow>
            ) : filtered.map((o: any) => (
              <TableRow key={o.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedOrderId(o.id)}>
                <TableCell className="font-mono text-xs">#{o.id.slice(0, 8)}</TableCell>
                <TableCell className="font-medium text-sm">{o.patient_name || "—"}</TableCell>
                <TableCell className="text-sm">{format(new Date(o.created_at), "dd MMM yyyy")}</TableCell>
                <TableCell className="text-sm">{(o.portal_order_items || []).length}</TableCell>
                <TableCell className="font-semibold text-sm">₹{Number(o.total_amount).toLocaleString()}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-xs">
                    {o.delivery_method === "delivery" ? <Truck className="h-3 w-3" /> : <Store className="h-3 w-3" />}
                    {o.delivery_method === "delivery" ? "Delivery" : "Pickup"}
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline" className={`text-xs ${statusColors[o.status] || ""}`}>{o.status}</Badge></TableCell>
                <TableCell><Badge variant="outline" className={`text-xs ${paymentColors[o.payment_status] || ""}`}>{o.payment_status}</Badge></TableCell>
                <TableCell><Button variant="ghost" size="icon" className="h-7 w-7"><Eye className="h-3.5 w-3.5" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </motion.div>

      {/* Order Detail Sheet */}
      <OrderDetailSheet
        order={selectedOrder}
        onClose={() => {
          setSelectedOrderId(null);
          if (searchParams.get("id")) {
            const next = new URLSearchParams(searchParams);
            next.delete("id");
            setSearchParams(next, { replace: true });
          }
        }}
      />
    </div>
  );
};

function OrderDetailSheet({ order, onClose }: { order: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [newStatus, setNewStatus] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");

  const updateOrder = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const { error } = await supabase.from("portal_orders").update(updates as any).eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinic-portal-orders"] });
      toast.success("Order updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!order) return null;

  const handleStatusUpdate = () => {
    if (!newStatus) return;
    updateOrder.mutate({ status: newStatus });
    setNewStatus("");
  };

  const handleTrackingUpdate = () => {
    if (!trackingNumber) return;
    updateOrder.mutate({ tracking_number: trackingNumber, status: "Shipped" });
    setTrackingNumber("");
  };

  const handlePaymentUpdate = () => {
    if (!paymentStatus) return;
    updateOrder.mutate({ payment_status: paymentStatus });
    setPaymentStatus("");
  };

  return (
    <Sheet open={!!order} onOpenChange={() => onClose()}>
      <SheetContent className="w-screen max-w-none sm:max-w-none overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">Order #{order.id.slice(0, 8)}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Status & Payment badges */}
          <div className="flex gap-2">
            <Badge variant="outline" className={statusColors[order.status] || ""}>{order.status}</Badge>
            <Badge variant="outline" className={paymentColors[order.payment_status] || ""}>Payment: {order.payment_status}</Badge>
          </div>

          {/* Customer info */}
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer</h3>
            <p className="text-sm font-medium">{order.patient_name || "—"}</p>
            {order.phone && <p className="text-sm text-muted-foreground">📱 {order.phone}</p>}
          </div>

          {/* Delivery info */}
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Delivery</h3>
            <div className="flex items-center gap-1.5 text-sm">
              {order.delivery_method === "delivery" ? <Truck className="h-4 w-4 text-primary" /> : <Store className="h-4 w-4 text-primary" />}
              {order.delivery_method === "delivery" ? "Home Delivery" : "Clinic Pickup"}
            </div>
            {order.delivery_method === "delivery" && order.address && (
              <p className="text-sm text-muted-foreground">{[order.address, order.city, order.state, order.pincode].filter(Boolean).join(", ")}</p>
            )}
            {order.tracking_number && <p className="text-sm"><span className="text-muted-foreground">Tracking:</span> {order.tracking_number}</p>}
          </div>

          {/* Items */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Items</h3>
            <div className="space-y-1.5">
              {(order.portal_order_items || []).map((item: any) => (
                <div key={item.id} className="flex justify-between text-sm bg-muted/50 rounded-lg px-3 py-2">
                  <span>{item.product_name} × {item.quantity}</span>
                  <span className="font-medium">₹{Number(item.total_price).toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-bold pt-2 border-t">
                <span>Total</span>
                <span className="text-primary">₹{Number(order.total_amount).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {order.notes && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</h3>
              <p className="text-sm bg-muted/50 rounded-lg px-3 py-2">{order.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="border-t pt-4 space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</h3>

            {/* Update Status */}
            <div className="flex gap-2">
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Change status..." /></SelectTrigger>
                <SelectContent>
                  {statusOptions.filter(s => s !== order.status).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleStatusUpdate} disabled={!newStatus || updateOrder.isPending}>Update</Button>
            </div>

            {/* Add Tracking */}
            {order.delivery_method === "delivery" && (
              <div className="flex gap-2">
                <Input placeholder="Add tracking number..." value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} className="flex-1" />
                <Button size="sm" onClick={handleTrackingUpdate} disabled={!trackingNumber || updateOrder.isPending}>Ship</Button>
              </div>
            )}

            {/* Payment Status */}
            <div className="flex gap-2">
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Update payment..." /></SelectTrigger>
                <SelectContent>
                  {["Pending", "Paid", "Refunded"].filter(s => s !== order.payment_status).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handlePaymentUpdate} disabled={!paymentStatus || updateOrder.isPending}>Update</Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">Created: {format(new Date(order.created_at), "dd MMM yyyy, hh:mm a")}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default Orders;
