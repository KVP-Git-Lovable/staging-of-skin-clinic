import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, Receipt, Activity, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from "recharts";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

const StaffPerformanceCharts = ({ staffId, staffName }: { staffId: string; staffName: string }) => {
  // Appointments data
  const { data: appointments = [] } = useQuery({
    queryKey: ["staff-perf-appts", staffId],
    queryFn: async () => {
      const { data } = await supabase.from("appointments").select("*").eq("staff_id", staffId);
      return data || [];
    },
  });

  // Procedures data
  const { data: procedures = [] } = useQuery({
    queryKey: ["staff-perf-procs", staffId],
    queryFn: async () => {
      const { data } = await supabase.from("procedures").select("*").eq("staff_id", staffId);
      return data || [];
    },
  });

  // Invoices via appointments
  const { data: invoices = [] } = useQuery({
    queryKey: ["staff-perf-inv", staffId],
    queryFn: async () => {
      const { data: appts } = await supabase.from("appointments").select("id").eq("staff_id", staffId);
      if (!appts?.length) return [];
      const { data } = await supabase.from("invoices").select("*").in("appointment_id", appts.map((a: any) => a.id));
      return data || [];
    },
  });

  // Unique patients
  const uniquePatients = new Set(appointments.filter((a: any) => a.patient_id).map((a: any) => a.patient_id)).size;
  const totalRevenue = invoices.reduce((s: number, i: any) => s + (i.paid_amount || 0), 0);
  const completedAppts = appointments.filter((a: any) => a.status === "Completed").length;
  const completedProcs = procedures.filter((p: any) => p.status === "Completed").length;

  // Monthly appointments (last 6 months)
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const month = subMonths(new Date(), 5 - i);
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const count = appointments.filter((a: any) => {
      const d = new Date(a.start_time);
      return d >= start && d <= end;
    }).length;
    const rev = invoices.filter((inv: any) => {
      const d = new Date(inv.created_at);
      return d >= start && d <= end;
    }).reduce((s: number, inv: any) => s + (inv.paid_amount || 0), 0);
    return { month: format(month, "MMM"), appointments: count, revenue: rev };
  });

  // Appointment status breakdown
  const statusMap: Record<string, number> = {};
  appointments.forEach((a: any) => { statusMap[a.status] = (statusMap[a.status] || 0) + 1; });
  const statusData = Object.entries(statusMap).map(([name, value]) => ({ name, value }));

  // Service breakdown
  const serviceMap: Record<string, number> = {};
  appointments.forEach((a: any) => { serviceMap[a.service] = (serviceMap[a.service] || 0) + 1; });
  const serviceData = Object.entries(serviceMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><CalendarCheck className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold">{completedAppts}</p>
                <p className="text-xs text-muted-foreground">Completed Appts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Activity className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold">{completedProcs}</p>
                <p className="text-xs text-muted-foreground">Procedures Done</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Receipt className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold">₹{totalRevenue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Revenue Generated</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold">{uniquePatients}</p>
                <p className="text-xs text-muted-foreground">Unique Patients</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Monthly Appointments Trend */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly Appointments</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis allowDecimals={false} className="text-xs" />
                <Tooltip />
                <Bar dataKey="appointments" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Revenue Trend */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly Revenue (₹)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Appointment Status */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Appointment Status</CardTitle></CardHeader>
          <CardContent>
            {statusData.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No data</p> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top Services */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top Services</CardTitle></CardHeader>
          <CardContent>
            {serviceData.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No data</p> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={serviceData} layout="vertical">
                  <XAxis type="number" allowDecimals={false} className="text-xs" />
                  <YAxis type="category" dataKey="name" width={120} className="text-xs" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StaffPerformanceCharts;
