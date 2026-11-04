/**
 * Who had a service, what it earned, and how it was rated.
 *
 * Service Master could only edit a service. This is the arithmetic behind the
 * Patients and Reports tabs that answer the other question - who actually had
 * it - kept here rather than in the component so it can be tested without
 * Supabase, and so the awkward parts below are written down once.
 *
 * Two awkward parts, both from the Salesforce migration:
 *
 *  - There is no single link from a service to an appointment. The caller
 *    unions three (procedure_services.service_id, appointments.service by
 *    name, procedures.service_name by name), because no one of them is
 *    enough - HYDRADELUXE has 676 procedures by id against 468 appointments
 *    by name, and those are not the same set.
 *
 *  - Money lives in invoices.line_items, a jsonb array, and most of it
 *    predates service_id. Of 57,055 line items only 620 carry one, and only
 *    3.7% of the legacy lines have a name matching a service in the master.
 *    So a service's revenue is a floor, not a total, and the screen has to
 *    say so - which is why the roll-up reports billedCount beside it.
 */

/** One line off an invoice's line_items jsonb. Every field is as stored. */
export interface ServiceLineItem {
  name?: string | null;
  price?: number | string | null;
  qty?: number | string | null;
  service_id?: string | null;
  kind?: string | null;
}

/** The service being looked at. */
export interface ServiceRef {
  id: string;
  name: string;
}

/** One appointment at which this service was given. */
export interface ServiceUsageRow {
  appointmentId: string;
  patientId: string | null;
  patientName: string | null;
  /** ISO timestamp of the appointment. Everything is bucketed by this. */
  startTime: string;
  doctorId: string | null;
  doctorName: string | null;
  /** What this service was billed at here. null when no bill could be matched. */
  value: number | null;
  /** service_rating, 1-5. null when the visit was never rated. */
  rating: number | null;
}

export interface ServiceUsageRollUp {
  /** Distinct patients - "total customer serviced" counts a returning patient once. */
  patients: number;
  appointments: number;
  revenue: number;
  /** null rather than 0 when nothing is rated, so the card can say so. */
  avgRating: number | null;
  ratedCount: number;
  /** Appointments whose bill could be attributed to this service. */
  billedCount: number;
}

export interface ServiceMonth {
  /** Sortable key, YYYY-MM. */
  key: string;
  /** For the chart axis, e.g. "Jan 2026". */
  label: string;
  revenue: number;
  appointments: number;
  feedbackCount: number;
  /** null when nothing was rated that month - a gap, not a zero. */
  avgScore: number | null;
}

/**
 * Is this the same service by name?
 *
 * Trimmed and case-insensitive, because the same treatment is written
 * "EXION ", "Exion" and "exion" across appointments, procedures and bills.
 * One place, so the three call sites cannot drift apart.
 */
export function sameServiceName(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = (a ?? "").trim().toLowerCase();
  const right = (b ?? "").trim().toLowerCase();
  return left.length > 0 && left === right;
}

const asNumber = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The bill lines belonging to this service.
 *
 * A line that carries a service_id is judged on that alone: if it names a
 * different service the id still wins, because the id was recorded by the app
 * and the name is free text someone may since have edited. Only a line with
 * no service_id falls back to its name.
 */
export function lineItemsForService(
  lineItems: ServiceLineItem[] | null | undefined,
  service: ServiceRef,
): ServiceLineItem[] {
  if (!Array.isArray(lineItems)) return [];
  return lineItems.filter((line) => {
    const id = (line?.service_id ?? "").trim();
    if (id) return id === service.id;
    return sameServiceName(line?.name, service.name);
  });
}

/** What those lines come to. qty defaults to 1: most legacy lines omit it. */
export function lineItemsTotal(lines: ServiceLineItem[]): number {
  return lines.reduce((sum, line) => {
    const qty = line?.qty == null || line.qty === "" ? 1 : asNumber(line.qty);
    return sum + asNumber(line?.price) * qty;
  }, 0);
}

export function rollUpServiceUsage(rows: ServiceUsageRow[]): ServiceUsageRollUp {
  const patients = new Set<string>();
  let revenue = 0;
  let ratingTotal = 0;
  let ratedCount = 0;
  let billedCount = 0;

  for (const row of rows) {
    // Falling back to the appointment keeps an unlinked walk-in from merging
    // with every other patient who has no id.
    patients.add(row.patientId || `appt:${row.appointmentId}`);
    if (row.value != null) {
      revenue += row.value;
      billedCount += 1;
    }
    if (row.rating != null) {
      ratingTotal += row.rating;
      ratedCount += 1;
    }
  }

  return {
    patients: patients.size,
    appointments: rows.length,
    revenue,
    avgRating: ratedCount > 0 ? ratingTotal / ratedCount : null,
    ratedCount,
    billedCount,
  };
}

/**
 * Narrow the rows to a period and a doctor.
 *
 * In memory rather than in the database: one service's rows number in the
 * hundreds and are already fetched, so a filter should not cost a round trip.
 * "now" is a parameter so a test is not at the mercy of the clock.
 */
export function filterServiceUsage(
  rows: ServiceUsageRow[],
  filters: { periodMonths: number; doctorId: string | null },
  now: Date = new Date(),
): ServiceUsageRow[] {
  const from = filters.periodMonths > 0
    ? new Date(new Date(now).setMonth(now.getMonth() - filters.periodMonths))
    : null;

  return rows.filter((row) => {
    if (filters.doctorId && (row.doctorId ?? "") !== filters.doctorId) return false;
    if (!from) return true;
    const when = new Date(row.startTime);
    // An unreadable date is dropped by a period filter rather than kept on a
    // guess - it cannot be shown to fall inside one.
    if (Number.isNaN(when.getTime())) return false;
    return when >= from;
  });
}

/** YYYY-MM in the clinic's own timezone, which is how they read a month. */
function monthKeyOf(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function labelOf(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

/**
 * A row per month, for all three charts at once.
 *
 * Every month between the first and the last is present even when nothing
 * happened in it, so the three charts share one x-axis and a quiet month reads
 * as quiet rather than being skipped over.
 *
 * Revenue is bucketed by the APPOINTMENT's month, not the invoice's. The three
 * charts and the filters above them then all answer the same question; billing
 * a January visit in February would otherwise move money to a month with no
 * appointment to explain it.
 */
export function monthlyServiceSeries(rows: ServiceUsageRow[]): ServiceMonth[] {
  const buckets = new Map<string, { revenue: number; appointments: number; ratingTotal: number; rated: number }>();

  for (const row of rows) {
    const key = monthKeyOf(row.startTime);
    if (!key) continue;
    const bucket = buckets.get(key) ?? { revenue: 0, appointments: 0, ratingTotal: 0, rated: 0 };
    bucket.appointments += 1;
    if (row.value != null) bucket.revenue += row.value;
    if (row.rating != null) {
      bucket.ratingTotal += row.rating;
      bucket.rated += 1;
    }
    buckets.set(key, bucket);
  }

  const keys = [...buckets.keys()].sort();
  if (keys.length === 0) return [];

  const out: ServiceMonth[] = [];
  const [firstYear, firstMonth] = keys[0].split("-").map(Number);
  const [lastYear, lastMonth] = keys[keys.length - 1].split("-").map(Number);

  for (let y = firstYear, m = firstMonth; y < lastYear || (y === lastYear && m <= lastMonth); ) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const bucket = buckets.get(key);
    out.push({
      key,
      label: labelOf(key),
      revenue: bucket?.revenue ?? 0,
      appointments: bucket?.appointments ?? 0,
      feedbackCount: bucket?.rated ?? 0,
      avgScore: bucket && bucket.rated > 0 ? bucket.ratingTotal / bucket.rated : null,
    });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }

  return out;
}
