import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ProductUnitRow } from "@/lib/unitDisplay";

/**
 * Fetches all pharma_product_units rows once and groups them by product_id.
 * Use `unitsByProduct[productId]` to get the array of conversion rows.
 */
export function usePharmaProductUnits() {
  return useQuery({
    queryKey: ["pharma-product-units"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pharma_product_units")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const grouped: Record<string, ProductUnitRow[]> = {};
      for (const row of (data as ProductUnitRow[]) || []) {
        const pid = row.product_id as string;
        if (!pid) continue;
        (grouped[pid] = grouped[pid] || []).push(row);
      }
      return { rows: (data as ProductUnitRow[]) || [], byProduct: grouped };
    },
  });
}

/** Fetch units for a single product. */
export function useProductUnits(productId: string | null | undefined) {
  return useQuery({
    queryKey: ["pharma-product-units", productId],
    queryFn: async () => {
      if (!productId) return [] as ProductUnitRow[];
      const { data, error } = await (supabase as any)
        .from("pharma_product_units")
        .select("*")
        .eq("product_id", productId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as ProductUnitRow[]) || [];
    },
    enabled: !!productId,
  });
}