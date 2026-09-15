import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  gstPercent: number;
  imageUrl?: string | null;
}

export function useCart(patientId: string | null) {
  const queryClient = useQueryClient();

  const { data: cartItems = [], isLoading } = useQuery({
    queryKey: ["cart-items", patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("cart_items")
        .select("*, pharma_products(name, selling_price, category, gst_percent, image_url)")
        .eq("patient_id", patientId!);
      return (data || []).map((item: any) => ({
        productId: item.product_id,
        name: item.pharma_products?.name || "",
        price: Number(item.pharma_products?.selling_price || 0),
        quantity: item.quantity,
        category: item.pharma_products?.category || "",
        gstPercent: Number(item.pharma_products?.gst_percent || 0),
        imageUrl: item.pharma_products?.image_url,
      }));
    },
  });

  // Realtime subscription for cart sync
  useEffect(() => {
    if (!patientId) return;
    const channel = supabase
      .channel(`cart-${patientId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "cart_items",
        filter: `patient_id=eq.${patientId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ["cart-items", patientId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [patientId, queryClient]);

  const addToCart = useMutation({
    mutationFn: async (product: { id: string; name: string; selling_price: number; category: string; gst_percent: number }) => {
      if (!patientId) throw new Error("Not logged in");
      const { data: existing } = await supabase
        .from("cart_items")
        .select("id, quantity")
        .eq("patient_id", patientId)
        .eq("product_id", product.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("cart_items")
          .update({ quantity: existing.quantity + 1, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("cart_items")
          .insert({ patient_id: patientId, product_id: product.id, quantity: 1 });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cart-items", patientId] }),
  });

  const updateQuantity = useMutation({
    mutationFn: async ({ productId, delta }: { productId: string; delta: number }) => {
      if (!patientId) return;
      const { data: existing } = await supabase
        .from("cart_items")
        .select("id, quantity")
        .eq("patient_id", patientId)
        .eq("product_id", productId)
        .maybeSingle();
      if (!existing) return;
      const newQty = Math.max(1, existing.quantity + delta);
      await supabase.from("cart_items").update({ quantity: newQty, updated_at: new Date().toISOString() }).eq("id", existing.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cart-items", patientId] }),
  });

  const removeFromCart = useMutation({
    mutationFn: async (productId: string) => {
      if (!patientId) return;
      await supabase.from("cart_items").delete().eq("patient_id", patientId).eq("product_id", productId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cart-items", patientId] }),
  });

  const clearCart = useMutation({
    mutationFn: async () => {
      if (!patientId) return;
      await supabase.from("cart_items").delete().eq("patient_id", patientId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cart-items", patientId] }),
  });

  const cartTotal = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartGst = cartItems.reduce((s, i) => s + (i.price * i.quantity * i.gstPercent) / 100, 0);
  const cartGrandTotal = cartTotal + cartGst;
  const cartCount = cartItems.reduce((s, i) => s + i.quantity, 0);

  return {
    cartItems,
    isLoading,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    cartTotal,
    cartGst,
    cartGrandTotal,
    cartCount,
  };
}
