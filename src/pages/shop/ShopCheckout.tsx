import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Store, Truck, Loader2, CreditCard, Smartphone, Banknote, Building2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { toast } from "sonner";
import { motion } from "framer-motion";

const paymentMethods = [
  { id: "upi", label: "UPI", desc: "Google Pay, PhonePe, Paytm", icon: Smartphone },
  { id: "card", label: "Credit / Debit Card", desc: "Visa, Mastercard, RuPay", icon: CreditCard },
  { id: "netbanking", label: "Net Banking", desc: "All major banks", icon: Building2 },
  { id: "cod", label: "Cash on Delivery", desc: "Pay when you receive", icon: Banknote },
];

const ShopCheckout = () => {
  const navigate = useNavigate();
  const { user, patientId, patientName } = useAuth();
  const { cartItems, cartTotal, cartGst, cartGrandTotal, clearCart } = useCart(patientId);
  const [deliveryMethod, setDeliveryMethod] = useState("pickup");
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [address, setAddress] = useState({ address: "", city: "", state: "", pincode: "", phone: "" });
  const [orderNotes, setOrderNotes] = useState("");
  const [step, setStep] = useState<"summary" | "payment">("summary");

  // UPI form state
  const [upiId, setUpiId] = useState("");
  // Card form state
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardName, setCardName] = useState("");

  if (!user) { navigate("/login"); return null; }
  if (cartItems.length === 0) { navigate("/shop/cart"); return null; }

  const { data: patientData } = useQuery({
    queryKey: ["shop-patient", patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const { data } = await supabase.from("patients").select("address, city, state, pincode, phone").eq("id", patientId!).single();
      if (data) {
        setAddress({
          address: data.address || "",
          city: data.city || "",
          state: data.state || "",
          pincode: data.pincode || "",
          phone: data.phone || "",
        });
      }
      return data;
    },
  });

  const placeOrder = useMutation({
    mutationFn: async () => {
      const { data: order, error } = await supabase.from("portal_orders").insert({
        patient_id: patientId!,
        patient_name: patientName,
        delivery_method: deliveryMethod,
        address: deliveryMethod === "delivery" ? address.address : null,
        city: deliveryMethod === "delivery" ? address.city : null,
        state: deliveryMethod === "delivery" ? address.state : null,
        pincode: deliveryMethod === "delivery" ? address.pincode : null,
        phone: address.phone || patientData?.phone,
        total_amount: cartGrandTotal,
        notes: orderNotes || null,
        payment_mode: paymentMethod === "cod" ? "COD" : paymentMethod.toUpperCase(),
        payment_status: paymentMethod === "cod" ? "Pending" : "Paid",
      }).select().single();
      if (error) throw error;

      const items = cartItems.map(item => ({
        order_id: order.id,
        product_id: item.productId,
        product_name: item.name,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.price * item.quantity,
      }));
      const { error: itemsError } = await supabase.from("portal_order_items").insert(items);
      if (itemsError) throw itemsError;

      await clearCart.mutateAsync();
    },
    onSuccess: () => {
      toast.success("Order placed successfully!");
      navigate("/shop/orders");
    },
    onError: () => toast.error("Failed to place order"),
  });

  if (step === "payment") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-display font-bold">Payment</h1>
          <Button variant="ghost" size="sm" onClick={() => setStep("summary")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </div>

        {/* Amount */}
        <div className="bg-card rounded-xl border p-4 shadow-sm text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Amount</p>
          <p className="text-3xl font-bold text-primary mt-1">₹{cartGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>

        {/* Payment Method Selection */}
        <div className="bg-card rounded-xl border p-4 shadow-sm space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Select Payment Method</p>
          <div className="space-y-2">
            {paymentMethods.map(pm => {
              const Icon = pm.icon;
              return (
                <button
                  key={pm.id}
                  className={`w-full p-3 rounded-xl border-2 flex items-center gap-3 text-left transition-all ${
                    paymentMethod === pm.id ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                  }`}
                  onClick={() => setPaymentMethod(pm.id)}
                >
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${paymentMethod === pm.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{pm.label}</p>
                    <p className="text-xs text-muted-foreground">{pm.desc}</p>
                  </div>
                  <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === pm.id ? "border-primary" : "border-muted-foreground/30"}`}>
                    {paymentMethod === pm.id && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* UPI Form */}
        {paymentMethod === "upi" && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="bg-card rounded-xl border p-4 shadow-sm space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">UPI Details</p>
            <div>
              <Label className="text-xs">UPI ID</Label>
              <Input className="mt-1" placeholder="yourname@upi" value={upiId} onChange={e => setUpiId(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">You will receive a payment request on your UPI app</p>
          </motion.div>
        )}

        {/* Card Form */}
        {paymentMethod === "card" && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="bg-card rounded-xl border p-4 shadow-sm space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Card Details</p>
            <div>
              <Label className="text-xs">Card Number</Label>
              <Input className="mt-1" placeholder="1234 5678 9012 3456" value={cardNumber} onChange={e => setCardNumber(e.target.value)} maxLength={19} />
            </div>
            <div>
              <Label className="text-xs">Name on Card</Label>
              <Input className="mt-1" placeholder="John Doe" value={cardName} onChange={e => setCardName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Expiry Date</Label>
                <Input className="mt-1" placeholder="MM/YY" value={cardExpiry} onChange={e => setCardExpiry(e.target.value)} maxLength={5} />
              </div>
              <div>
                <Label className="text-xs">CVV</Label>
                <Input className="mt-1" placeholder="•••" type="password" value={cardCvv} onChange={e => setCardCvv(e.target.value)} maxLength={4} />
              </div>
            </div>
          </motion.div>
        )}

        {/* Net Banking */}
        {paymentMethod === "netbanking" && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="bg-card rounded-xl border p-4 shadow-sm space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Select Bank</p>
            <div className="grid grid-cols-2 gap-2">
              {["SBI", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Bank", "Other"].map(bank => (
                <button key={bank} className="p-3 rounded-xl border text-sm font-medium text-center hover:border-primary hover:bg-primary/5 transition-all">
                  {bank}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* COD info */}
        {paymentMethod === "cod" && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="bg-card rounded-xl border p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">Pay with cash when your order is delivered or picked up from the clinic. No additional charges.</p>
          </motion.div>
        )}

        {/* Secure badge */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-2">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          <span>Secured by 256-bit SSL encryption</span>
        </div>

        <Button className="w-full h-12 text-base" onClick={() => placeOrder.mutate()} disabled={placeOrder.isPending}>
          {placeOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {paymentMethod === "cod" ? "Place Order" : `Pay ₹${cartGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-display font-bold">Checkout</h1>
        <Button variant="ghost" size="sm" onClick={() => navigate("/shop/cart")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Cart
        </Button>
      </div>

      {/* Order summary */}
      <div className="bg-card rounded-xl border p-4 shadow-sm">
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Order Summary</p>
        {cartItems.map(item => (
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

      {/* Address */}
      {deliveryMethod === "delivery" && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="bg-card rounded-xl border p-4 shadow-sm space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Delivery Address</p>
          <div>
            <Label className="text-xs">Address</Label>
            <Textarea className="mt-1" rows={2} value={address.address} onChange={e => setAddress(p => ({ ...p, address: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">City</Label><Input className="mt-1" value={address.city} onChange={e => setAddress(p => ({ ...p, city: e.target.value }))} /></div>
            <div><Label className="text-xs">State</Label><Input className="mt-1" value={address.state} onChange={e => setAddress(p => ({ ...p, state: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Pincode</Label><Input className="mt-1" value={address.pincode} onChange={e => setAddress(p => ({ ...p, pincode: e.target.value }))} /></div>
            <div><Label className="text-xs">Phone</Label><Input className="mt-1" value={address.phone} onChange={e => setAddress(p => ({ ...p, phone: e.target.value }))} /></div>
          </div>
        </motion.div>
      )}

      {/* Notes */}
      <div className="bg-card rounded-xl border p-4 shadow-sm">
        <Label className="text-xs text-muted-foreground">Order Notes (optional)</Label>
        <Textarea className="mt-1" rows={2} value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder="Any special instructions..." />
      </div>

      <Button className="w-full h-12 text-base gap-2" onClick={() => setStep("payment")}>
        Continue to Payment <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default ShopCheckout;
