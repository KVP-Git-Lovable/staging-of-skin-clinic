// Pure rules for pushing a clinic invoice to Zoho Books. No I/O, so the rules
// (what may never be sent, how the total is kept, how payment is recorded) are
// unit-tested in zoho-invoice.test.ts.

export interface InvoiceForZoho {
  invoice_number: string;
  created_at: string;
  due_date: string | null;
  total_amount: number | string;
  paid_amount: number | string;
  tax_amount?: number | string | null;
  line_items: unknown;
  services?: string[] | null;
  payment_mode?: string | null;
  payment_splits?: unknown;
  status?: string | null;
  cancelled_at?: string | null;
  merged_into_invoice_id?: string | null;
  zoho_invoice_id?: string | null;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Why this invoice must not go to Zoho, or null when it may. Cancelled and
// merged invoices are not real bills; an already-synced one would duplicate.
export function zohoInvoiceBlocker(inv: Pick<InvoiceForZoho, "cancelled_at" | "merged_into_invoice_id" | "status" | "zoho_invoice_id">): string | null {
  if (inv.zoho_invoice_id) return "This invoice is already in Zoho Books";
  if (inv.cancelled_at || inv.status === "Cancelled") return "Cancelled invoices are never sent to Zoho Books";
  if (inv.merged_into_invoice_id) return "Merged invoices are never sent to Zoho Books";
  return null;
}

// The invoice date as the clinic sees it (India time), yyyy-mm-dd.
export function clinicDate(ts: string): string {
  return new Date(new Date(ts).getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export function zohoLineItems(inv: InvoiceForZoho): { name: string; rate: number; quantity: number }[] {
  const lines = Array.isArray(inv.line_items) ? (inv.line_items as Record<string, unknown>[]) : [];
  const items = lines
    .map((l) => ({
      name: String(l?.name ?? "").trim().slice(0, 100),
      rate: r2(Number(l?.price) || 0),
      quantity: l?.qty === undefined || l?.qty === null ? 1 : Number(l.qty) || 0,
    }))
    .filter((l) => l.name && l.quantity > 0);
  if (items.length) return items;
  const name = (inv.services ?? []).filter(Boolean).join(", ").slice(0, 100) || `Invoice ${inv.invoice_number}`;
  return [{ name, rate: r2(Number(inv.total_amount) || 0), quantity: 1 }];
}

// Zoho invoice body. Zoho totals the line items itself and takes no total, so
// any difference to the clinic's total_amount (GST, or a stage/instalment
// share of a plan whose lines are the whole plan) goes in as an adjustment -
// the Zoho total always equals total_amount.
export function buildZohoInvoiceBody(inv: InvoiceForZoho, customerId: string): Record<string, unknown> {
  const line_items = zohoLineItems(inv);
  const body: Record<string, unknown> = {
    customer_id: customerId,
    reference_number: inv.invoice_number,
    date: clinicDate(inv.created_at),
    line_items,
  };
  if (inv.due_date) body.due_date = inv.due_date;
  const subTotal = line_items.reduce((s, l) => s + r2(l.rate * l.quantity), 0);
  const adjustment = r2((Number(inv.total_amount) || 0) - subTotal);
  if (Math.abs(adjustment) >= 0.01) {
    const tax = Number(inv.tax_amount) || 0;
    body.adjustment = adjustment;
    body.adjustment_description = tax > 0 && Math.abs(adjustment - tax) < 0.05 ? "GST" : "Adjustment to clinic invoice total";
  }
  return body;
}

// Zoho's own payment modes; anything else (UPI, split) is "others", with the
// clinic's mode kept in the description.
export function zohoPaymentMode(mode: string | null | undefined): string {
  const m = (mode ?? "").trim().toLowerCase();
  if (m.includes("cash")) return "cash";
  if (m.includes("cheque") || m.includes("check")) return "check";
  if (m.includes("card")) return "creditcard";
  if (/bank|neft|imps|rtgs/.test(m)) return "banktransfer";
  return "others";
}

function paymentDescription(inv: InvoiceForZoho): string {
  const splits = Array.isArray(inv.payment_splits) ? (inv.payment_splits as { mode?: string; amount?: number | string }[]) : [];
  if (splits.length) return `Clinic payment: ${splits.map((s) => `${s.mode ?? "Other"} ₹${Number(s.amount) || 0}`).join(", ")}`;
  return `Clinic payment mode: ${(inv.payment_mode ?? "").trim() || "not recorded"}`;
}

// The customer payment for what was already paid, or null when nothing was.
// Never more than the invoice total.
export function buildZohoPaymentBody(inv: InvoiceForZoho, customerId: string, zohoInvoiceId: string): Record<string, unknown> | null {
  const amount = r2(Math.min(Number(inv.paid_amount) || 0, Number(inv.total_amount) || 0));
  if (!(amount > 0)) return null;
  return {
    customer_id: customerId,
    payment_mode: zohoPaymentMode(inv.payment_mode),
    amount,
    date: clinicDate(inv.created_at),
    reference_number: inv.invoice_number,
    description: paymentDescription(inv),
    invoices: [{ invoice_id: zohoInvoiceId, amount_applied: amount }],
  };
}
