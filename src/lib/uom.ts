// Unit of Measure (UOM) helpers for pharmacy stock.
//
// Canonical rule: `pharma_inventory.quantity` is always stored in the product's
// BASE unit (the stock-keeping unit, normally what we buy in — e.g. Box).
// Sub-units defined in `pharma_product_units` express how many of that sub-unit
// fit in one base unit (e.g. 1 Box = 10 Tube -> conversion_value 10).
//
// `factor` below = how many of the chosen UOM equal one base unit.
//   base unit        -> factor 1
//   sub unit "Tube"  -> factor 10
// Therefore:
//   qty in UOM  = baseQty * factor
//   base qty    = uomQty / factor
//   price / UOM = basePrice / factor
import type { ProductUnitRow } from "./unitDisplay";

export interface UomOption {
  /** Unit name, e.g. "Box" or "Tube" */
  name: string;
  /** Units of this UOM per one base unit */
  factor: number;
  isBase: boolean;
}

export function getBaseUnit(product: any): string {
  return product?.base_unit || product?.unit || "Unit";
}

/** All selectable UOMs for a product: base unit first, then active sub-units. */
export function getUomOptions(product: any, units?: ProductUnitRow[]): UomOption[] {
  const base = getBaseUnit(product);
  const opts: UomOption[] = [{ name: base, factor: 1, isBase: true }];

  const active = (units || []).filter(
    (u) => u.is_active !== false && u.sub_unit && Number(u.conversion_value) > 0,
  );
  if (active.length > 0) {
    for (const u of active) {
      if (!opts.some((o) => o.name === u.sub_unit)) {
        opts.push({ name: u.sub_unit, factor: Number(u.conversion_value) || 1, isBase: false });
      }
    }
  } else if (product?.sub_unit) {
    const conv = Number(product.conversion_value ?? product.qty_per_unit ?? 1) || 1;
    if (conv > 0 && product.sub_unit !== base) {
      opts.push({ name: product.sub_unit, factor: conv, isBase: false });
    }
  }
  return opts;
}

export function findUom(
  product: any,
  units: ProductUnitRow[] | undefined,
  name?: string | null,
): UomOption {
  const opts = getUomOptions(product, units);
  return opts.find((o) => o.name === name) || opts[0];
}

/** The UOM the product is bought in (defaults to base unit). */
export function getPurchaseUom(product: any, units?: ProductUnitRow[]): UomOption {
  return findUom(product, units, product?.purchase_unit || getBaseUnit(product));
}

/** The UOM the product is sold in (defaults to purchase/base unit). */
export function getSaleUom(product: any, units?: ProductUnitRow[]): UomOption {
  return findUom(product, units, product?.sale_unit || product?.purchase_unit || getBaseUnit(product));
}

/** Convert a base-unit quantity into the given UOM. */
export function toUomQty(baseQty: number, factor: number): number {
  return (Number(baseQty) || 0) * (Number(factor) || 1);
}

/** Convert a quantity expressed in a UOM back to base units. */
export function toBaseQty(uomQty: number, factor: number): number {
  return (Number(uomQty) || 0) / (Number(factor) || 1);
}

/** Round to 3 decimals and drop trailing zeros for display. */
export function fmtQty(n: number): string {
  const v = Math.round((Number(n) || 0) * 1000) / 1000;
  return String(v);
}

/** e.g. "100 Tube (10 Box)" */
export function describeStock(baseQty: number, saleUom: UomOption, baseUnit: string): string {
  const inSale = fmtQty(toUomQty(baseQty, saleUom.factor));
  if (saleUom.isBase) return `${inSale} ${baseUnit}`;
  return `${inSale} ${saleUom.name} (${fmtQty(baseQty)} ${baseUnit})`;
}
