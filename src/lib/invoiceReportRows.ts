/**
 * The three things Invoices & Revenue needs that an invoice row does not carry:
 * what was billed, at what material percentage, and how much that deducts.
 *
 * Material cost used to be a report of its own. It is on the invoice report now,
 * and the arithmetic deliberately did not move with it: `material_cost_lines`
 * already decides which percentage wins - the one on the billed line, then the
 * one typed on the visit, then the Service Master - and that order exists so
 * correcting the master later does not rewrite what a past visit cost.
 * Re-deriving any of it here would let two reports of the same money disagree.
 *
 * The view holds one row per billed service line; this report holds one row per
 * invoice. So these fold the lines onto their invoice, and nothing else about
 * the row changes - the total, the GST and the collection cards are the same
 * figures they were before material cost arrived beside them.
 */

export interface MaterialCostLine {
  invoice_id?: string | null;
  material_percent?: number | string | null;
  material_cost?: number | string | null;
}

export interface MaterialCostFields {
  /** "5%", or "5% + 10%" where a bill's lines differ. Empty when none. */
  material_percent_label: string;
  /** The exact sum of the lines' own rounded rupees, or null when none. */
  material_cost_total: number | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const tidy = (v: unknown): string => String(v ?? "").trim();

/** Drop a trailing ".00" so 5 reads "5%" and 7.5 reads "7.5%". */
const pct = (n: number): string => String(Number(n.toFixed(2)));

/**
 * The percentages a bill was costed at, never their average.
 *
 * 170 invoices have lines at different percentages. Averaging them would put a
 * figure on the row that nobody set and no line was costed at - the same fault
 * as the blended "3.36%" that used to print as a GST rate. So they are listed,
 * the way gstRateLabel lists mixed GST rates.
 */
export function materialPercentLabel(percents: Array<number | string | null | undefined>): string {
  const distinct = Array.from(
    new Set(percents.map((p) => num(p)).filter((p) => p > 0)),
  ).sort((a, b) => a - b);
  if (distinct.length === 0) return "";
  return distinct.map((p) => `${pct(p)}%`).join(" + ");
}

/**
 * Every service named on a bill, from both places one can be written down.
 *
 * line_items AND the services array, merged, where invoiceServiceLabel below
 * reads line_items first and only falls back. The difference matters for
 * matching rather than display: the Dashboard's "Revenue by Service" chart
 * groups on the services array, so a bar clicked from there has to be findable
 * even on the rare bill whose two lists disagree - 1 of 2,648 over 90 days.
 *
 * invoiceServiceLabel is deliberately left reading line_items first. It fills
 * the Material Cost report's Service cell beside figures unnested from
 * line_items, and widening it would change what that report prints.
 */
export function invoiceServiceNames(row: unknown): string[] {
  const inv = (row ?? {}) as Record<string, unknown>;
  const names: string[] = [];

  const lines = Array.isArray(inv.line_items) ? inv.line_items : [];
  for (const line of lines) {
    const name = tidy((line as Record<string, unknown>)?.name);
    if (name) names.push(name);
  }

  if (Array.isArray(inv.services)) {
    for (const s of inv.services) {
      const name = typeof s === "string"
        ? tidy(s)
        : tidy((s as Record<string, unknown>)?.name ?? (s as Record<string, unknown>)?.service);
      if (name) names.push(name);
    }
  }

  // Deduplicated but kept in billed order, as the label is.
  return Array.from(new Set(names));
}

/**
 * Does this drill-down row belong to the service being filtered for?
 *
 * The Dashboard's drill-down filtered invoices with `row.service !== value`,
 * and invoice rows were never given a `service` at all - so clicking a bar on
 * "Revenue by Service" rejected every row and opened an empty list. A bill can
 * also carry several services, which a single field cannot answer for.
 *
 * Appointment rows still have one `service` and are matched on it, exactly as
 * before.
 */
export function rowMatchesService(
  row: { service?: string | null; _services?: string[] | null },
  value: string,
): boolean {
  if (!value || value === "all") return true;
  if (Array.isArray(row?._services)) return row._services.includes(value);
  return (row?.service ?? "") === value;
}

/**
 * The services on a bill, as one cell.
 *
 * Read off line_items, which is what material_cost_lines unnests, so the
 * Service cell and the two material columns always describe the same lines.
 * Falls back to the invoice's own `services` array for the older bills that
 * have no line snapshot.
 *
 * Not displayServices() from invoiceLines.ts: that reads `inv.appointments`,
 * the alias Billing embeds under, while the reports embed `appointment`.
 */
export function invoiceServiceLabel(row: unknown): string {
  const inv = (row ?? {}) as Record<string, unknown>;
  const names: string[] = [];

  const lines = Array.isArray(inv.line_items) ? inv.line_items : [];
  for (const line of lines) {
    const name = tidy((line as Record<string, unknown>)?.name);
    if (name) names.push(name);
  }

  if (names.length === 0 && Array.isArray(inv.services)) {
    for (const s of inv.services) {
      const name = typeof s === "string"
        ? tidy(s)
        : tidy((s as Record<string, unknown>)?.name ?? (s as Record<string, unknown>)?.service);
      if (name) names.push(name);
    }
  }

  // Deduplicated but kept in billed order: a bill that charged the same service
  // twice is one service, and alphabetising would stop the cell reading like
  // the bill it came from.
  return Array.from(new Set(names)).join(", ");
}

/** The material figures for one invoice, from its lines in the view. */
export function materialCostFields(lines: MaterialCostLine[]): MaterialCostFields {
  if (lines.length === 0) {
    // Blank, not zero: most bills have no percentage recorded at all, and a
    // column of 0.00 would read as "this cost nothing" rather than "nobody
    // said". The Service Master is where that gets answered.
    return { material_percent_label: "", material_cost_total: null };
  }
  return {
    material_percent_label: materialPercentLabel(lines.map((l) => l.material_percent)),
    material_cost_total: lines.reduce((sum, l) => sum + num(l.material_cost), 0),
  };
}

/**
 * Fold the view's lines onto their invoices.
 *
 * Returns new row objects rather than mutating, and adds only the two keys -
 * everything the summary cards, the revenue chart and the GST columns read is
 * passed through untouched.
 */
export function attachMaterialCost<T extends { id?: string | null }>(
  invoices: T[],
  lines: MaterialCostLine[],
): Array<T & MaterialCostFields> {
  const byInvoice = new Map<string, MaterialCostLine[]>();
  for (const line of lines) {
    const id = tidy(line?.invoice_id);
    if (!id) continue;
    const found = byInvoice.get(id);
    if (found) found.push(line);
    else byInvoice.set(id, [line]);
  }
  return invoices.map((inv) => ({
    ...inv,
    ...materialCostFields(byInvoice.get(tidy(inv?.id)) ?? []),
  }));
}
