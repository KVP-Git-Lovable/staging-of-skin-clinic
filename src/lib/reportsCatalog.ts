import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/supabasePaginate";
import { ALL_APPOINTMENT_STATUSES } from "@/lib/appointmentStatus";
import { amountBeforeGst, gstAmount, gstRateLabel } from "@/lib/invoiceGst";
import {
  attachMaterialCost,
  invoiceServiceLabel,
  type MaterialCostLine,
} from "@/lib/invoiceReportRows";
import {
  invoiceExportSheet,
  invoiceExportTotals,
  type HsnRates,
  type InvoiceExportRow,
  type MaterialLine,
} from "@/lib/invoiceExportRows";
import { formatMoneyExact } from "@/lib/currency";
import { collectionCards, modesOf, paymentModeLabel, PAYMENT_BUCKETS } from "@/lib/paymentModes";
import { npsBreakdown, npsCategory, ratingLabel } from "@/lib/feedbackScores";
import { referralKind, referringDoctorName } from "@/lib/patientReferral";
import { contactsByDoctorKey, doctorNameKey } from "@/lib/referralDoctorName";

/** Written by the Feedback tab when an appointment has no patient attached. */
const NO_PATIENT_ID = "00000000-0000-0000-0000-000000000000";

/** A feedback row as it arrives, before the fetcher flattens it. */
interface FeedbackRow {
  patient_id?: string | null;
  patient_name?: string | null;
  nps_score?: number | null;
  service_rating?: number | null;
  comments?: string | null;
  appointment?: {
    start_time?: string | null;
    reason_for_consultation?: string | null;
    doctor_name?: string | null;
    staff_id?: string | null;
    patient_id?: string | null;
  } | null;
}

interface FeedbackPatient {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
}

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

/** One KPI card above a report. `hint` is a small line under the figure, for a
 *  card whose label cannot say enough on its own - see the Other payment card. */
export interface ReportSummaryCard {
  label: string;
  value: string;
  hint?: string;
}

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
  summary?: (rows: any[]) => ReportSummaryCard[];
  /**
   * The rows as Excel and the PDF should show them, where that differs from the
   * table. A report that sets this is saying its exported sheet is a different
   * shape from its screen - the invoices report splits a bill across its
   * services, which the table must not do because the summary cards and the
   * chart count rows.
   *
   * Export rows carry plain values under the column keys; the columns'
   * accessors are not called on them, because they are already resolved.
   */
  exportRows?: (rows: Record<string, unknown>[]) => Record<string, unknown>[];
  /** A line under the columns that get added up, for the same two outputs. */
  exportTotals?: (exportRows: Record<string, unknown>[]) => Record<string, unknown> | null;
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
    }) => Promise<ReportSummaryCard[]>;
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

/**
 * The doctor to show against an invoice.
 *
 * Prefer the invoice's own doctor_id -> staff, which is what the Doctor filter
 * matches on. Fall back to the doctor_name recorded on the appointment it was
 * raised from: most of the Salesforce-imported history has no staff record to
 * point at, and those invoices would otherwise show a blank column.
 */
interface InvoiceDoctorSource {
  doctor?: { first_name?: string | null; last_name?: string | null } | null;
  appointment?: { doctor_name?: string | null } | null;
}

function invoiceDoctorName(row: InvoiceDoctorSource): string {
  const staff = row?.doctor;
  const fromStaff = `${staff?.first_name ?? ""} ${staff?.last_name ?? ""}`.trim();
  if (fromStaff) return fromStaff;
  return String(row?.appointment?.doctor_name ?? "").trim();
}

const STATUS_APPT = [...ALL_APPOINTMENT_STATUSES];
// No "Cancelled" here: cancelled bills are excluded from this report entirely
// and live in their own (see the cancelled_invoices report below), so offering
// it as a status would only ever return nothing.
const STATUS_INV = ["Pending", "Partial", "Paid"];
const PAY_MODES = ["Cash", "Card", "UPI", "Bank Transfer", "Cheque"];
const CAMPAIGN_TYPES = ["Google Ads", "Meta Ads", "WhatsApp", "Email", "Other"];
const CAMPAIGN_STATUS = ["Planning", "Active", "Completed"];

/**
 * The money columns for a report whose rows are invoices: what was charged
 * before GST, the rate or rates it was charged at, the GST itself, and the
 * total after it.
 *
 * One definition, used by every invoice report - Invoices & Revenue, Cancelled
 * Bills, and any added later - so they never drift apart or get left off a new
 * one. Total keeps the total_amount key it always had, so sorting, the summary
 * cards and the revenue chart are untouched: nothing here changes a figure, it
 * only shows what the figure is made of.
 *
 * GST is shown as an amount as well as a rate, because a mixed bill has no one
 * rate and "Amount x rate" was never going to come back to Total on one. With
 * the amount there, Amount + GST = Total on every row, whatever the rates were.
 */
export const INVOICE_MONEY_COLUMNS: ReportColumn[] = [
  { key: "amount_before_gst", label: "Amount", sortable: true, type: "currency", accessor: (r) => amountBeforeGst(r) },
  { key: "gst_rate", label: "GST %", sortable: true, accessor: (r) => gstRateLabel(r) },
  { key: "gst_amount", label: "GST", sortable: true, type: "currency", accessor: (r) => gstAmount(r) },
  { key: "total_amount", label: "Total", sortable: true, type: "currency" },
];

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
        // Exact counts scan every matching patient row and were timing out; an
        // estimate is enough to drive the pager.
        const counting = search?.trim() || from || to || selects?.source || selects?.status || selects?.doctor
          ? "estimated"
          : "planned";
        let q = supabase
          .from("patients")
          .select("*", { count: counting })
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
    key: "doctor_referrals",
    title: "Doctor Referrals",
    /**
     * Who sends the clinic its patients - and for whom that is still unknown.
     *
     * The Salesforce import brought the referral FLAG across but not the
     * referring doctor's NAME: 152 patients carry "Reference - other Dr" and
     * not one of them says who. They are worth about Rs 12.5 lakh of billing
     * between them. The name is nowhere in this database - not in the backfill
     * staging, the source backup or the suppressed inserts - so recovering it
     * means re-exporting the field from Salesforce. Every one of those 152
     * still has its sf_id, which is why that column is on this report: it is
     * the key the clinic would look each one up by.
     */
    description: "Patients referred by another doctor, with the referring doctor where it is known.",
    category: "Patients",
    /**
     * Dated by registered_at, NOT created_at.
     *
     * created_at is when the ROW was made, and every patient in this database
     * was made by the Salesforce migration on 22 April 2026 - so a report
     * dated by it begins in April 2026 and the clinic's first six years are
     * invisible. The clinic asked for 2023 and could not find it.
     *
     * registered_at is when the patient actually registered. It is populated
     * for all 27,624 of them, app-created ones included, and reaches back to
     * August 2020. The column on this report has always been LABELLED
     * "Registered"; it was simply reading the wrong field.
     */
    defaultSort: { key: "registered_at", dir: "desc" },
    columns: [
      { key: "name", label: "Patient", sortable: true, accessor: (r) => `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() },
      { key: "phone", label: "Phone", sortable: true },
      { key: "referring_doctor", label: "Referring Doctor", sortable: true, accessor: (r) => referringDoctorName(r.source_referral_doctor) },
      // Attached by the fetcher from external_doctors, matched on the
      // normalised name - the patient record carries only free text, so
      // "Dr Gaurav shetty" has to find "Dr. Gaurav Shetty".
      { key: "referring_doctor_phone", label: "Doctor Phone", sortable: true },
      { key: "source", label: "Source", sortable: true, type: "badge" },
      { key: "total_visits", label: "Visits", sortable: true, type: "number" },
      { key: "lifetime_value", label: "Billed", sortable: true, type: "currency" },
      { key: "registered_at", label: "Registered", sortable: true, type: "date" },
      { key: "sf_id", label: "Salesforce ID", sortable: true },
    ],
    filters: [
      { key: "dateRange", label: "Registered", type: "dateRange", serverDateField: "registered_at" },
      {
        // The three spellings doctor referrals actually carry: the Salesforce
        // one and the app's two. Which rows the report shows is decided by
        // referralKind, not by this list, so a fourth spelling would still
        // appear in the report even before it is offered here.
        key: "source", label: "Source", type: "select", field: "source",
        options: ["Reference - other Dr", "Dr. referral", "Other Dr. referral"]
          .map((v) => ({ value: v, label: v })),
      },
      {
        key: "named", label: "Doctor Name Recorded", type: "select",
        options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }],
        matches: (r, v) => (referringDoctorName(r.source_referral_doctor) !== "") === (v === "yes"),
      },
    ],
    searchFields: ["first_name", "last_name", "phone", "source_referral_doctor", "sf_id"],
    rowHref: (r) => `/patients/${r.id}`,
    fetcher: async ({ from, to }) => {
      // Narrowed in the database to the ~550 rows that mention a referral at
      // all, then decided precisely here. referralKind matches on what the
      // words mean, so the Salesforce spelling ("Reference - other Dr") and
      // the app's ("Dr. referral") both land without either being written out
      // again, and patient referrals are correctly left out.
      const rows = await fetchAll((s, e) => {
        let q = supabase.from("patients").select("*").ilike("source", "%refer%")
          .order("registered_at", { ascending: false }).range(s, e);
        if (from) q = q.gte("registered_at", from);
        if (to) q = q.lte("registered_at", to);
        return q;
      });
      const referrals = (rows as Record<string, unknown>[]).filter(
        (r) => referralKind(r.source as string | null) === "doctor",
      );

      // The referring doctor's phone, where the clinic has it. The patient
      // record holds only a typed name, so the match is on the normalised
      // key: a doctor written "Dr Gaurav shetty" on one patient and
      // "Dr. Gaurav Shetty" on another is one doctor with one number.
      //
      // One small query, not one per row, and a failure costs the column
      // rather than the report - the referral list is still worth reading
      // without the phone numbers.
      try {
        const { data: contacts } = await supabase
          .from("external_doctors")
          .select("name, phone, email, clinic_name");
        const byKey = contactsByDoctorKey(contacts ?? []);
        for (const r of referrals) {
          const match = byKey.get(doctorNameKey(referringDoctorName(r.source_referral_doctor as string | null)));
          r.referring_doctor_phone = match?.phone ?? "";
          r.referring_doctor_clinic = match?.clinic_name ?? "";
        }
      } catch {
        for (const r of referrals) r.referring_doctor_phone = "";
      }

      return referrals;
    },
    summary: (rows) => {
      const missing = rows.filter((r) => referringDoctorName(r.source_referral_doctor) === "").length;
      const billed = rows.reduce((sum, r) => sum + Number(r.lifetime_value || 0), 0);
      return [
        { label: "Referred patients", value: String(rows.length) },
        { label: "Referring doctor unknown", value: String(missing), hint: "not migrated from Salesforce" },
        { label: "Billed by referred patients", value: formatMoneyExact(billed) },
      ];
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
      // appointments.doctor_name, not a staff lookup: doctors who left before
      // they ever had a staff record still saw patients, and a report on 2021
      // that shows a blank doctor column is not a report on 2021.
      { key: "doctor_name", label: "Doctor", sortable: true },
      { key: "start_time", label: "Start", sortable: true, type: "datetime" },
      { key: "status", label: "Status", sortable: true, type: "badge" },
    ],
    filters: [
      { key: "dateRange", label: "Appointment Date", type: "dateRange", serverDateField: "start_time" },
      { key: "doctor", label: "Doctor", type: "doctor", matches: (r, v) => String(r.staff_id ?? "") === v },
      { key: "service", label: "Service", type: "service", matches: (r, v) => String(r.service ?? "") === v },
      { key: "status", label: "Status", type: "select", field: "status", options: STATUS_APPT.map(v => ({ value: v, label: v })) },
    ],
    searchFields: ["patient_name", "service", "doctor_name"],
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
    description:
      "Every invoice with the GST charged on it and the material cost to deduct from it.",
    category: "Finance",
    defaultSort: { key: "created_at", dir: "desc" },
    // The order the clinic reads them in: what the visit was, then what it came
    // to, then what to take off it. Paid and Status were dropped from the
    // columns at their request; the Status filter and the collection cards
    // below read the row itself, so both still work.
    //
    // The keys are the ones these figures always had, so sorting, the summary
    // and the revenue chart are untouched - only the labels and the order
    // changed, and the money is the same money.
    columns: [
      { key: "created_at", label: "Date", sortable: true, type: "date" },
      { key: "invoice_number", label: "Invoice #", sortable: true },
      { key: "patient_name", label: "Patient", sortable: true },
      { key: "service", label: "Service", sortable: true, accessor: (r) => invoiceServiceLabel(r) },
      // The invoice's own doctor where it has one, otherwise the doctor recorded
      // on the appointment it was raised from - Salesforce history carries the
      // name but no staff record, and a blank column is not a report.
      {
        key: "doctor_name",
        label: "Doctor",
        sortable: true,
        accessor: (r) => invoiceDoctorName(r),
      },
      {
        key: "payment_mode",
        label: "Mode",
        sortable: true,
        // accessor, not render: reportPdf.ts cannot call render, so a render
        // here would make the printed report say "Split" while the screen
        // named the instruments.
        accessor: (r) => paymentModeLabel(r),
      },
      { key: "total_amount", label: "Total with GST", sortable: true, type: "currency" },
      { key: "gst_rate", label: "GST %", sortable: true, accessor: (r) => gstRateLabel(r) },
      { key: "gst_amount", label: "GST", sortable: true, type: "currency", accessor: (r) => gstAmount(r) },
      { key: "amount_before_gst", label: "Amount before GST", sortable: true, type: "currency", accessor: (r) => amountBeforeGst(r) },
      // Blank, not 0.00, where no percentage was ever recorded - which is most
      // bills, because the percentage is matched by service name against the
      // Service Master. Both figures come from material_cost_lines, the same
      // view the Material Cost report reads, so the two can never disagree.
      { key: "material_percent_label", label: "Material %", sortable: true },
      // What is left after the material comes off, not the material itself -
      // the deduction was being read as the treatment's value. Where no
      // percentage was ever recorded nothing is deducted, so it is the amount
      // before GST unchanged.
      {
        key: "amount_after_deduction",
        label: "Amount after Deduction",
        sortable: true,
        type: "currency",
        accessor: (r) => amountBeforeGst(r) - Number(r.material_cost_total || 0),
      },
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
      // Matched by bucket, not by the literal stored string, so picking UPI
      // finds the Salesforce-era "Google Pay" rows the UPI card counted. An
      // exact-string filter here would contradict the card right above it.
      {
        key: "payment_mode",
        label: "Payment Mode",
        type: "select",
        field: "payment_mode",
        options: PAYMENT_BUCKETS.map((v) => ({ value: v, label: v })),
        matches: (r, v) => modesOf(r).includes(v as (typeof PAYMENT_BUCKETS)[number]),
      },
    ],
    searchFields: ["invoice_number", "patient_name"],
    rowHref: () => `/billing`,
    fetcher: async ({ from, to }) => {
      const [rows, materialLines] = await Promise.all([
        fetchAll((s, e) => {
          let q = supabase
            .from("invoices")
            .select("*, doctor:doctor_id(first_name, last_name), appointment:appointment_id(doctor_name)")
            // A cancelled bill is money the clinic never took, so it must not reach
            // this report at all - not the rows, and so not Total Billed, the
            // collection cards or the revenue chart, which are all derived from them.
            .neq("status", "Cancelled")
            .order("created_at", { ascending: false })
            .range(s, e);
          if (from) q = q.gte("created_at", from);
          if (to) q = q.lte("created_at", to);
          return q;
        }),
        // Only the lines that carry a percentage. A line at 0 deducts nothing
        // and would only put a 0 in a column that means "nobody said" when it
        // is blank. The view excludes cancelled bills too, so the two agree.
        fetchAll((s, e) => {
          let q = supabase
            .from("material_cost_lines")
            // service_name too: the exported sheet puts each line's own
            // percentage against the service it belongs to.
            .select("invoice_id, service_name, material_percent, material_cost")
            .gt("material_percent", 0)
            .order("created_at", { ascending: false })
            .range(s, e);
          if (from) q = q.gte("created_at", from);
          if (to) q = q.lte("created_at", to);
          return q;
        }),
      ]);
      // The Tax Master, carried on the rows rather than in a module-level
      // cache: the exported sheet resolves each line's GST from its HSN, and a
      // rate that depends on which page was opened first is not a report.
      const { data: hsnRows } = await supabase
        .from("hsn_tax_master")
        .select("hsn_code, sgst, cgst, igst")
        .eq("is_active", true);
      const hsn_rates: HsnRates = {};
      for (const h of (hsnRows ?? []) as Record<string, unknown>[]) {
        hsn_rates[String(h.hsn_code ?? "").trim()] =
          Number(h.sgst || 0) + Number(h.cgst || 0) + Number(h.igst || 0);
      }

      const linesByInvoice = new Map<string, MaterialLine[]>();
      for (const line of (materialLines ?? []) as MaterialLine[]) {
        const id = String(line?.invoice_id ?? "").trim();
        if (!id) continue;
        const found = linesByInvoice.get(id);
        if (found) found.push(line);
        else linesByInvoice.set(id, [line]);
      }

      return attachMaterialCost(rows as { id?: string | null }[], materialLines as MaterialCostLine[])
        .map((r) => ({
          ...r,
          hsn_rates,
          material_lines: linesByInvoice.get(String(r?.id ?? "").trim()) ?? [],
        }));
    },
    // Excel and the PDF only. The table keeps one row per invoice, because the
    // Invoices count, Total Billed, the collection cards and the chart all
    // reduce over the rows it holds.
    exportRows: (rows) =>
      invoiceExportSheet(rows, {
        doctorName: (r) => invoiceDoctorName(r as InvoiceDoctorSource),
        paymentMode: (r) => paymentModeLabel(r),
      }) as unknown as Record<string, unknown>[],
    exportTotals: (rows) => invoiceExportTotals(rows as unknown as InvoiceExportRow[]),
    // Collections split by instrument rather than one "Collected" lump: the
    // front desk reconciles the UPI takings against the bank, the cash against
    // the drawer, and could do neither from a single figure. Only the
    // instruments actually used in the period get a card, so a clinic that
    // never takes cheques never sees a cheque card. The buckets add up to what
    // "Collected" used to say, so Outstanding is still Total Billed less them.
    summary: (rows) => {
      const total = rows.reduce((a, r) => a + Number(r.total_amount || 0), 0);
      return [
        { label: "Invoices", value: rows.length.toLocaleString() },
        { label: "Total Billed", value: formatMoneyExact(total) },
        ...collectionCards(rows, formatMoneyExact),
      ];
    },
    chart: {
      title: "Revenue by Month",
      valueLabel: "₹ Total",
      build: (rows) => groupSumByMonth(rows, "created_at", "total_amount"),
    },
  },
  // Cancelled bills, kept deliberately apart from Invoices & Revenue. A bill is
  // cancelled when the front desk raises it wrongly, so its value was never
  // earned and must not sit in revenue - but the clinic still needs to see what
  // was cancelled, by whom and why, which is what this report is for.
  {
    key: "cancelled_invoices",
    title: "Cancelled Invoices",
    description: "Bills cancelled by the clinic, with who cancelled them and the reason.",
    category: "Finance",
    defaultSort: { key: "cancelled_at", dir: "desc" },
    columns: [
      { key: "invoice_number", label: "Billing ID", sortable: true },
      { key: "patient_name", label: "Patient", sortable: true },
      ...INVOICE_MONEY_COLUMNS,
      { key: "cancellation_reason", label: "Reason", sortable: true },
      { key: "cancelled_by_name", label: "Cancelled By", sortable: true },
      { key: "cancelled_at", label: "Cancelled On", sortable: true, type: "datetime" },
      { key: "doctor_name", label: "Doctor", sortable: true, accessor: (r) => invoiceDoctorName(r) },
      { key: "created_at", label: "Billed On", sortable: true, type: "date" },
    ],
    filters: [
      { key: "dateRange", label: "Cancelled Date", type: "dateRange", serverDateField: "cancelled_at" },
      { key: "doctor", label: "Doctor", type: "doctor", matches: (r, v) => String(r.doctor_id ?? "") === v },
      {
        key: "payment_mode",
        label: "Payment Mode",
        type: "select",
        field: "payment_mode",
        options: PAYMENT_BUCKETS.map((v) => ({ value: v, label: v })),
        matches: (r, v) => modesOf(r).includes(v as (typeof PAYMENT_BUCKETS)[number]),
      },
    ],
    searchFields: ["invoice_number", "patient_name", "cancellation_reason", "cancelled_by_name"],
    rowHref: () => `/billing`,
    fetcher: async ({ from, to }) =>
      fetchAll((s, e) => {
        let q = supabase
          .from("invoices")
          .select("*, doctor:doctor_id(first_name, last_name), appointment:appointment_id(doctor_name)")
          .eq("status", "Cancelled")
          .order("cancelled_at", { ascending: false, nullsFirst: false })
          .range(s, e);
        // The date bounds read cancelled_at, but a cancelled bill that carries no
        // timestamp - imported history, or one cancelled before the field existed -
        // is still a cancelled bill the clinic has to be able to find. Including
        // nulls on both bounds means a date range narrows the list without ever
        // making a row disappear from every range at once.
        if (from) q = q.or(`cancelled_at.gte.${from},cancelled_at.is.null`);
        if (to) q = q.or(`cancelled_at.lte.${to},cancelled_at.is.null`);
        return q;
      }),
    summary: (rows) => {
      const total = rows.reduce((a, r) => a + Number(r.total_amount || 0), 0);
      return [
        { label: "Cancelled Invoices", value: rows.length.toLocaleString() },
        {
          label: "Value Cancelled",
          value: formatMoneyExact(total),
          hint: "Not counted in Invoices & Revenue",
        },
      ];
    },
    chart: {
      title: "Cancellations by Month",
      valueLabel: "₹ Cancelled",
      build: (rows) => groupSumByMonth(rows, "cancelled_at", "total_amount"),
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
        { label: "Total Spent", value: formatMoneyExact(total) },
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
        { label: "Total", value: formatMoneyExact(total) },
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
        { label: "Total Budget", value: formatMoneyExact(budget) },
        { label: "Total Spent", value: formatMoneyExact(spent) },
        { label: "Total Revenue", value: formatMoneyExact(revenue) },
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
  // Material cost, so the clinic can deduct what a service consumed from what
  // it earned, per service or per doctor. Deliberately its own report and not a
  // column on Invoices & Revenue: this is an internal margin figure, it never
  // appears on an invoice or a printed bill, and putting it beside Total Billed
  // is how it ends up quoted to a patient.
  //
  // The arithmetic lives in the material_cost_lines view, one row per billed
  // service line. See that migration for which percentage wins - the one typed
  // on the visit beats the Service Master's, so correcting the master later
  // does not rewrite what a past visit cost.
  {
    key: "material_cost",
    title: "Material Cost",
    description: "Material cost per billed service, to deduct by service or doctor. Internal only — never on an invoice.",
    category: "Finance",
    defaultSort: { key: "created_at", dir: "desc" },
    columns: [
      { key: "invoice_number", label: "Invoice #", sortable: true },
      { key: "patient_name", label: "Patient", sortable: true },
      { key: "service_name", label: "Service", sortable: true },
      { key: "service_amount", label: "Service Value", sortable: true, type: "currency" },
      { key: "material_percent", label: "Material %", sortable: true, type: "number" },
      { key: "material_cost", label: "Material Cost", sortable: true, type: "currency" },
      { key: "doctor_name", label: "Doctor", sortable: true, accessor: (r) => invoiceDoctorName(r) },
      { key: "created_at", label: "Date", sortable: true, type: "date" },
    ],
    filters: [
      { key: "dateRange", label: "Billed", type: "dateRange", serverDateField: "created_at" },
      { key: "doctor", label: "Doctor", type: "doctor", matches: (r, v) => String(r.doctor_id ?? "") === v },
      { key: "service", label: "Service", type: "service", matches: (r, v) => String(r.service_name ?? "") === v },
    ],
    searchFields: ["invoice_number", "patient_name", "service_name"],
    rowHref: () => `/billing`,
    // Only lines that actually carry a percentage. A report of thousands of
    // zero rows would bury the handful that cost something, and the clinic is
    // here to deduct, not to browse everything it billed.
    fetcher: async ({ from, to }) =>
      fetchAll((s, e) => {
        let q = supabase
          .from("material_cost_lines")
          .select("*, doctor:doctor_id(first_name, last_name), appointment:appointment_id(doctor_name)")
          .gt("material_percent", 0)
          .order("created_at", { ascending: false })
          .range(s, e);
        if (from) q = q.gte("created_at", from);
        if (to) q = q.lte("created_at", to);
        return q;
      }),
    summary: (rows) => {
      const value = rows.reduce((a, r) => a + Number(r.service_amount || 0), 0);
      const cost = rows.reduce((a, r) => a + Number(r.material_cost || 0), 0);
      return [
        { label: "Billed Lines", value: rows.length.toLocaleString() },
        { label: "Service Value", value: formatMoneyExact(value) },
        { label: "Material Cost", value: formatMoneyExact(cost) },
        {
          label: "Net of Material",
          value: formatMoneyExact(value - cost),
          hint: value > 0 ? `${((cost / value) * 100).toFixed(1)}% of service value` : undefined,
        },
      ];
    },
    chart: {
      title: "Material Cost by Service",
      valueLabel: "₹ Material",
      orientation: "horizontal",
      build: (rows) => groupSum(rows, "service_name", "material_cost", 10, "Unnamed"),
    },
  },
  {
    key: "patient_feedback",
    title: "Patient Feedback",
    description: "Every NPS score and star rating patients have left, with the visit it was about.",
    category: "Patients",
    defaultSort: { key: "created_at", dir: "desc" },
    columns: [
      { key: "created_at", label: "Submitted", sortable: true, type: "datetime" },
      { key: "patient_name", label: "Patient", sortable: true },
      { key: "phone", label: "Phone", sortable: true },
      { key: "doctor_name", label: "Doctor", sortable: true },
      { key: "appointment_date", label: "Visit Date", sortable: true, type: "date" },
      // "Investigation" is reason_for_consultation everywhere else in the app -
      // the appointments list, the patient's Appts tab, the prescription. This
      // read `service`, which only Salesforce-imported appointments carry, so
      // every visit booked in the app showed a dash.
      { key: "investigation", label: "Investigation", sortable: true },
      { key: "nps_score", label: "NPS", sortable: true, type: "number" },
      // accessor, not render: the printed report and the CSV cannot call
      // render, and the band is the part a reader actually acts on.
      { key: "nps_category", label: "NPS Group", sortable: true, type: "badge", accessor: (r) => npsCategory(r.nps_score) },
      { key: "service_rating", label: "Stars", sortable: true, type: "number" },
      { key: "rating_label", label: "Rating", sortable: true, accessor: (r) => ratingLabel(r.service_rating) },
      { key: "comments", label: "Comments", sortable: false },
    ],
    filters: [
      { key: "dateRange", label: "Submitted", type: "dateRange", serverDateField: "created_at" },
      { key: "doctor", label: "Doctor", type: "doctor", matches: (r, v) => String(r.staff_id ?? "") === v },
      {
        key: "nps_category",
        label: "NPS Group",
        type: "select",
        field: "nps_category",
        options: ["Promoter", "Passive", "Detractor"].map((v) => ({ value: v, label: v })),
      },
      {
        key: "service_rating",
        label: "Star Rating",
        type: "select",
        field: "service_rating",
        options: [5, 4, 3, 2, 1].map((v) => ({ value: String(v), label: `${v} star${v === 1 ? "" : "s"}` })),
        matches: (r, v) => String(r.service_rating ?? "") === v,
      },
      {
        key: "has_comment",
        label: "Comment",
        type: "select",
        field: "has_comment",
        options: [
          { value: "yes", label: "With a comment" },
          { value: "no", label: "Score only" },
        ],
      },
    ],
    searchFields: ["patient_name", "phone", "comments", "doctor_name", "investigation"],
    rowHref: (r) => (r.appointment_id ? `/appointments?appointmentDetail=${r.appointment_id}` : null),
    /**
     * Two fetches, not one embed: patient_feedback.patient_id has no foreign
     * key, so PostgREST cannot embed patients from it. The appointment carries
     * the doctor, the visit date and the investigation; the patient is looked
     * up separately for the phone number. Everything is flattened onto the row
     * because searchFields and the select filters only see flat fields.
     */
    fetcher: async ({ from, to }) => {
      const rows = await fetchAll((s, e) => {
        let q = supabase
          .from("patient_feedback")
          .select("*, appointment:appointment_id(start_time, reason_for_consultation, doctor_name, staff_id, patient_id)")
          .order("created_at", { ascending: false })
          .range(s, e);
        if (from) q = q.gte("created_at", from);
        if (to) q = q.lte("created_at", to);
        return q;
      });

      // The Feedback tab writes a zero uuid when an appointment has no patient,
      // so it is not an id to look anything up by.
      const ids = Array.from(
        new Set(
          rows
            .map((r: FeedbackRow) => r.patient_id || r.appointment?.patient_id)
            .filter((id): id is string => !!id && id !== NO_PATIENT_ID),
        ),
      );
      const patients = ids.length
        ? await fetchAll((s, e) =>
            supabase.from("patients").select("id, first_name, last_name, phone").in("id", ids).range(s, e),
          )
        : [];
      const byId = new Map((patients as FeedbackPatient[]).map((p) => [p.id, p]));

      return (rows as FeedbackRow[]).map((r) => {
        const p = byId.get(r.patient_id) || byId.get(r.appointment?.patient_id);
        const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
        return {
          ...r,
          // The row carries a copy of the name from when it was left; the live
          // patient record wins when there is one, so a renamed patient reads
          // correctly here too.
          patient_name: name || r.patient_name || "",
          phone: p?.phone || "",
          doctor_name: r.appointment?.doctor_name || "",
          staff_id: r.appointment?.staff_id || "",
          appointment_date: r.appointment?.start_time || null,
          investigation: r.appointment?.reason_for_consultation || "",
          nps_category: npsCategory(r.nps_score),
          rating_label: ratingLabel(r.service_rating),
          has_comment: String(r.comments || "").trim() ? "yes" : "no",
        };
      });
    },
    summary: (rows) => {
      const b = npsBreakdown(rows as { nps_score?: number | null; service_rating?: number | null }[]);
      return [
        { label: "Responses", value: b.responses.toLocaleString() },
        {
          label: "NPS",
          value: b.nps === null ? "-" : String(b.nps),
          hint: "% promoters minus % detractors",
        },
        {
          label: "Avg Rating",
          value: b.averageRating === null ? "-" : `${b.averageRating.toFixed(2)} / 5`,
          hint: b.averageScore === null ? undefined : `Avg NPS score ${b.averageScore.toFixed(2)} / 10`,
        },
        {
          label: "Promoters",
          value: b.promoters.toLocaleString(),
          hint: `${b.passives} passive, ${b.detractors} detractor${b.detractors === 1 ? "" : "s"}`,
        },
      ];
    },
    chart: {
      title: "Responses by NPS Group",
      valueLabel: "Responses",
      build: (rows) =>
        (["Promoter", "Passive", "Detractor"] as const).map((label) => ({
          label,
          value: (rows as FeedbackRow[]).filter((r) => npsCategory(r.nps_score) === label).length,
        })),
    },
  },
];

export function getReport(key: string) {
  return REPORTS.find((r) => r.key === key);
}