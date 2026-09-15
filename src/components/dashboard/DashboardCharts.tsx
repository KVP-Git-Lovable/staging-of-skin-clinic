import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Legend,
} from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMoneyFormat } from "@/lib/currency";

const STATUS_COLORS: Record<string, string> = {
  Completed: "hsl(152, 60%, 40%)",
  Reserved: "hsl(210, 80%, 55%)",
  Scheduled: "hsl(210, 80%, 55%)",
  Confirmed: "hsl(174, 62%, 38%)",
  "Checked In": "hsl(38, 92%, 50%)",
  "In Progress": "hsl(38, 92%, 50%)",
  "No Show": "hsl(0, 72%, 51%)",
  "No-show": "hsl(0, 72%, 51%)",
  Cancelled: "hsl(0, 60%, 60%)",
  Proposed: "hsl(265, 60%, 60%)",
  Requested: "hsl(195, 70%, 50%)",
  Rescheduled: "hsl(38, 80%, 60%)",
};

const BAR_COLORS = [
  "hsl(174, 62%, 38%)", "hsl(210, 80%, 55%)", "hsl(152, 60%, 40%)",
  "hsl(38, 92%, 50%)", "hsl(280, 60%, 55%)", "hsl(0, 72%, 51%)",
];

interface NameValue { name: string; value: number }

interface ChartData {
  appointmentStatus: NameValue[];
  appointmentsByDr: NameValue[];
  revenueByDr: { name: string; paid: number; invoiced: number }[];
  revenueByProblemArea: NameValue[];
  revenueByPaymentMode: NameValue[];
  revenueByDate: { date: string; paid: number; invoiced: number }[];
  revenueByService?: NameValue[];
  appointmentsByDate?: { date: string; completed: number }[];
}

interface Props {
  data: ChartData;
  onChartClick: (type: string, key?: string) => void;
  showRevenueByService?: boolean;
  showAppointmentTrend?: boolean;
}

function ChartCard({
  title, delay, empty, onClick, children,
}: { title: string; delay: number; empty: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          {empty ? <p className="text-sm text-muted-foreground text-center py-8">No data</p> : children}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function DashboardCharts({ data, onChartClick, showRevenueByService, showAppointmentTrend }: Props) {
  const isMobile = useIsMobile();
  const { formatMoney, formatNumber } = useMoneyFormat();
  const money = (v: number, n: string) => [formatMoney(Number(v)), n] as [string, string];

  // Build the ordered list of chart cards. Order is:
  // Row 1: Revenue Trend, Appointment Trend
  // Row 2: Revenue by Doctor, Appointments by Doctor
  // Row 3: Revenue by Payment Mode, Appointment Status
  // Row 4: Revenue by Primary Concern, Revenue by Service
  const cards: React.ReactNode[] = [];

  // Row 1 — Revenue Trend (always shown)
  cards.push(
    <ChartCard key="revenue_trend" title="Revenue Trend (₹)" delay={0.2} empty={data.revenueByDate.length === 0} onClick={() => onChartClick("revenue_by_date")}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data.revenueByDate}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={money} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="paid" name="Paid" stroke="hsl(152, 60%, 40%)" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="invoiced" name="Invoiced" stroke="hsl(210, 80%, 55%)" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  // Row 1 — Appointment Trend (conditional)
  if (showAppointmentTrend) {
    cards.push(
      <ChartCard
        key="appointment_trend"
        title="Appointment Trend"
        delay={0.22}
        empty={!data.appointmentsByDate || data.appointmentsByDate.every((d) => d.completed === 0)}
        onClick={() => onChartClick("appointment_trend")}
      >
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data.appointmentsByDate || []}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="completed"
              name="Completed Appointments"
              stroke="hsl(174, 62%, 38%)"
              strokeWidth={2}
              dot={{ r: 3 }}
              onClick={(e: any) => onChartClick("appointment_trend", e?.activeLabel)}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    );
  }

  // Row 2 — Revenue by Doctor
  cards.push(
    <ChartCard key="revenue_by_dr" title="Revenue by Doctor (₹)" delay={0.24} empty={data.revenueByDr.length === 0} onClick={() => onChartClick("revenue_by_dr")}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data.revenueByDr}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={money} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="paid" name="Paid" fill="hsl(152, 60%, 40%)" radius={[4, 4, 0, 0]} onClick={(e: any) => onChartClick("revenue_by_dr", e?.name)} />
          <Bar dataKey="invoiced" name="Invoiced" fill="hsl(210, 80%, 55%)" radius={[4, 4, 0, 0]} onClick={(e: any) => onChartClick("revenue_by_dr", e?.name)} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  // Row 2 — Appointments by Doctor (renamed from Staff)
  cards.push(
    <ChartCard key="appointments_by_dr" title="Appointments by Doctor" delay={0.26} empty={data.appointmentsByDr.length === 0} onClick={() => onChartClick("appointments_by_dr")}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data.appointmentsByDr}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="value" name="Appointments" radius={[4, 4, 0, 0]} onClick={(e: any) => onChartClick("appointments_by_dr", e?.name)}>
            {data.appointmentsByDr.map((_, i) => (
              <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  // Row 3 — Revenue by Payment Mode
  cards.push(
    <ChartCard key="revenue_by_payment_mode" title="Revenue by Payment Mode (₹)" delay={0.28} empty={data.revenueByPaymentMode.length === 0} onClick={() => onChartClick("revenue_by_payment_mode")}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data.revenueByPaymentMode}
            cx="50%" cy="50%" innerRadius={isMobile ? 42 : 50} outerRadius={isMobile ? 68 : 80}
            paddingAngle={3} dataKey="value"
            label={isMobile ? false : ({ name, value }) => `${name}: ${formatMoney(Number(value))}`}
            onClick={(e: any) => onChartClick("revenue_by_payment_mode", e?.name)}
          >
            {data.revenueByPaymentMode.map((_, i) => (
              <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={money} />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  // Row 3 — Appointment Status
  cards.push(
    <ChartCard key="appointment_status" title="Appointment Status" delay={0.3} empty={data.appointmentStatus.length === 0} onClick={() => onChartClick("appointment_status")}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data.appointmentStatus}
            cx="50%" cy="50%" innerRadius={isMobile ? 42 : 50} outerRadius={isMobile ? 68 : 80}
            paddingAngle={3} dataKey="value"
            label={isMobile ? false : ({ name, value }) => `${name}: ${value}`}
            onClick={(e: any) => onChartClick("appointment_status", e?.name)}
          >
            {data.appointmentStatus.map((entry) => (
              <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || "hsl(210, 15%, 50%)"} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  // Row 4 — Revenue by Primary Concern
  cards.push(
    <ChartCard key="revenue_by_problem_area" title="Revenue by Primary Concern (₹)" delay={0.32} empty={data.revenueByProblemArea.length === 0} onClick={() => onChartClick("revenue_by_problem_area")}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data.revenueByProblemArea} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
          <Tooltip formatter={money} />
          <Bar dataKey="value" name="Paid" radius={[0, 4, 4, 0]} onClick={(e: any) => onChartClick("revenue_by_problem_area", e?.name)}>
            {data.revenueByProblemArea.map((_, i) => (
              <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  // Row 4 — Revenue by Service (conditional)
  if (showRevenueByService) {
    cards.push(
      <ChartCard
        key="revenue_by_service"
        title="Revenue by Service"
        delay={0.34}
        empty={!data.revenueByService || data.revenueByService.length === 0}
        onClick={() => onChartClick("revenue_by_service")}
      >
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.revenueByService || []} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatNumber(Number(v))} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
            <Tooltip formatter={money} />
            <Bar dataKey="value" name="Revenue" radius={[0, 4, 4, 0]} onClick={(e: any) => onChartClick("revenue_by_service", e?.name)}>
              {(data.revenueByService || []).map((_, i) => (
                <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {cards}
    </div>
  );
}
