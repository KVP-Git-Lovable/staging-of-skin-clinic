import { useNavigate } from "react-router-dom";
import { ShoppingCart, Plus, Minus, Trash2, ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { motion } from "framer-motion";

const ShopCart = () => {
  const navigate = useNavigate();
  const { user, patientId } = useAuth();
  const { cartItems, cartTotal, cartCount, updateQuantity, removeFromCart, isLoading } = useCart(patientId);

  if (!user) {
    navigate("/login");
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-display font-bold">Cart ({cartCount})</h1>
        <Button variant="ghost" size="sm" onClick={() => navigate("/shop")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Shop
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading cart...</div>
      ) : cartItems.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Your cart is empty</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={() => navigate("/shop")}>Browse Products</Button>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          {cartItems.map(item => (
            <div key={item.productId} className="bg-card rounded-xl border p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium text-sm text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.category}</p>
                  <p className="text-sm font-semibold text-primary mt-1">₹{item.price} each</p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeFromCart.mutate(item.productId)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQuantity.mutate({ productId: item.productId, delta: -1 })}>
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="text-sm font-semibold w-8 text-center">{item.quantity}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQuantity.mutate({ productId: item.productId, delta: 1 })}>
                  <Plus className="h-3 w-3" />
                </Button>
                <span className="ml-auto font-bold text-sm">₹{(item.price * item.quantity).toLocaleString()}</span>
              </div>
            </div>
          ))}

          <div className="bg-card rounded-xl border p-4 shadow-sm">
            <div className="flex justify-between text-sm mb-3">
              <span className="text-muted-foreground">Subtotal ({cartCount} items)</span>
              <span className="font-semibold">₹{cartTotal.toLocaleString()}</span>
            </div>
            <Button className="w-full h-12" onClick={() => navigate("/shop/checkout")}>
              Proceed to Checkout <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default ShopCart;
