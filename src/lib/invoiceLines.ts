// Invoice line-item shaping, shared by the Billing invoice view and the
// printed/PDF invoice so the two can never disagree about what was charged.
// Lifted out of Billing.tsx because a component file cannot export these
// without breaking fast refresh (react-refresh/only-export-components).

// Salesforce's appointment "service" field is really a free-text clinical
// note, not a clean procedure name, and often carries a trailing "last
// session on <date>" annotation - strip that when the field is used as a
// display fallback (never touches the stored data itself).
export const cleanApptService = (raw: string | null | undefined): string =>
  String(raw || "").replace(/\s*last\s+session\s+on\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/i, "").trim();

/** Older Salesforce imports stored a literal ["Service"] placeholder (not an
 *  empty array) when there was no real per-procedure name - prefer the
 *  linked appointment's actual service name over that placeholder. */
export const displayServices = (inv: any): string[] => {
  const services: string[] = inv?.services || [];
  const isPlaceholder = services.length === 1 && services[0] === "Service";
  return services.length && !isPlaceholder ? services : [cleanApptService(inv?.appointments?.service) || "Service"];
};

/** Active HSN GST rates (total %), cached so the shared helpers below can resolve
 *  a line's GST when the stored snapshot carries none. */
export const hsnRateCache: Record<string, number> = {};

/** Normalised line-item rows (rate, tax, total) shared by the invoice view and the PDF. */
export interface InvoiceLineRow {
  name: string; hsn: string; qty: number; price: number; amount: number; gst: number; tax: number; total: number;
}
export const invoiceLineRows = (inv: any): InvoiceLineRow[] => {
  const invoiceTax = Number(inv?.cgst_amount || 0) + Number(inv?.sgst_amount || 0) + Number(inv?.igst_amount || 0)
    || Number(inv?.tax_amount || 0);
  // Salesforce-imported invoices (and any other invoice saved without a
  // line_items snapshot) only carry an invoice-level total/tax, not a
  // per-service price - synthesize one row per named service so Rate/Amount/
  // Tax don't render as a hollow 0. total_amount is tax-INCLUSIVE (it's what
  // "Grand Total"/paid_amount already read directly), so the pre-tax base
  // must be derived algebraically from the GST rate (base * (1+rate/100) =
  // total_amount) rather than by subtracting a separately-tracked tax
  // figure - otherwise Amount+Tax ends up adding a fresh tax on top of a
  // base that was never reduced by it, inflating the line-item Total past
  // the invoice's actual Grand Total.
  const raw: any[] = Array.isArray(inv?.line_items) && inv.line_items.length > 0
    ? inv.line_items
    : (() => {
        const names: string[] = displayServices(inv);
        const gstRate = Number(inv?.tax_rate) || 0;
        const totalAmt = Number(inv?.total_amount || 0);
        const base = gstRate > 0 ? totalAmt / (1 + gstRate / 100) : Math.max(totalAmt - invoiceTax, 0);
        return names.map((s: string) => ({ name: s, qty: 1, price: base / names.length, hsn: "", gst: gstRate }));
      })();
  const rows = raw.map((it: any) => {
    const qty = Number(it.qty) || 1;
    const price = Number(it.price) || 0;
    const amount = qty * price;
    const hsn = it.hsn || "";
    // The Tax Master rate for this HSN, falling back to the line's own GST
    // snapshot only when that HSN is not in the master. The master is what
    // getServiceLineTax() charges from, so anything else shows a rate the
    // patient was never billed.
    const masterRate = hsnRateCache[String(hsn).trim()];
    const gst = masterRate !== undefined ? masterRate : (Number(it.gst) || 0);
    // A saved line_items snapshot can itself carry the same literal
    // "Service" placeholder displayServices() guards against (e.g. a
    // Salesforce import saved before that fix existed) - resolve it here
    // too, not just when synthesizing fallback rows from scratch.
    const rawName = it.name || "";
    const name = rawName && rawName !== "Service" ? rawName : cleanApptService(inv?.appointments?.service) || "Service";
    return { name, hsn, qty, price, amount, gst, tax: (amount * gst) / 100, total: 0 };
  });

  const taxSum = rows.reduce((s, r) => s + r.tax, 0);
  const amountSum = rows.reduce((s, r) => s + r.amount, 0);
  // The invoice's own cgst/sgst/igst is what was charged and what Grand Total
  // is built from, so the lines are made to agree with it rather than the
  // other way round.
  if (invoiceTax > 0 && Math.abs(taxSum - invoiceTax) > 0.01) {
    if (taxSum > 0) {
      // Scale each line by its share OF THE TAX, not of the amount: spreading
      // by amount would move tax onto zero-rated lines, which were never taxed.
      rows.forEach((r) => { r.tax = (r.tax / taxSum) * invoiceTax; });
    } else if (amountSum > 0) {
      // No line carries a rate at all - nothing better than an even spread.
      rows.forEach((r) => { r.tax = (r.amount / amountSum) * invoiceTax; });
    }
  }
  rows.forEach((r) => { r.total = r.amount + r.tax; });
  return rows;
};
