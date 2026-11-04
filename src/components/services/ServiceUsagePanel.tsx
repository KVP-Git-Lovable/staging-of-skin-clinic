import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, ComposedChart, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Star } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import { shortAppointmentId } from "@/lib/utils";
import {
  sameServiceName, lineItemsForService, lineItemsTotal,
  rollUpServiceUsage, monthlyServiceSeries, filterServiceUsage,
  type ServiceUsageRow, type ServiceLineItem,
} from "@/lib/serviceUsage";

/**
 * Who had this service, what it earned, and how it was rated.
 *
 * Both tabs read one fetch. The row count for a single service is in the
 * hundreds, so the Reports filters narrow the rows already in memory rather
 * than going back to the database - which is why moving a filter is instant
 * and why switching tabs costs nothing.
 */

/** PostgREST has a URL length to respect, so id lists go over in batches. */
const CHUNK = 300;
const chunked = <T,>(items: T[], size = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

interface AppointmentRow {
  id: string;
  patient_id: string | null;
  patient_name: string | null;
  start_time: string;
  staff_id: string | null;
  doctor_name: string | null;
}

async function fetchServiceUsage(serviceId: string, serviceName: string): Promise<ServiceUsageRow[]> {
  const needle = serviceName.trim();
  if (!needle) return [];
  const service = { id: serviceId, name: needle };
  const columns = "id, patient_id, patient_name, start_time, staff_id, doctor_name";
  const columnsWithService = `${columns}, service`;

  // Three links, because no one of them is enough. HYDRADELUXE has 676
  // procedures carrying its id against 468 appointments carrying its name,
  // and those are not the same visits.
  //
  // The database is asked for a CONTAINS match and the exact comparison is
  // made here: names were migrated with stray case and trailing spaces
  // ("EXION "), which an equality filter would miss, and sameServiceName is
  // the one place that comparison is defined.
  const [byName, viaServiceId, byProcedureName] = await Promise.all([
    supabase.from("appointments").select(columnsWithService).ilike("service", `%${needle}%`).limit(2000),
    supabase.from("procedure_services").select("procedure_id").eq("service_id", serviceId),
    supabase.from("procedures").select("appointment_id, service_name").ilike("service_name", `%${needle}%`).limit(2000),
  ]);
  if (byName.error) throw byName.error;
  if (viaServiceId.error) throw viaServiceId.error;
  if (byProcedureName.error) throw byProcedureName.error;

  const appointments = new Map<string, AppointmentRow>();
  for (const row of (byName.data ?? []) as unknown as (AppointmentRow & { service: string | null })[]) {
    // CONTAINS was only to get the candidates out of the database. "%EXION%"
    // also matches EXION MNRF, which is a different service entirely.
    if (sameServiceName(row.service, needle)) appointments.set(row.id, row);
  }

  const extraIds = new Set<string>();
  for (const row of (byProcedureName.data ?? []) as { appointment_id: string | null; service_name: string | null }[]) {
    if (row.appointment_id && sameServiceName(row.service_name, needle)) extraIds.add(row.appointment_id);
  }

  const procedureIds = (viaServiceId.data ?? []).map((r) => (r as { procedure_id: string }).procedure_id).filter(Boolean);
  for (const batch of chunked(procedureIds)) {
    const { data, error } = await supabase.from("procedures").select("appointment_id").in("id", batch);
    if (error) throw error;
    for (const row of (data ?? []) as { appointment_id: string | null }[]) {
      if (row.appointment_id) extraIds.add(row.appointment_id);
    }
  }

  // Appointments reached through a procedure still need their own row.
  const missing = [...extraIds].filter((id) => !appointments.has(id));
  for (const batch of chunked(missing)) {
    const { data, error } = await supabase.from("appointments").select(columns).in("id", batch);
    if (error) throw error;
    for (const row of (data ?? []) as unknown as AppointmentRow[]) appointments.set(row.id, row);
  }

  const ids = [...appointments.keys()];
  if (ids.length === 0) return [];

  // What this service was billed at, and what the visit was rated.
  const billed = new Map<string, number>();
  const rated = new Map<string, number>();
  for (const batch of chunked(ids)) {
    const [invoices, feedback] = await Promise.all([
      supabase.from("invoices").select("appointment_id, line_items").in("appointment_id", batch),
      supabase.from("patient_feedback").select("appointment_id, service_rating").in("appointment_id", batch),
    ]);
    if (invoices.error) throw invoices.error;
    if (feedback.error) throw feedback.error;

    for (const inv of (invoices.data ?? []) as { appointment_id: string | null; line_items: unknown }[]) {
      if (!inv.appointment_id) continue;
      const lines = lineItemsForService(inv.line_items as ServiceLineItem[] | null, service);
      if (lines.length === 0) continue;
      billed.set(inv.appointment_id, (billed.get(inv.appointment_id) ?? 0) + lineItemsTotal(lines));
    }
    for (const fb of (feedback.data ?? []) as { appointment_id: string | null; service_rating: number | null }[]) {
      if (fb.appointment_id && fb.service_rating != null && !rated.has(fb.appointment_id)) {
        rated.set(fb.appointment_id, fb.service_rating);
      }
    }
  }

  return [...appointments.values()]
    .map((a) => ({
      appointmentId: a.id,
      patientId: a.patient_id,
      patientName: a.patient_name,
      startTime: a.start_time,
      doctorId: a.staff_id,
      doctorName: a.doctor_name,
      value: billed.has(a.id) ? billed.get(a.id)! : null,
      rating: rated.has(a.id) ? rated.get(a.id)! : null,
    }))
    .sort((x, y) => (y.startTime ?? "").localeCompare(x.startTime ?? ""));
}

function useServiceUsage(serviceId: string | null, serviceName: string | null | undefined, enabled: boolean) {
  return useQuery({
    // Keyed on the service alone: the filters narrow what is already here, so
    // changing one must not send the screen back to the database.
    queryKey: ["service-usage", serviceId, (serviceName ?? "").trim()],
    queryFn: () => fetchServiceUsage(serviceId!, serviceName!),
    enabled: enabled && !!serviceId && !!(serviceName ?? "").trim(),
  });
}

const PERIODS = [
  { value: "all", label: "All time", months: 0 },
  { value: "3", label: "Last 3 months", months: 3 },
  { value: "6", label: "Last 6 months", months: 6 },
  { value: "12", label: "Last 12 months", months: 12 },
] as const;

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-center py-10 text-sm text-muted-foreground">{children}</div>;
}

function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> <span className="text-sm">Loading…</span>
    </div>
  );
}

/** The doctors that actually appear in these rows, so the filter offers no empty option. */
function doctorsIn(rows: ServiceUsageRow[]) {
  const seen = new Map<string, string>();
  for (const r of rows) if (r.doctorId) seen.set(r.doctorId, r.doctorName || "Unnamed doctor");
  return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
}

export function ServicePatientsTab({ serviceId, serviceName }: { serviceId: string; serviceName: string }) {
  const navigate = useNavigate();
  const { data: rows = [], isLoading } = useServiceUsage(serviceId, serviceName, true);

  if (isLoading) return <Loading />;
  if (rows.length === 0) {
    return <Empty>No appointments recorded against this service yet.</Empty>;
  }

  return (
    <div className="space-y-3 pt-4">
      <p className="text-xs text-muted-foreground">
        {rows.length} appointment{rows.length === 1 ? "" : "s"} · one row per visit, so a returning patient appears more than once.
      </p>
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">Appointment</th>
              <th className="text-left font-medium px-3 py-2">Patient</th>
              <th className="text-left font-medium px-3 py-2">Date</th>
              <th className="text-left font-medium px-3 py-2">Doctor</th>
              <th className="text-right font-medium px-3 py-2">Service value</th>
              <th className="text-right font-medium px-3 py-2">Rating</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.appointmentId}
                className="border-t cursor-pointer hover:bg-muted/40"
                onClick={() => navigate(`/appointments/${r.appointmentId}`)}
              >
                <td className="px-3 py-2">
                  <span className="font-mono text-xs text-primary underline-offset-2 hover:underline">
                    {shortAppointmentId(r.appointmentId)}
                  </span>
                </td>
                <td className="px-3 py-2">{r.patientName || "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.startTime && !Number.isNaN(new Date(r.startTime).getTime())
                    ? format(new Date(r.startTime), "d MMM yyyy")
                    : "—"}
                </td>
                <td className="px-3 py-2">{r.doctorName || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.value == null
                    ? <span className="text-muted-foreground text-xs">Not billed to this service</span>
                    : formatMoney(r.value)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.rating == null ? <span className="text-muted-foreground">—</span> : `${r.rating}★`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ServiceReportsTab({ serviceId, serviceName }: { serviceId: string; serviceName: string }) {
  const { data: rows = [], isLoading } = useServiceUsage(serviceId, serviceName, true);
  const [period, setPeriod] = useState<string>("all");
  const [doctor, setDoctor] = useState<string>("all");

  const doctors = useMemo(() => doctorsIn(rows), [rows]);
  const filtered = useMemo(() => filterServiceUsage(rows, {
    periodMonths: PERIODS.find((p) => p.value === period)?.months ?? 0,
    doctorId: doctor === "all" ? null : doctor,
  }), [rows, period, doctor]);
  const summary = useMemo(() => rollUpServiceUsage(filtered), [filtered]);
  const series = useMemo(() => monthlyServiceSeries(filtered), [filtered]);

  if (isLoading) return <Loading />;
  if (rows.length === 0) {
    return <Empty>No appointments recorded against this service yet, so there is nothing to report on.</Empty>;
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Period" /></SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={doctor} onValueChange={setDoctor}>
          <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="Doctor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All doctors</SelectItem>
            {doctors.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        {filtered.length !== rows.length && (
          <Badge variant="outline" className="text-[10px] font-normal">
            {filtered.length} of {rows.length} appointments
          </Badge>
        )}
      </div>

      {filtered.length === 0 ? (
        <Empty>Nothing in this period for this doctor.</Empty>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-normal">Customers serviced</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums">{summary.patients}</div>
                <p className="text-[11px] text-muted-foreground">over {summary.appointments} appointment{summary.appointments === 1 ? "" : "s"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-normal">Billed for this service</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums">{formatMoney(summary.revenue)}</div>
                {/* Most historical bills carry a free-text service name that was
                    never matched to the master, so this is a floor. Saying how
                    many visits could be priced stops a small number reading as
                    "this service earns little". */}
                <p className="text-[11px] text-muted-foreground">
                  from {summary.billedCount} of {summary.appointments} appointment{summary.appointments === 1 ? "" : "s"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-normal">Average feedback</CardTitle></CardHeader>
              <CardContent>
                {summary.avgRating == null ? (
                  <>
                    <div className="text-2xl font-semibold text-muted-foreground">—</div>
                    <p className="text-[11px] text-muted-foreground">no feedback yet</p>
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-semibold tabular-nums flex items-center gap-1">
                      {summary.avgRating.toFixed(1)} <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    </div>
                    <p className="text-[11px] text-muted-foreground">from {summary.ratedCount} rated visit{summary.ratedCount === 1 ? "" : "s"}</p>
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-normal">Average bill</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums">
                  {summary.billedCount > 0 ? formatMoney(summary.revenue / summary.billedCount) : "—"}
                </div>
                <p className="text-[11px] text-muted-foreground">per priced appointment</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Revenue by month</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip formatter={(v: number) => formatMoney(v)} />
                    <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Appointments by month</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" className="text-xs" />
                    <YAxis allowDecimals={false} className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="appointments" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Feedback by month</CardTitle></CardHeader>
              <CardContent>
                {summary.ratedCount === 0 ? (
                  // Feedback only began on 24 Sep 2026, so most services have
                  // none. An empty grid would read as a drop to zero.
                  <Empty>No feedback recorded for this service yet.</Empty>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={series}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="label" className="text-xs" />
                      <YAxis yAxisId="count" allowDecimals={false} className="text-xs" />
                      <YAxis yAxisId="score" orientation="right" domain={[0, 5]} className="text-xs" />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar yAxisId="count" dataKey="feedbackCount" name="Responses" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="score" type="monotone" dataKey="avgScore" name="Average score" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
