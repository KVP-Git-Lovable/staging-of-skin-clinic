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
  let q = supabase
    .from("appointments")
    .select("*, patients(first_name, last_name, phone, gender), staff(first_name, last_name)", { count: "exact" });

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
    const orParts = [`service.ilike.%${term}%`, `patient_name.ilike.%${term}%`];
    if (phoneMatchIds.length > 0) {
      orParts.push(`patient_id.in.(${phoneMatchIds.join(",")})`);
    }
    q = q.or(orParts.join(","));
  }

  switch (sortColumn) {
    case "status":
    case "visit_status":
    case "service":
      q = q.order(sortColumn, { ascending });
      break;
    case "patient":
      q = q.order("first_name", { referencedTable: "patients", ascending });
      break;
    case "doctor":
      q = q.order("first_name", { referencedTable: "staff", ascending });
      break;
    case "start_time":
    case "bill":
    default:
      q = q.order("start_time", { ascending });
      break;
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await q.range(from, to);
  if (error) throw error;
  return { rows: data || [], total: count || 0 };
}
