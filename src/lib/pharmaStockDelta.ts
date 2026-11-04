/**
 * Putting pharmacy stock back when a billed product line changes.
 *
 * Creating an invoice decrements pharma_inventory. Editing one therefore has
 * to move the difference, or stock drifts every time somebody corrects a
 * quantity - and nobody would notice until a count came up short.
 *
 * Quantities are billed in a selling UOM and held in base units, so both
 * sides are converted before they are compared.
 */

export interface StockLine {
  inventory_id: string;
  quantity: number;
  /** Base units per one unit of the selling UOM. */
  uom_factor?: number;
}

export const toBaseQty = (quantity: number, factor: number | undefined) =>
  (Number(quantity) || 0) * (Number(factor) || 1);

/**
 * How much to ADD to each inventory row, in base units.
 *
 * Positive means stock comes back (the line shrank or went away); negative
 * means more leaves the shelf. Rows whose total does not move are left out
 * entirely, so an edit that did not touch pharmacy writes nothing at all.
 */
export function stockDelta(before: StockLine[], after: StockLine[]): Record<string, number> {
  const totals = new Map<string, number>();

  const add = (lines: StockLine[], sign: 1 | -1) => {
    for (const line of lines) {
      if (!line?.inventory_id) continue;
      const base = toBaseQty(line.quantity, line.uom_factor) * sign;
      totals.set(line.inventory_id, (totals.get(line.inventory_id) ?? 0) + base);
    }
  };

  // What was taken off the shelf comes back; what the edit now bills goes out.
  add(before, 1);
  add(after, -1);

  const delta: Record<string, number> = {};
  for (const [id, amount] of totals) if (amount !== 0) delta[id] = amount;
  return delta;
}
