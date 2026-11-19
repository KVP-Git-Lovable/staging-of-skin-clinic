import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * The one way the app asks the server to send a record to Zoho Books.
 * Expenses and invoices both come through here; a refusal is thrown with the
 * message the function returned, which for a Zoho refusal is Zoho's own text.
 */
export async function invokeZohoPush<T>(
  fn: "zoho-push-expense" | "zoho-push-invoice",
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let message = error.message;
    if (error instanceof FunctionsHttpError) {
      try { message = (await error.context.json())?.error || message; } catch { /* keep generic */ }
    }
    throw new Error(message);
  }
  return data as T;
}

export interface InvoiceZohoState {
  zoho_invoice_id?: string | null;
  cancelled_at?: string | null;
  merged_into_invoice_id?: string | null;
  status?: string | null;
}

/**
 * Whether an invoice may be sent to Zoho Books. Cancelled and merged invoices
 * are not real bills and never go; one already in Zoho would be a duplicate.
 */
export function canSendInvoiceToZoho(inv: InvoiceZohoState): boolean {
  return !inv.zoho_invoice_id && !inv.cancelled_at && !inv.merged_into_invoice_id && inv.status !== "Cancelled";
}
