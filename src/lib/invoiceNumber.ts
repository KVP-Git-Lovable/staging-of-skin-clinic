import { supabase } from "@/integrations/supabase/client";

/**
 * Invoice numbers continue the clinic's Salesforce series: Salesforce ended at
 * B-49053, so the first bill raised in this app is INV-49054 and it counts on
 * from there.
 *
 * They are allocated by the database, not here. Every number used to come from
 * `Date.now().toString().slice(-6)` in the browser - the millisecond clock mod
 * a million, which wraps every 16 minutes 40 seconds, so the same number came
 * round several times a day and two people billing at once could be handed the
 * same one. That is no basis for a series the clinic has to show an auditor.
 *
 * `next_invoice_numbers(n)` draws from a Postgres sequence, so numbers are
 * unique and increasing however many people are billing at the same time, and
 * a unique index on invoices.invoice_number refuses a duplicate outright.
 *
 * Call this when the bill is SAVED, never when the form opens: a number handed
 * out is spent, and abandoning a half-filled dialog should not leave a hole in
 * the series.
 */
export async function allocateInvoiceNumbers(count: number): Promise<string[]> {
  const wanted = Math.max(Math.trunc(count) || 1, 1);

  // The generated Supabase types do not carry this function yet, so the call is
  // typed here rather than cast to any.
  // Bound to the client: a detached `supabase.rpc` loses `this` and throws
  // "Cannot read properties of undefined (reading 'rest')" on every save.
  const callRpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;

  const { data, error } = await callRpc("next_invoice_numbers", { _count: wanted });
  if (error) throw new Error(`Could not get an invoice number: ${error.message}`);

  // Postgres returns a set of text as [{ next_invoice_numbers: "INV-49104" }, ...]
  const numbers = (Array.isArray(data) ? data : [])
    .map((row) => (typeof row === "string" ? row : (row as Record<string, unknown>)?.next_invoice_numbers))
    .filter((n): n is string => typeof n === "string" && n.length > 0);

  // Deliberately no fallback to a locally invented number. A bill with a made-up
  // number is worse than a bill that failed to save: the first is a gap in the
  // clinic's books that nobody notices, the second is a message on screen.
  if (numbers.length < wanted) {
    throw new Error(`Could not get an invoice number (asked for ${wanted}, got ${numbers.length})`);
  }

  return numbers.slice(0, wanted);
}

/** The single-number case, which is most of them. */
export async function allocateInvoiceNumber(): Promise<string> {
  const [number] = await allocateInvoiceNumbers(1);
  return number;
}
