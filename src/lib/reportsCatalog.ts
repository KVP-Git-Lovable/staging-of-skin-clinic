import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/supabasePaginate";
import { ALL_APPOINTMENT_STATUSES } from "@/lib/appointmentStatus";
import { formatMoneyCompact } from "@/lib/currency";

export type ColumnType = "text" | "number" | "currency" | "date" | "datetime" | "badge";

export interface ReportColumn {
  key: string;
  label: string;
  type?: ColumnType;
  sortable?: boolean;
  render?: (row: any) => React.ReactNode;
  accessor?: (row: any) => any;
}

export type FilterType = "dateRange" | "select" | "text" | "doctor" | "service";

export interface ReportFilterDef {
  key: string;
  label: string;
  type: FilterType;
  // For select
  options?: { value: string; label: string }[];
  // For dateRange / select / text — the row field used for client-side filtering
  field?: string;
  // For dateRange — should we apply server-side?
  serverDateField?: string;
  /** For doctor/service filters — how a row is matched against the picked value */
  matches?: (row: any, value: string) => boolean;
}

export interface ReportConfig {
  key: string;
  title: string;
  description: string;
  category: "Patients" | "Operations" | "Finance" | "Marketing";
  columns: ReportColumn[];
  filters: ReportFilterDef[];
  searchFields?: string[];
  rowHref?: (row: any) => string | null;
  fetcher: (params: { from?: string; to?: string }) => Promise<any[]>;
  summary?: (rows: any[]) => { label: string; value: string }[];
  defaultSort?: { key: string; dir: "asc" | "desc" };
  chart?: {
    title: string;
    valueLabel?: string;
    orientation?: "vertical" | "horizontal";
    build: (rows: any[]) => { label: string; value: number }[];
  };
  paged?: {
    pageSize: number;
    fetchPage: (params: {
      page: number;
      from?: string;
      to?: string;
      search?: string;
      selects?: Record<string, string>;
    }) => Promise<{ rows: any[]; total: number }>;
    fetchAllForExport: (params: {
      from?: string;
      to?: string;
      search?: string;
      selects?: Record<string, string>;
    }) => Promise<any[]>;
    chartFetch?: (params: { from?: string; to?: string }) => Promise<{ label: string; value: number }[]>;
    summaryFetch?: (params: {
      from?: string;
      to?: string;
      search?: string;
      selects?: Record<string, string>;
    }) => Promise<{ label: string; value: string }[]>;
  };
}

function groupCount(rows: any[], field: string, topN = 10, opts: { excludeBlank?: boolean; fallback?: string } = {}) {
  const { excludeBlank = false, fallback = "Unknown" } = opts;
  const m = new Map<string, number>();
  rows.forEach((r) => {
    const raw = r?.[field];
    const trimmed = raw == null ? "" : String(raw).trim();
    if (excludeBlank && (!trimmed || trimmed.toLowerCase() === "unknown")) return;
    const k = trimmed || fallback;
    m.set(k, (m.get(k) ?? 0) + 1);
  });
  return Array.from(m, ([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);
}

function groupSum(rows: any[], field: string, valueField: string, topN = 10, fallback = "Unknown") {
  const m = new Map<string, number>();
  rows.forEach((r) => {
    const k = (r?.[field] ?? fallback) || fallback;
    m.set(String(k), (m.get(String(k)) ?? 0) + Number(r?.[valueField] ?? 0));
  });
  return Array.from(m, ([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);
}

function groupSumByMonth(rows: any[], dateField: string, valueField: string) {
  const m = new Map<string, number>();
  rows.forEach((r) => {
    if (!r?.[dateField]) return;
    const d = new Date(r[dateField]);
    if (isNaN(d.getTime())) return;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    m.set(k, (m.get(k) ?? 0) + Number(r?.[valueField] ?? 0));
  });
  return Array.from(m, ([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label));
}

const STATUS_APPT = [...ALL_APPOINTMENT_STATUSES];
const STATUS_INV = ["Pending", "Partial", "Paid", "Cancelled"];
const PAY_MODES = ["Cash", "Card", "UPI", "Bank Transfer", "Cheque"];
const CAMPAIGN_TYPES = ["Google Ads", "Meta Ads", "WhatsApp", "Email", "Other"];
const CAMPAIGN_STATUS = ["Planning", "Active", "Completed"];

export const REPORTS: ReportConfig[] = [
  {
    key: "patients",
    title: "Patients",
    description: "All registered patients with source and contact info.",
    category: "Patients",
    defaultSort: { key: "created_at", dir: "desc" },
    columns: [
      { key: "name", label: "Name", sortable: true, accessor: (r) => `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() },
      { key: "phone", label: "Phone", sortable: true },
      { key: "gender", label: "Gender", sortable: true },
      { key: "source", label: "Source", sortable: true, type: "badge" },
      { key: "city", label: "City", sortable: true },
      { key: "created_at", label: "Created", sortable: true, type: "date" },
    ],
    filters: [
      { key: "dateRange", label: "Created", type: "dateRange", serverDateField: "created_at" },
      { key: "doctor", label: "Doctor", type: "doctor", matches: (r, v) => String(r.doctor_id ?? "") === v },
      {
        key: "source", label: "Source", type: "select", field: "source",
        options: ["Walk-in", "Referral", "Instagram", "Facebook", "Google", "WhatsApp", "Other"].map(v => ({ value: v, label: v })),
      },
      {
        key: "status", label: "Status", type: "select", field: "status",
        options: ["Active", "Inactive"].map(v => ({ value: v, label: v })),
      },
    ],
    searchFields: ["first_name", "last_name", "phone", "email"],
    rowHref: (r) => `/patients/${r.id}`,
    fetcher: async ({ from, to }) =>
      fetchAll((s, e) => {
        let q = supabase.from("patients").select("*").order("created_at", { ascending: false }).range(s, e);
        if (from) q = q.gte("created_at", from);
        if (to) q = q.lte("created_at", to);
        return q;
      }),
    summary: (rows) => [
      { label: "Total Patients", value: rows.length.toLocaleString() },
      { label: "Active", value: rows.filter((r) => r.status === "Active").length.toLocaleString() },
    ],
    chart: {
      title: "Patients by Source",
      valueLabel: "Patients",
      build: (rows) => groupCount(rows, "source", 10, { excludeBlank: true }),
    },
    paged: {
      pageSize: 50,
      fetchPage: async ({ page, from, to, search, selects }) => {
        const fromIdx = (page - 1) * 50;
        const toIdx = fromIdx + 49;
        let q = supabase
          .from("patients")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(fromIdx, toIdx);
        if (from) q = q.gte("created_at", from);
        if (to) q = q.lte("created_at", to);
        if (selects?.source) q = q.eq("source", selects.source);
        if (selects?.status) q = q.eq("status", selects.status);
        if (selects?.doctor) q = q.eq("doctor_id", selects.doctor);
        const term = search?.trim();
        if (term) {
          const safe = term.replace(/[%,()]/g, " ");
          q = q.or(
            `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`
          );
        }
        const { data, error, count } = await q;
        if (error) throw error;
        return { rows: data ?? [], total: count ?? 0 };
      },
      fetchAllForExport: async ({ from, to, search, selects }) =>
        fetchAll((s, e) => {
          let q = supabase
            .from("patients")
            .select("*")
            .order("created_at", { ascending: false })
            .range(s, e);
          if (from) q = q.gte("created_at", from);
          if (to) q = q.lte("created_at", to);
          if (selects?.source) q = q.eq("source", selects.source);
          if (selects?.status) q = q.eq("status", selects.status);
          if (selects?.doctor) q = q.eq("doctor_id", selects.doctor);
          const term = search?.trim();
          if (term) {
            const safe = term.replace(/[%,()]/g, " ");
            q = q.or(
              `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`
            );
          }
          return q;
        }),
      chartFetch: async ({ from, to }) => {
        const rows = await fetchAll<{ source: string | null }>((s, e) => {
          let q = supabase
            .from("patients")
            .select("source")
            .range(s, e);
          if (from) q = q.gte("created_at", from);
          if (to) q = q.lte("created_at", to);
          return q;
        });
        return groupCount(rows, "source", 10, { excludeBlank: true });
      },
      summaryFetch: async ({ from, to, search, selects }) => {
        const baseFilter = (q: any) => {
          if (from) q = q.gte("created_at", from);
          if (to) q = q.lte("created_at", to);
          if (selects?.source) q = q.eq("source", selects.source);
          if (selects?.status) q = q.eq("status", selects.status);
          if (selects?.doctor) q = q.eq("doctor_id", selects.doctor);
          const term = search?.trim();
          if (term) {
            const safe = term.replace(/[%,()]/g, " ");
            q = q.or(
              `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`
            );
          }
          return q;
        };
        const totalQ = baseFilter(
          supabase.from("patients").select("id", { count: "exact", head: true })
        );
        const activeQ = baseFilter(
          supabase.from("patients").select("id", { count: "exact", head: true }).eq("status", "Active")
        );
        const [{ count: total }, { count: active }] = await Promise.all([totalQ, activeQ]);
        return [
          { label: "Total Patients", value: (total ?? 0).toLocaleString() },
          { label: "Active", value: (active ?? 0).toLocaleString() },
        ];
      },
    },
  },
  {
    key: "appointments",
    title: "Appointments",
    description: "All scheduled and past appointments.",
    category: "Operations",
    defaultSort: { key: "start_time", dir: "desc" },
    columns: [
      { key: "patient_name", label: "Patient", sortable: true },
      { key: "service", label: "Service", sortable: true },
      { key: "start_time", label: "Start", sortable: true, type: "datetime" },
      { key: "status", label: "Status", sortable: true, type: "badge" },
    ],
    filters: [
      { key: "dateRange", label: "Appointment Date", type: "dateRange", serverDateField: "start_time" },
      { key: "doctor", label: "Doctor", type: "doctor", matches: (r, v) => String(r.staff_id ?? "") === v },
      { key: "service", label: "Service", type: "service", matches: (r, v) => String(r.service ?? "") === v },
      { key: "status", label: "Status", type: "select", field: "status", options: STATUS_APPT.map(v => ({ value: v, label: v })) },
    ],
    searchFields: ["patient_name", "service"],
    rowHref: () => `/appointments`,
    fetcher: async ({ from, to }) =>
      fetchAll((s, e) => {
        let q = supabase.from("appointments").select("*").order("start_time", { ascending: false }).range(s, e);
        if (from) q = q.gte("start_time", from);
        if (to) q = q.lte("start_time", to);
        return q;
      }),
    summary: (rows) => [
      { label: "Total", value: rows.length.toLocaleString() },
      { label: "Completed", value: rows.filter((r) => r.status === "Completed").length.toLocaleString() },
      { label: "Cancelled", value: rows.filter((r) => r.status === "Cancelled").length.toLocaleString() },
    ],
    chart: {
      title: "Appointments by Status",
      valueLabel: "Appointments",
      build: (rows) => groupCount(rows, "status"),
    },
  },
  {
    key: "invoices",
    title: "Invoices & Revenue",
    description: "All invoices with paid and pending amounts.",
    category: "Finance",
    defaultSort: { key: "created_at", dir: "desc" },
    columns: [
      { key: "invoice_number", label: "Invoice #", sortable: true },
      { key: "patient_name", label: "Patient", sortable: true },
      { key: "total_amount", label: "Total", sortable: true, type: "currency" },
      { key: "paid_amount", label: "Paid", sortable: true, type: "currency" },
      { key: "status", label: "Status", sortable: true, type: "badge" },
      { key: "cancellation_reason", label: "Cancellation Reason", sortable: false },
      { key: "payment_mode", label: "Mode", sortable: true },
      { key: "created_at", label: "Date", sortable: true, type: "date" },
    ],
    filters: [
      { key: "dateRange", label: "Invoice Date", type: "dateRange", serverDateField: "created_at" },
      { key: "doctor", label: "Doctor", type: "doctor", matches: (r, v) => String(r.doctor_id ?? "") === v },
      {
        key: "service", label: "Service", type: "service",
        matches: (r, v) => {
          const list = Array.isArray(r.services) ? r.services : [];
          return list.some((s: any) => String(s?.name ?? s?.service ?? s ?? "") === v);
        },
      },
      { key: "status", label: "Status", type: "select", field: "status", options: STATUS_INV.map(v => ({ value: v, label: v })) },
      { key: "payment_mode", label: "Payment Mode", type: "select", field: "payment_mode", options: PAY_MODES.map(v => ({ value: v, label: v })) },
    ],
    searchFields: ["invoice_number", "patient_name"],
    rowHref: () => `/billing`,
    fetcher: async ({ from, to }) =>
      fetchAll((s, e) => {
        let q = supabase.from("invoices").select("*").order("created_at", { ascending: false }).range(s, e);
        if (from) q = q.gte("created_at", from);
        if (to) q = q.lte("created_at", to);
        return q;
      }),
    summary: (rows) => {
      const total = rows.reduce((a, r) => a + Number(r.total_amount || 0), 0);
      const paid = rows.reduce((a, r) => a + Number(r.paid_amount || 0), 0);
      return [
        { label: "Invoices", value: rows.length.toLocaleString() },
        { label: "Total Billed", value: formatMoneyCompact(total) },
        { label: "Collected", value: formatMoneyCompact(paid) },
        { label: "Outstanding", value: formatMoneyCompact(total - paid) },
      ];
    },
    chart: {
      title: "Revenue by Month",
      valueLabel: "₹ Total",
      build: (rows) => groupSumByMonth(rows, "created_at", "total_amount"),
    },
  },
  {
    key: "expenses",
    title: "Expenses",
    description: "All recorded clinic expenses.",
    category: "Finance",
    defaultSort: { key: "expense_date", dir: "desc" },
    columns: [
      { key: "expense_date", label: "Date", sortable: true, type: "date" },
      { key: "title", label: "Title", sortable: true },
      { key: "vendor_name", label: "Vendor", sortable: true },
      { key: "amount", label: "Amount", sortable: true, type: "currency" },
      { key: "payment_mode", label: "Mode", sortable: true },
    ],
    filters: [
      { key: "dateRange", label: "Expense Date", type: "dateRange", serverDateField: "expense_date" },
      { key: "payment_mode", label: "Payment Mode", type: "select", field: "payment_mode", options: PAY_MODES.map(v => ({ value: v, label: v })) },
    ],
    searchFields: ["title", "vendor_name", "description"],
    rowHref: () => `/expenses`,
    fetcher: async ({ from, to }) =>
      fetchAll((s, e) => {
        let q = supabase.from("expenses").select("*").order("expense_date", { ascending: false }).range(s, e);
        if (from) q = q.gte("expense_date", from.slice(0, 10));
        if (to) q = q.lte("expense_date", to.slice(0, 10));
        return q;
      }),
    summary: (rows) => {
      const total = rows.reduce((a, r) => a + Number(r.amount || 0), 0);
      return [
        { label: "Entries", value: rows.length.toLocaleString() },
        { label: "Total Spent", value: formatMoneyCompact(total) },
      ];
    },
    chart: {
      title: "Expenses by Month",
      valueLabel: "₹ Spent",
      build: (rows) => groupSumByMonth(rows, "expense_date", "amount"),
    },
  },
  {
    key: "pharma_bills",
    title: "Pharmacy Bills",
    description: "All pharmacy bills and over-the-counter sales.",
    category: "Finance",
    defaultSort: { key: "created_at", dir: "desc" },
    columns: [
      { key: "bill_number", label: "Bill #", sortable: true },
      { key: "patient_name", label: "Patient", sortable: true },
      { key: "net_amount", label: "Net Amount", sortable: true, type: "currency" },
      { key: "payment_mode", label: "Mode", sortable: true },
      { key: "status", label: "Status", sortable: true, type: "badge" },
      { key: "created_at", label: "Date", sortable: true, type: "date" },
    ],
    filters: [
      { key: "dateRange", label: "Bill Date", type: "dateRange", serverDateField: "created_at" },
      { key: "payment_mode", label: "Payment Mode", type: "select", field: "payment_mode", options: PAY_MODES.map(v => ({ value: v, label: v })) },
    ],
    searchFields: ["bill_number", "patient_name"],
    rowHref: () => `/pharma`,
    fetcher: async ({ from, to }) =>
      fetchAll((s, e) => {
        let q = supabase.from("pharma_bills").select("*").order("created_at", { ascending: false }).range(s, e);
        if (from) q = q.gte("created_at", from);
        if (to) q = q.lte("created_at", to);
        return q;
      }),
    summary: (rows) => {
      const total = rows.reduce((a, r) => a + Number(r.net_amount || 0), 0);
      return [
        { label: "Bills", value: rows.length.toLocaleString() },
        { label: "Total", value: formatMoneyCompact(total) },
      ];
    },
    chart: {
      title: "Pharmacy Sales by Payment Mode",
      valueLabel: "₹ Net",
      build: (rows) => groupSum(rows, "payment_mode", "net_amount"),
    },
  },
  {
    key: "campaigns",
    title: "Campaigns ROI",
    description: "Marketing campaigns with budget and spend.",
    category: "Marketing",
    defaultSort: { key: "start_date", dir: "desc" },
    columns: [
      { key: "name", label: "Campaign", sortable: true },
      { key: "type", label: "Type", sortable: true, type: "badge" },
      { key: "status", label: "Status", sortable: true, type: "badge" },
      { key: "budget", label: "Budget", sortable: true, type: "currency" },
      { key: "amount_spent", label: "Spent", sortable: true, type: "currency" },
      { key: "new_patients", label: "Patients", sortable: true },
      { key: "revenue", label: "Revenue", sortable: true, type: "currency" },
      { key: "roi", label: "ROI %", sortable: true },
      { key: "start_date", label: "Start", sortable: true, type: "date" },
      { key: "end_date", label: "End", sortable: true, type: "date" },
    ],
    filters: [
      { key: "dateRange", label: "Start Date", type: "dateRange", serverDateField: "start_date" },
      { key: "type", label: "Type", type: "select", field: "type", options: CAMPAIGN_TYPES.map(v => ({ value: v, label: v })) },
      { key: "status", label: "Status", type: "select", field: "status", options: CAMPAIGN_STATUS.map(v => ({ value: v, label: v })) },
    ],
    searchFields: ["name"],
    rowHref: (r) => `/campaigns/${r.id}`,
    fetcher: async ({ from, to }) => {
      const campaigns = await fetchAll<any>((s, e) => {
        let q = supabase.from("campaigns").select("*").order("start_date", { ascending: false }).range(s, e);
        if (from) q = q.gte("start_date", from.slice(0, 10));
        if (to) q = q.lte("start_date", to.slice(0, 10));
        return q;
      });
      // Junction-table-based metrics (distinct patients, no duplication)
      const links = await fetchAll<any>((s, e) =>
        (supabase.from("patient_campaigns") as any).select("campaign_id, patient_id").range(s, e),
      );
      const patientsByCampaign: Record<string, Set<string>> = {};
      const allPatientIds = new Set<string>();
      links.forEach((l: any) => {
        if (!patientsByCampaign[l.campaign_id]) patientsByCampaign[l.campaign_id] = new Set();
        patientsByCampaign[l.campaign_id].add(l.patient_id);
        allPatientIds.add(l.patient_id);
      });
      let revenueByPatient: Record<string, number> = {};
      if (allPatientIds.size > 0) {
        const invoices = await fetchAll<any>((s, e) =>
          supabase.from("invoices").select("patient_id, total_amount").in("patient_id", [...allPatientIds]).range(s, e),
        );
        invoices.forEach((inv: any) => {
          revenueByPatient[inv.patient_id] = (revenueByPatient[inv.patient_id] || 0) + Number(inv.total_amount || 0);
        });
      }
      return campaigns.map((c: any) => {
        const patientIds = patientsByCampaign[c.id] || new Set();
        const new_patients = patientIds.size;
        const revenue = [...patientIds].reduce((s, pid) => s + (revenueByPatient[pid] || 0), 0);
        const spent = Number(c.amount_spent || 0);
        const roi = spent > 0 ? Number((((revenue - spent) / spent) * 100).toFixed(1)) : 0;
        return { ...c, new_patients, revenue, roi };
      });
    },
    summary: (rows) => {
      const budget = rows.reduce((a, r) => a + Number(r.budget || 0), 0);
      const spent = rows.reduce((a, r) => a + Number(r.amount_spent || 0), 0);
      const revenue = rows.reduce((a, r) => a + Number((r as any).revenue || 0), 0);
      return [
        { label: "Campaigns", value: rows.length.toLocaleString() },
        { label: "Total Budget", value: formatMoneyCompact(budget) },
        { label: "Total Spent", value: formatMoneyCompact(spent) },
        { label: "Total Revenue", value: formatMoneyCompact(revenue) },
      ];
    },
    chart: {
      title: "Spend by Campaign (Top 10)",
      valueLabel: "₹ Spent",
      orientation: "horizontal",
      build: (rows) =>
        rows
          .map((r) => ({ label: r.name ?? "Untitled", value: Number(r.amount_spent ?? 0) }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10),
    },
  },
];

export function getReport(key: string) {
  return REPORTS.find((r) => r.key === key);
}