// Helper to render product unit display consistently across the app.
// Prefers the new pharma_product_units child table (multiple active conversions
// per product). Falls back to legacy fields (sub_unit, conversion_value, unit,
// qty_per_unit) when no units array is supplied or it is empty.
export interface ProductUnitRow {
  id?: string;
  product_id?: string;
  sub_unit: string;
  conversion_value: number;
  is_active?: boolean;
  is_default?: boolean;
  sort_order?: number;
}

export function formatProductUnit(product: any, units?: ProductUnitRow[]): string {
  if (!product) return "";
  const base = product.base_unit || product.unit || "";
  if (!base) return "";

  const activeUnits = (units || []).filter(
    (u) => u.is_active && u.sub_unit && Number(u.conversion_value) > 1,
  );

  if (activeUnits.length > 0) {
    const parts = activeUnits.map((u) => `${Number(u.conversion_value)} ${u.sub_unit}`);
    return `${base} (${parts.join(", ")})`;
  }

  // Legacy fallback
  const sub = product.sub_unit || "";
  const conv = Number(product.conversion_value ?? product.qty_per_unit ?? 1) || 1;
  if (sub && conv > 1) return `${base} (${conv} ${sub})`;
  return base;
}

/** Returns the default active conversion (or first active, or null). */
export function getDefaultUnit(units?: ProductUnitRow[]): ProductUnitRow | null {
  const active = (units || []).filter((u) => u.is_active && u.sub_unit && Number(u.conversion_value) > 1);
  if (active.length === 0) return null;
  return active.find((u) => u.is_default) || active[0];
}
