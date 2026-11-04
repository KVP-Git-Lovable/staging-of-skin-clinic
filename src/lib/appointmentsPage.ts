import { supabase } from "@/integrations/supabase/client";

export interface AppointmentsDateRange {
  start: Date;
  end: Date;
}

export interface FetchAppointmentsPageParams {
  page: number;
  pageSize: number;
  dateRange: AppointmentsDateRange | null;
  doctorIds: string[];
  status: string;
  visitStatus: string;
  search: string;
  sortColumn: string;
  sortDirection: "asc" | "desc";
}

export interface AppointmentsPageResult {
  rows: any[];
  total: number;
  /**
   * True when at least one more row exists after this page. Derived by asking
   * for one row beyond the page, so it comes back in the same snapshot as the
   * rows rather than being inferred from the count.
   */
  hasMore: boolean;
}

/**
 * Server-side paginated fetch for the Appointments List/table view.
 * Filters and sorts run in Postgres so the table stays fast regardless of
 * total row count. "bill"/"payment_mode" have no DB-level join with
 * appointments today, so sorting by "bill" falls back to start_time -
 * the bill column itself is populated separately, per-page, by the caller.
 */
export async function fetchAppointmentsPage({
  page,
  pageSize,
  dateRange,
  doctorIds,
  status,
  visitStatus,
  search,
  sortColumn,
  sortDirection,
}: FetchAppointmentsPageParams): Promise<AppointmentsPageResult> {
  const ascending = sortDirection === "asc";
  // A real count. This asked for "planned"/"estimated" back when exact counts
  // over 56k appointments were being cancelled - but those answer from
  // Postgres's table statistics, which read 56,530 against 56,776 real rows and
  // drift after every bulk change, so the All view disagreed with every saved
  // view. Measured on the live data: counting every appointment is 13ms, 16ms
  // with the two left joins embedded here, and under a millisecond for the
  // date-bounded views the clinic actually works in all day.
  let q = supabase
    .from("appointments")
    .select("*, patients(first_name, last_name, phone, gender, is_vip), staff:staff!appointments_staff_id_fkey(first_name, last_name)", { count: "exact" });


  if (dateRange) {
    q = q.gte("start_time", dateRange.start.toISOString()).lte("start_time", dateRange.end.toISOString());
  }
  if (doctorIds.length > 0) {
    q = q.in("staff_id", doctorIds);
  }
  if (status !== "all") {
    q = q.eq("status", status);
  }
  if (visitStatus !== "all") {
    q = q.eq("visit_status", visitStatus);
  }
  const term = search.trim().replace(/[%,()]/g, "");
  if (term) {
    // "patients" is a left join (kept, not !inner, so appointments with no
    // linked patient record still show up) - PostgREST can't filter top-level
    // rows by an embedded left-joined column, so name search uses the
    // denormalized patient_name column on appointments itself, and phone
    // search resolves matching patient ids first, then ORs them in.
    const { data: phoneMatches } = await supabase
      .from("patients")
      .select("id")
      .ilike("phone", `%${term}%`)
      .limit(500);
    const phoneMatchIds = (phoneMatches || []).map((p: any) => p.id);
    // reason_for_consultation is what the Investigation column shows, so it has to
    // be searchable - otherwise you cannot search for the text on screen.
    const orParts = [
      `service.ilike.%${term}%`,
      `reason_for_consultation.ilike.%${term}%`,
      `patient_name.ilike.%${term}%`,
    ];
    if (phoneMatchIds.length > 0) {
      orParts.push(`patient_id.in.(${phoneMatchIds.join(",")})`);
    }
    q = q.or(orParts.join(","));
  }

  switch (sortColumn) {
    // reason_for_consultation is what the Investigation column sorts on; without
    // it here the sort would fall through to the default and silently order by
    // date instead.
    case "status":
    case "visit_status":
    case "service":
    case "reason_for_consultation":
      q = q.order(sortColumn, { ascending });
      break;
    case "patient":
      q = q.order("first_name", { referencedTable: "patients", ascending });
      break;
    case "doctor":
      q = q.order("first_name", { referencedTable: "staff", ascending });
      break;
    // The stored name, not a join onto staff: therapist_name is kept after a
    // therapist leaves the clinic, so ordering on the join would scatter
    // their visits among the unassigned ones.
    case "therapist":
      q = q.order("therapist_name", { ascending });
      break;
    case "phone":
      q = q.order("phone", { referencedTable: "patients", ascending });
      break;
    case "start_time":
    // Bill Amount and Payment Mode have no column here to order by - both come
    // from an invoice lookup done after these rows arrive, keyed on the ids of
    // the page in hand. They keep the date order from the server and are sorted
    // within the page by sortAppointmentsByPageColumn.
    case "bill":
    case "payment_mode":
    default:
      q = q.order("start_time", { ascending });
      break;
  }

  const from = (page - 1) * pageSize;
  // One row past the page: its presence is what tells the caller a next page
  // exists, from the same snapshot as the rows.
  const to = from + pageSize;
  const { data, error, count } = await q.range(from, to);
  if (error) throw error;
  const fetched = data || [];
  const hasMore = fetched.length > pageSize;
  return { rows: fetched.slice(0, pageSize), total: count || 0, hasMore };
}
