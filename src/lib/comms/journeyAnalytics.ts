// Pure analytics maths for the Journey Analytics page. No React, no database: the page feeds in rows.
// Dates are bucketed in IST (the clinic's timezone) rather than the viewer's browser time.

export interface AnalyticsMessage {
  id: string;
  patient_id: string | null;
  node_id: string | null;
  status: string;
  delivery_status: string | null;
  error_code: string | null;
  error_message: string | null;
  sent_at: string;
}

export interface AnalyticsEnrollment {
  id: string;
  patient_id: string;
  status: string;
  enrolled_at: string;
}

export interface AnalyticsAppointment {
  patient_id: string | null;
  created_at: string;
}

export interface AnalyticsInvoice {
  patient_id: string | null;
  created_at: string;
  paid_amount: number | null;
}

export interface AnalyticsInput {
  messages: AnalyticsMessage[];
  enrollments: AnalyticsEnrollment[];
  appointments: AnalyticsAppointment[];
  invoices: AnalyticsInvoice[];
  range?: { from: Date; to: Date };
}

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

const FAILED_STATUSES = new Set(["failed", "undelivered"]);

export const isDeliveredMsg = (m: AnalyticsMessage) =>
  m.status === "delivered" || m.status === "read" || m.delivery_status === "delivered";
export const isReadMsg = (m: AnalyticsMessage) => m.status === "read";
export const isFailedMsg = (m: AnalyticsMessage) =>
  FAILED_STATUSES.has(m.status) || m.delivery_status === "failed";

function istDate(iso: string | Date): Date {
  return new Date(new Date(iso).getTime() + IST_OFFSET_MS);
}

/** YYYY-MM-DD of the IST calendar day. */
export function istDayKey(iso: string | Date): string {
  return istDate(iso).toISOString().slice(0, 10);
}

/** YYYY-MM-DD of the Monday (IST) that starts the week containing `iso`. */
export function istWeekStartKey(iso: string | Date): string {
  const d = istDate(iso);
  const dow = d.getUTCDay(); // 0 = Sunday
  const back = (dow + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)).toISOString().slice(0, 10);
}

const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);

export interface JourneyAnalyticsResult {
  hasData: boolean;
  kpis: {
    entered: number;
    active: number;
    completed: number;
    delivered: number;
    read: number;
    failed: number;
    sent: number;
    pending: number;
    deliveryRate: number;
    readRate: number;
    bookedPatients: number;
    bookings: number;
    conversionRate: number;
    revenue: number;
    avgInvoiceValue: number;
    revenuePerPatient: number;
    messagesSent: number;
    readMessages: number;
    deliveredMessages: number;
  };
  funnel: { label: string; count: number; tracked: boolean }[];
  trend: { day: string; delivered: number; read: number }[];
  heat: number[][];
  segments: { warm: number; cold: number; lost: number; highValue: number };
  attribution: Record<"d1" | "d7" | "d15" | "d30", { revenue: number; bookings: number }>;
  cohorts: { week: string; entered: number; d1ReadPct: number; d7ReadPct: number; d30ConvPct: number }[];
  health: { score: number; label: string; strengths: string[]; areas: string[] };
}

export function healthLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Needs attention";
  return "At risk";
}

export function computeJourneyAnalytics(input: AnalyticsInput): JourneyAnalyticsResult {
  const { range } = input;
  const messages = range
    ? input.messages.filter((m) => {
        const t = new Date(m.sent_at).getTime();
        return t >= range.from.getTime() && t <= range.to.getTime();
      })
    : input.messages;

  const personOf = (m: AnalyticsMessage) => m.patient_id ?? `msg:${m.id}`;

  // Latest enrollment per patient (a patient is enrolled once per journey, but be safe).
  const latestEnrollment = new Map<string, AnalyticsEnrollment>();
  for (const e of input.enrollments) {
    const cur = latestEnrollment.get(e.patient_id);
    if (!cur || new Date(e.enrolled_at) > new Date(cur.enrolled_at)) latestEnrollment.set(e.patient_id, e);
  }

  const deliveredPeople = new Set<string>();
  const readPeople = new Set<string>();
  const failedRaw = new Set<string>();
  const sentPeople = new Set<string>();
  const firstSent = new Map<string, number>();
  for (const m of messages) {
    const p = personOf(m);
    const t = new Date(m.sent_at).getTime();
    if (!firstSent.has(p) || t < firstSent.get(p)!) firstSent.set(p, t);
    if (isDeliveredMsg(m)) deliveredPeople.add(p);
    if (isReadMsg(m)) readPeople.add(p);
    if (isFailedMsg(m)) failedRaw.add(p);
    else sentPeople.add(p);
  }
  const failedPeople = new Set([...failedRaw].filter((p) => !deliveredPeople.has(p)));

  const entered = latestEnrollment.size > 0 ? latestEnrollment.size : new Set(messages.map(personOf)).size;
  const enrollmentValues = [...latestEnrollment.values()];
  const active = enrollmentValues.filter((e) => e.status === "active" || e.status === "pending_delivery").length;
  const completed = enrollmentValues.filter((e) => e.status === "completed").length;

  // Attribution: appointments and paid invoices from people we messaged, on/after their first message.
  const reached = new Set(firstSent.keys());
  const bookedPeople = new Set<string>();
  const bookingTimes: { person: string; t: number }[] = [];
  for (const a of input.appointments) {
    if (!a.patient_id || !reached.has(a.patient_id)) continue;
    const t = new Date(a.created_at).getTime();
    if (t >= firstSent.get(a.patient_id)!) {
      bookedPeople.add(a.patient_id);
      bookingTimes.push({ person: a.patient_id, t });
    }
  }
  const paid: { person: string; t: number; amount: number }[] = [];
  for (const inv of input.invoices) {
    const amount = Number(inv.paid_amount || 0);
    if (!inv.patient_id || amount <= 0 || !reached.has(inv.patient_id)) continue;
    const t = new Date(inv.created_at).getTime();
    if (t >= firstSent.get(inv.patient_id)!) paid.push({ person: inv.patient_id, t, amount });
  }
  const revenue = paid.reduce((s, x) => s + x.amount, 0);
  const payingPeople = new Set(paid.map((x) => x.person));

  const attribution = { d1: { revenue: 0, bookings: 0 }, d7: { revenue: 0, bookings: 0 }, d15: { revenue: 0, bookings: 0 }, d30: { revenue: 0, bookings: 0 } };
  const windows: ["d1" | "d7" | "d15" | "d30", number][] = [["d1", 1], ["d7", 7], ["d15", 15], ["d30", 30]];
  for (const [key, days] of windows) {
    for (const x of paid) if ((x.t - firstSent.get(x.person)!) / DAY_MS <= days) attribution[key].revenue += x.amount;
    for (const b of bookingTimes) if ((b.t - firstSent.get(b.person)!) / DAY_MS <= days) attribution[key].bookings += 1;
  }

  // Trend (per IST day) and heatmap (read messages, IST weekday x hour; sent time because there is no read time).
  const trendMap = new Map<string, { delivered: number; read: number }>();
  const heat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const m of messages) {
    const day = istDayKey(m.sent_at);
    const row = trendMap.get(day) ?? { delivered: 0, read: 0 };
    if (isDeliveredMsg(m)) row.delivered++;
    if (isReadMsg(m)) {
      row.read++;
      const d = istDate(m.sent_at);
      heat[d.getUTCDay()][d.getUTCHours()]++;
    }
    trendMap.set(day, row);
  }
  const trend = [...trendMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v }));

  // Cohorts: weekly by enrollment, read within 1 / 7 days, booked within 30 days.
  const readByPerson = new Map<string, number[]>();
  for (const m of input.messages) {
    if (!isReadMsg(m)) continue;
    const p = personOf(m);
    readByPerson.set(p, [...(readByPerson.get(p) ?? []), new Date(m.sent_at).getTime()]);
  }
  const bookingsByPerson = new Map<string, number[]>();
  for (const a of input.appointments) {
    if (!a.patient_id) continue;
    bookingsByPerson.set(a.patient_id, [...(bookingsByPerson.get(a.patient_id) ?? []), new Date(a.created_at).getTime()]);
  }
  const cohortMap = new Map<string, AnalyticsEnrollment[]>();
  for (const e of enrollmentValues) {
    const wk = istWeekStartKey(e.enrolled_at);
    cohortMap.set(wk, [...(cohortMap.get(wk) ?? []), e]);
  }
  const cohorts = [...cohortMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([week, list]) => {
      const within = (e: AnalyticsEnrollment, times: number[] | undefined, days: number) => {
        const start = new Date(e.enrolled_at).getTime();
        return (times ?? []).some((t) => t >= start && t - start <= days * DAY_MS);
      };
      return {
        week,
        entered: list.length,
        d1ReadPct: pct(list.filter((e) => within(e, readByPerson.get(e.patient_id), 1)).length, list.length),
        d7ReadPct: pct(list.filter((e) => within(e, readByPerson.get(e.patient_id), 7)).length, list.length),
        d30ConvPct: pct(list.filter((e) => within(e, bookingsByPerson.get(e.patient_id), 30)).length, list.length),
      };
    });

  const deliveryRate = pct(deliveredPeople.size, entered);
  const readRate = pct(readPeople.size, entered);
  const failedRate = pct(failedPeople.size, entered);

  const strengths: string[] = [];
  const areas: string[] = [];
  if (messages.length > 0) {
    if (deliveryRate >= 90) strengths.push("Delivery rate above 90%");
    else areas.push("Delivery rate below 90%");
    if (readRate >= 60) strengths.push("Read rate above 60%");
    else areas.push("Read rate below 60%");
    if (failedRate >= 5) areas.push("Failed deliveries elevated");
  }
  const raw = Math.min(30, deliveryRate * 0.3) + Math.min(30, readRate * 0.4) - Math.min(20, failedRate);
  const score = messages.length === 0 ? 0 : Math.max(0, Math.min(100, Math.round(raw + 40)));

  return {
    hasData: messages.length > 0 || enrollmentValues.length > 0,
    kpis: {
      entered,
      active,
      completed,
      delivered: deliveredPeople.size,
      read: readPeople.size,
      failed: failedPeople.size,
      sent: sentPeople.size,
      pending: Math.max(0, entered - sentPeople.size - failedPeople.size),
      deliveryRate,
      readRate,
      bookedPatients: bookedPeople.size,
      bookings: bookingTimes.length,
      conversionRate: pct(bookedPeople.size, entered),
      revenue,
      avgInvoiceValue: paid.length ? revenue / paid.length : 0,
      revenuePerPatient: payingPeople.size ? revenue / payingPeople.size : 0,
      messagesSent: messages.length,
      readMessages: messages.filter(isReadMsg).length,
      deliveredMessages: messages.filter(isDeliveredMsg).length,
    },
    funnel: [
      { label: "Entered Journey", count: entered, tracked: true },
      { label: "Delivered", count: deliveredPeople.size, tracked: true },
      { label: "Read", count: readPeople.size, tracked: true },
      { label: "Clicked", count: 0, tracked: false },
      { label: "Replied", count: 0, tracked: false },
      { label: "Appointment Booked", count: bookedPeople.size, tracked: true },
    ],
    trend,
    heat,
    segments: {
      warm: readPeople.size,
      cold: [...deliveredPeople].filter((p) => !readPeople.has(p)).length,
      lost: failedPeople.size,
      highValue: payingPeople.size,
    },
    attribution,
    cohorts,
    health: { score, label: healthLabel(score), strengths, areas },
  };
}
