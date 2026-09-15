import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/supabasePaginate";
import { startOfDay, endOfDay } from "date-fns";

export const INVOICE_SELECT =
  "*, appointments(id, service, start_time, staff_id, doctors:staff_id(first_name, last_name))";

export interface InvoiceDateRange {
  dateFrom?: Date;
  dateTo?: Date;
}

function applyDateRange(q: any, { dateFrom, dateTo }: InvoiceDateRange) {
  if (dateFrom) q = q.gte("created_at", startOfDay(dateFrom).toISOString());
  if (dateTo) q = q.lte("created_at", endOfDay(dateTo).toISOString());
  return q;
}

export interface FetchInvoicesPageParams extends InvoiceDateRange {
  page: number;
  pageSize: number;
}

export interface InvoicesPageResult {
  rows: any[];
  total: number;
}

/**
 * Server-side paginated fetch for the Billing table's default view (no
 * quick filters, search, custom saved view, or Kanban display active) -
 * one request per page instead of fetchAll()'s ~30 sequential requests
 * across the whole (~29k row) invoices table.
 */
export async function fetchInvoicesPage({
  page,
  pageSize,
  dateFrom,
  dateTo,
}: FetchInvoicesPageParams): Promise<InvoicesPageResult> {
  let q = supabase.from("invoices").select(INVOICE_SELECT, { count: "exact" });
  q = applyDateRange(q, { dateFrom, dateTo });
  q = q.order("created_at", { ascending: false });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await q.range(from, to);
  if (error) throw error;
  return { rows: data || [], total: count || 0 };
}

export interface FetchInvoicesBoundedParams extends InvoiceDateRange {
  limit: number;
}

/**
 * Bounded fetch for when a quick filter, search, custom saved view, or
 * Kanban display needs the full (client-side-filterable) set in memory -
 * capped well below the full table so a handful of requests replace
 * fetchAll()'s dozens, while keeping every existing client-side filter
 * predicate (doctor/service/search/saved-view engine) working unchanged.
 */
export async function fetchInvoicesBounded({ dateFrom, dateTo, limit }: FetchInvoicesBoundedParams): Promise<any[]> {
  const all = await fetchAll<any>((from, to) => {
    let q = supabase.from("invoices").select(INVOICE_SELECT);
    q = applyDateRange(q, { dateFrom, dateTo });
    return q.order("created_at", { ascending: false }).range(from, to);
  });
  return all.slice(0, limit);
}

export interface FetchInvoicesSearchParams extends InvoiceDateRange {
  search?: string;
  doctorId?: string;
  service?: string;
  paymentType?: string;
  status?: string;
  limit?: number;
}

/**
 * Server-side narrowed fetch for the Billing page's search box and quick
 * filters. fetchInvoicesBounded() only keeps the newest N rows, so an older
 * invoice was unreachable via search/filter; here every mappable predicate
 * (date range, status, payment type, service, doctor, and the free-text
 * search across invoice number / patient / payment fields) is pushed to
 * PostgREST, so the returned (already small) set covers the whole table.
 * The page still re-applies its exact client-side predicates on top for
 * anything that can't be expressed server-side (e.g. appointment-doctor
 * name substring matches).
 */
export async function fetchInvoicesSearch({
  search,
  doctorId,
  service,
  paymentType,
  status,
  dateFrom,
  dateTo,
  limit = 5000,
}: FetchInvoicesSearchParams): Promise<any[]> {
  const buildQuery = (innerJoinAppointments: boolean) => {
    const select = innerJoinAppointments
      ? "*, appointments!inner(id, service, start_time, staff_id, doctors:staff_id(first_name, last_name))"
      : INVOICE_SELECT;
    let q = supabase.from("invoices").select(select);
    q = applyDateRange(q, { dateFrom, dateTo });
    if (status) q = q.eq("status", status);
    if (paymentType) q = q.eq("payment_type", paymentType);
    if (service) q = q.contains("services", [service]);
    return q;
  };

  const run = async (innerJoinAppointments: boolean, extra?: (q: any) => any) => {
    let q = buildQuery(innerJoinAppointments);
    if (extra) q = extra(q);
    q = q.order("created_at", { ascending: false }).limit(limit);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  };

  // Free-text search: match invoice number / payment fields / denormalized
  // patient name directly, plus patient_id against a name/phone lookup so
  // rows saved without the denormalized patient_name still match.
  let searchExtra: ((q: any) => any) | undefined;
  // Extra server-side passes for things that can't live in a single OR clause
  // (array overlap on invoices.services, doctor-name matches). Their results
  // are merged by id with the main pass.
  const extraPasses: Array<[boolean, (q: any) => any]> = [];
  const term = search?.trim();
  if (term) {
    const like = `%${term.replace(/[%_]/g, "")}%`;
    const orParts = [
      `invoice_number.ilike.${like}`,
      `patient_name.ilike.${like}`,
      `payment_type.ilike.${like}`,
      `payment_mode.ilike.${like}`,
    ];
    const nameLike = `%${term.replace(/^dr\.?\s*/i, "").replace(/[%_]/g, "")}%`;
    const [{ data: patientHits }, { data: serviceHits }, { data: staffHits }] = await Promise.all([
      supabase
        .from("patients")
        .select("id")
        .or(`first_name.ilike.${like},last_name.ilike.${like},phone.ilike.${like}`)
        .limit(500),
      supabase.from("services").select("name").ilike("name", like).limit(200),
      supabase.from("staff").select("id").or(`first_name.ilike.${nameLike},last_name.ilike.${nameLike}`).limit(200),
    ]);
    const ids = (patientHits || []).map((p: any) => p.id);
    if (ids.length) orParts.push(`patient_id.in.(${ids.join(",")})`);
    const orClause = orParts.join(",");
    searchExtra = (q) => q.or(orClause);

    // Service-name search: invoices.services is text[], so ilike can't be used
    // there - resolve matching service names from the master first and use an
    // array overlap. The appointment's own service text is matched too.
    const serviceNames = (serviceHits || []).map((s: any) => s.name).filter(Boolean);
    if (serviceNames.length) extraPasses.push([false, (q) => q.overlaps("services", serviceNames)]);
    extraPasses.push([true, (q) => q.ilike("appointments.service", like)]);

    // Doctor-name search: match staff by name, then both the invoice's own
    // doctor_id and the linked appointment's staff_id.
    const staffIds = (staffHits || []).map((s: any) => s.id);
    if (staffIds.length) {
      extraPasses.push([false, (q) => q.in("doctor_id", staffIds)]);
      extraPasses.push([true, (q) => q.in("appointments.staff_id", staffIds)]);
    }
  }

  const merge = (lists: any[][]) => {
    const seen = new Map<string, any>();
    for (const list of lists) for (const inv of list) seen.set(inv.id, inv);
    return [...seen.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  };

  if (doctorId) {
    // Doctor can come from invoices.doctor_id OR the linked appointment's
    // staff_id. An inner-join filter would drop appointment-less invoices,
    // so run both variants and merge by id.
    const lists = await Promise.all([
      run(false, (q) => {
        q = q.eq("doctor_id", doctorId);
        return searchExtra ? searchExtra(q) : q;
      }),
      run(true, (q) => {
        q = q.eq("appointments.staff_id", doctorId);
        return searchExtra ? searchExtra(q) : q;
      }),
      // Same doctor filter, but matching the search term on service/doctor name.
      ...extraPasses.map(([inner, extra]) =>
        run(inner, (q) => extra(inner ? q.eq("appointments.staff_id", doctorId) : q.eq("doctor_id", doctorId)))
      ),
    ]);
    return merge(lists);
  }

  if (extraPasses.length) {
    const lists = await Promise.all([
      run(false, searchExtra),
      ...extraPasses.map(([inner, extra]) => run(inner, extra)),
    ]);
    return merge(lists);
  }

  return run(false, searchExtra);
}


export interface InvoiceStats {
  totalRevenue: number;
  pendingAmount: number;
  partialAmount: number;
  pendingCount: number;
  partialCount: number;
}

/**
 * All-time revenue/pending/partial totals (and invoice counts), independent
 * of pagination and filters - fetched separately (only 3 columns, no join)
 * so a failure here never blanks out the main invoice list, and so the
 * cards stay accurate while the user is searching/filtering/paging the
 * table (the loaded `invoices` array is otherwise just the current page).
 */
export async function fetchInvoiceStats(): Promise<InvoiceStats> {
  const rows = await fetchAll<any>((from, to) =>
    supabase.from("invoices").select("total_amount, paid_amount, status").range(from, to)
  );
  let totalRevenue = 0;
  let pendingAmount = 0;
  let partialAmount = 0;
  let pendingCount = 0;
  let partialCount = 0;
  for (const inv of rows) {
    if (inv.status === "Cancelled") continue;
    totalRevenue += Number(inv.paid_amount) || 0;
    if (inv.status === "Pending") {
      pendingAmount += Number(inv.total_amount) || 0;
      pendingCount++;
    }
    if (inv.status === "Partial") {
      partialAmount += (Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0);
      partialCount++;
    }
  }
  return { totalRevenue, pendingAmount, partialAmount, pendingCount, partialCount };
}

export async function fetchInvoiceById(id: string): Promise<any | null> {
  const { data, error } = await supabase.from("invoices").select(INVOICE_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}
