import { useSyncExternalStore } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type ZohoPushFn = "zoho-push-expense" | "zoho-push-invoice";

/**
 * Sends in progress, keyed by function and record id. A second request for a
 * record that is already being sent (the automatic push after save and a
 * click on "Send to Zoho Books" landing together) joins the first one instead
 * of asking the server again, so it can never create a second Zoho record.
 */
const inFlight = new Map<string, Promise<unknown>>();
const listeners = new Set<() => void>();
let snapshot: ReadonlySet<string> = new Set();

const keyOf = (fn: ZohoPushFn, id: string) => `${fn}:${id}`;
const recordIdOf = (body: Record<string, unknown>) =>
  String(body.invoiceId ?? body.expenseId ?? "");

function publish() {
  snapshot = new Set(inFlight.keys());
  listeners.forEach((l) => l());
}

/** True while a record is being sent to Zoho Books from this browser tab. */
export function isZohoPushInFlight(fn: ZohoPushFn, id: string): boolean {
  return inFlight.has(keyOf(fn, id));
}

/** Re-renders when sends start or finish; returns a checker for one record. */
export function useZohoPushInFlight(fn: ZohoPushFn): (id: string) => boolean {
  const current = useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => snapshot,
  );
  return (id: string) => current.has(keyOf(fn, id));
}

/**
 * The one way the app asks the server to send a record to Zoho Books.
 * Expenses and invoices both come through here; a refusal is thrown with the
 * message the function returned, which for a Zoho refusal is Zoho's own text.
 *
 * "Already in Zoho Books" (409) is not a failure: the record is there, so the
 * server's Zoho id and synced date are returned with already_synced = true.
 */
export async function invokeZohoPush<T>(fn: ZohoPushFn, body: Record<string, unknown>): Promise<T & { already_synced?: boolean }> {
  const recordId = recordIdOf(body);
  const key = recordId ? keyOf(fn, recordId) : "";
  const pending = key ? inFlight.get(key) : undefined;
  if (pending) return pending as Promise<T & { already_synced?: boolean }>;

  const run = (async () => {
    const { data, error } = await supabase.functions.invoke(fn, { body });
    if (error) {
      let message = error.message;
      if (error instanceof FunctionsHttpError) {
        let payload: any = null;
        try { payload = await error.context.json(); } catch { /* keep generic */ }
        const status = error.context?.status;
        if (status === 409 && (payload?.zoho_invoice_id || payload?.zoho_expense_id)) {
          const { error: _ignored, ...ids } = payload;
          return { ...ids, already_synced: true } as T & { already_synced?: boolean };
        }
        message = payload?.error || message;
      }
      throw new Error(message);
    }
    return data as T & { already_synced?: boolean };
  })();

  if (!key) return run;
  inFlight.set(key, run);
  publish();
  try {
    return await run;
  } finally {
    inFlight.delete(key);
    publish();
  }
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
