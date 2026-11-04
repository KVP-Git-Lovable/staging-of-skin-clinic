/**
 * Invoices for a known set of appointments, looked up by id.
 *
 * The Appointments page used to build its bill/payment-mode lookup by pulling
 * the ENTIRE invoices table through fetchAll(). That had three problems:
 *
 *   - it had no ORDER BY, and PostgREST .range() paging without one is not
 *     stable, so rows could be silently skipped or repeated across pages;
 *   - it grew with the clinic's whole billing history rather than with what is
 *     on screen, so a later page could hit the statement timeout - and a
 *     throwing query leaves useQuery's data at [], which renders as a dash in
 *     every Bill Amount and Payment Mode cell with nothing to say why;
 *   - it was slow even when it worked, for a screen showing twenty rows.
 *
 * Fetching by appointment id instead keeps the work proportional to the rows
 * being displayed. The ids go in the URL, so they are chunked well below any
 * URL-length limit, and the chunks run a few at a time to stay quick on the
 * wide date ranges.
 */

/** Ids per request. ~36 bytes each; 150 keeps the GET URL around 6 KB. */
export const INVOICE_ID_CHUNK = 150;
/** Chunks in flight at once. */
export const INVOICE_CHUNK_CONCURRENCY = 4;

export function chunkIds(ids: string[], size = INVOICE_ID_CHUNK): string[][] {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const out: string[][] = [];
  for (let i = 0; i < unique.length; i += size) out.push(unique.slice(i, i + size));
  return out;
}

export async function fetchInvoicesByAppointmentIds<T>(
  fetchChunk: (ids: string[]) => Promise<T[]>,
  ids: string[],
  options: { chunkSize?: number; concurrency?: number } = {},
): Promise<T[]> {
  const chunks = chunkIds(ids, options.chunkSize ?? INVOICE_ID_CHUNK);
  if (chunks.length === 0) return [];

  const limit = Math.max(1, options.concurrency ?? INVOICE_CHUNK_CONCURRENCY);
  const results: T[][] = new Array(chunks.length);
  let next = 0;

  // A fixed pool of workers rather than Promise.all over every chunk: a wide
  // date range can be hundreds of chunks, and firing them all at once is how
  // you get rate-limited instead of fast.
  const worker = async () => {
    for (;;) {
      const index = next++;
      if (index >= chunks.length) return;
      results[index] = await fetchChunk(chunks[index]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, chunks.length) }, worker));
  return results.flat();
}

/** A bill the clinic no longer stands behind. Not money this visit was charged. */
const VOID_STATUSES = ["Cancelled", "Merged"];

export interface VisitBill {
  id?: string;
  appointment_id?: string | null;
  patient_id?: string | null;
  total_amount?: number | string | null;
  paid_amount?: number | string | null;
  payment_mode?: string | null;
  /** The rows behind a "Split", so a list can name the modes - see paymentSplits.ts. */
  payment_splits?: unknown;
  status?: string | null;
  created_at?: string | null;
}

/** What a visit was billed: the live bills, their total, and each of them. */
export interface VisitBilling extends VisitBill {
  /** Every live bill for this visit, newest first. Usually one. */
  bills: VisitBill[];
}

const amount = (value: number | string | null | undefined): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * appointment_id -> what that visit was billed, for the row cells and the
 * view-filter engine.
 *
 * Two things this has to get right, both reported by the clinic.
 *
 * A **cancelled** bill is not what the visit was charged. Aneesh Kumar's ₹850
 * was cancelled as an incorrect amount and replaced by ₹2,500 nine minutes
 * later; the list showed the ₹850, because this used to keep whichever row came
 * back last and the query is not ordered. Nothing else in the app counts them -
 * not the reports, not the invoice roll-up.
 *
 * And a visit can carry **more than one** live bill: 883 of them do, the
 * consultation billed apart from the treatment. Overwriting meant Shruthi's
 * 12 September visit read ₹1,250 or ₹18,000 depending on the order the rows
 * arrived, for a visit billed ₹19,250. They are kept together now, and the
 * clinic asked to see both.
 *
 * The value is still one object, so every caller keeps working: the totals are
 * what sorting, filtering and export read, and `bills` is what the cell shows.
 */
export function invoiceMapByAppointment<T extends VisitBill>(invoices: T[]): Map<string, VisitBilling> {
  const byAppointment = new Map<string, T[]>();
  for (const inv of invoices) {
    if (!inv?.appointment_id) continue;
    if (VOID_STATUSES.includes(String(inv.status ?? ""))) continue;
    const list = byAppointment.get(inv.appointment_id);
    if (list) list.push(inv);
    else byAppointment.set(inv.appointment_id, [inv]);
  }

  const map = new Map<string, VisitBilling>();
  for (const [appointmentId, found] of byAppointment) {
    const bills = [...found].sort(
      (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
    );
    const modes = Array.from(new Set(bills.map((b) => (b.payment_mode || "").trim()).filter(Boolean)));
    map.set(appointmentId, {
      ...bills[0],
      total_amount: bills.reduce((sum, b) => sum + amount(b.total_amount), 0),
      paid_amount: bills.reduce((sum, b) => sum + amount(b.paid_amount), 0),
      payment_mode: modes.join(", "),
      bills,
    });
  }
  return map;
}
