import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Legend,
} from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMoneyFormat } from "@/lib/currency";
import type { NpsBreakdown } from "@/lib/feedbackScores";
import {
  BAR_LABEL_CHARS,
  BAR_LABEL_GUTTER,
  horizontalBarHeight,
  truncateLabel,
} from "@/lib/barChartLayout";

/**
 * Chart colours.
 *
 * Several of these were hard-coded HSL literals that are exact duplicates of
 * the app's semantic tokens, so they are written as tokens now and follow the
 * theme - EXCEPT that nothing here may use --primary, --accent or --ring.
 * useTheme rewrites those three at runtime per colour theme, and a categorical
 * palette cannot have one member that moves: on the default amber theme
 * --primary is orange and would land on top of --warning (Checked In, In
 * Progress); on forest-green it becomes the same hue as --success. The literals
 * that survive below are the ones with no matching token.
 */
const STATUS_COLORS: Record<string, string> = {
  Completed: "hsl(var(--success))",
  Reserved: "hsl(var(--info))",
  Scheduled: "hsl(var(--info))",
  Confirmed: "hsl(174, 62%, 38%)",
  "Checked In": "hsl(var(--warning))",
  "In Progress": "hsl(var(--warning))",
  "No Show": "hsl(var(--destructive))",
  "No-show": "hsl(var(--destructive))",
  Cancelled: "hsl(0, 60%, 60%)",
  Proposed: "hsl(265, 60%, 60%)",
  Requested: "hsl(195, 70%, 50%)",
  Rescheduled: "hsl(38, 80%, 60%)",
};

const BAR_COLORS = [
  "hsl(174, 62%, 38%)", "hsl(var(--info))", "hsl(var(--success))",
  "hsl(var(--warning))", "hsl(280, 60%, 55%)", "hsl(var(--destructive))",
];

interface NameValue { name: string; value: number }

interface ChartData {
  appointmentStatus: NameValue[];
  appointmentsByDr: NameValue[];
  revenueByDr: { name: string; paid: number; invoiced: number }[];
  revenueByPaymentMode: NameValue[];
  revenueByDate: { date: string; paid: number; invoiced: number }[];
  revenueByService?: NameValue[];
  appointmentsByDate?: { date: string; completed: number }[];
}

interface Props {
  data: ChartData;
  /** Patient feedback over the same window, from npsBreakdown. */
  feedback?: NpsBreakdown;
  onChartClick: (type: string, key?: string) => void;
  showRevenueByService?: boolean;
  showAppointmentTrend?: boolean;
  /** Queries still in flight. Skeletons instead of "No data", and nothing hides. */
  loading?: boolean;
}

/**
 * Donut slice labels.
 *
 * Recharts' default draws them in the slice colour - light amber "Credit Card"
 * text on a white card. Text carries no data, so it wears a text token and the
 * coloured slice beside it carries the identity. The name is truncated and the
 * label sits closer to the ring than the default, because at 80px radius in a
 * 220px box a long name runs off the card.
 */
interface PieLabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  outerRadius: number;
  name: string;
  value: number;
}

const donutLabel = (format: (value: number) => string) => (props: PieLabelProps) => {
  const { cx, cy, midAngle, outerRadius, name, value } = props;
  const radians = -midAngle * (Math.PI / 180);
  const r = outerRadius + 12;
  const x = cx + r * Math.cos(radians);
  const y = cy + r * Math.sin(radians);
  return (
    <text
      x={x}
      y={y}
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={10}
      fill="hsl(var(--foreground))"
    >
      {`${truncateLabel(name, 12)}: ${format(Number(value))}`}
    </text>
  );
};

/** Placeholder at roughly a chart's height, so nothing reflows when data lands. */
function ChartSkeleton() {
  return (
    <div className="animate-pulse py-1" aria-hidden>
      <div className="h-[196px] rounded-lg bg-muted" />
    </div>
  );
}

function ChartCard({
  title, delay, loading, onClick, children,
}: {
  title: string;
  delay: number;
  loading?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    // h-full all the way down so cards in a row share the row's height and the
    // grid stops looking ragged. The charts inside keep their fixed pixel
    // heights - ResponsiveContainer measures its parent, so a percentage height
    // inside a content-sized row measures zero.
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} className="h-full">
      <Card
        // Matches .stat-card and .data-table rather than the stock Card's
        // shadow-sm, and the same 16px inset on phones instead of 24px.
        className="h-full flex flex-col cursor-pointer border-border shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-shadow duration-200"
        onClick={onClick}
      >
        <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        </CardHeader>
        {/* flex-col so the chart keeps its full width, justify-center so a
            short chart sits in the middle of a card stretched by a taller
            neighbour rather than hugging the top with a gap under it. */}
        <CardContent className="p-4 sm:p-6 pt-0 flex-1 flex flex-col justify-center">
          {loading ? <ChartSkeleton /> : children}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/**
 * A horizontal bar chart of free-text categories.
 *
 * Both revenue breakdowns plot names that come from Salesforce verbatim, so the
 * axis has to cope with anything up to about sixty characters. They were two
 * copies of the same markup and drifted (one formatted its x-axis ticks, the
 * other did not); one component means a layout fix cannot land on only one of
 * them. See barChartLayout.ts for why the height and the truncation are what
 * they are.
 */
function HorizontalBarCard({
  title, delay, loading, data, barName, chartKey, onChartClick, isMobile, formatTick, tooltipFormatter,
}: {
  title: string;
  delay: number;
  loading?: boolean;
  data: NameValue[];
  barName: string;
  chartKey: string;
  onChartClick: (type: string, key?: string) => void;
  isMobile: boolean;
  formatTick: (value: number) => string;
  tooltipFormatter: (value: number, name: string) => [string, string];
}) {
  const gutter = isMobile ? BAR_LABEL_GUTTER.mobile : BAR_LABEL_GUTTER.desktop;
  const labelChars = isMobile ? BAR_LABEL_CHARS.mobile : BAR_LABEL_CHARS.desktop;
  return (
    <ChartCard title={title} delay={delay} loading={loading} onClick={() => onChartClick(chartKey)}>
      <ResponsiveContainer width="100%" height={horizontalBarHeight(data.length)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
          {/* Solid hairline, not dashes: dashing reads as a threshold and is half
              of what made these cards look busy. */}
          <CartesianGrid horizontal={false} className="stroke-muted" />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v) => formatTick(Number(v))}
          />
          {/* A plain <text> rather than recharts' own tick. Recharts wraps a tick
              label at word boundaries whenever it is given a width, so a name a
              few pixels too wide silently becomes two lines - which is the
              collision this card had. Drawing the text ourselves, with no width,
              makes one line structural instead of a character count tuned
              against the font. */}
          <YAxis
            type="category"
            dataKey="name"
            width={gutter}
            tick={(props: any) => (
              <text
                x={props.x}
                y={props.y}
                dx={-6}
                dy={4}
                textAnchor="end"
                fontSize={11}
                fill="hsl(var(--muted-foreground))"
              >
                {truncateLabel(props.payload?.value, labelChars)}
              </text>
            )}
          />
          {/* The tooltip gets the untruncated name: a tickFormatter only changes
              what is drawn on the axis. */}
          <Tooltip formatter={tooltipFormatter} />
          <Bar
            dataKey="value"
            name={barName}
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
            // recharts hands the bar's own category on data.payload.name;
            // data.name is the series name ("Patients"), which no drill-down
            // can route on. The click must also not bubble - the card itself
            // is clickable and would overwrite this navigation with a
            // keyless one, opening the report without the band.
            onClick={(data: any, _index: number, event: any) => {
              event?.stopPropagation?.();
              onChartClick(chartKey, data?.payload?.name ?? data?.name);
            }}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function DashboardCharts({ data, feedback, onChartClick, showRevenueByService, showAppointmentTrend, loading }: Props) {
  const isMobile = useIsMobile();
  const { formatMoney, formatNumber } = useMoneyFormat();
  const money = (v: number, n: string) => [formatMoney(Number(v)), n] as [string, string];

  // Build the ordered list of chart cards. Order is:
  // Row 1: Revenue Trend, Appointment Trend
  // Row 2: Revenue by Doctor, Appointments by Doctor
  // Row 3: Revenue by Payment Mode, Appointment Status
  // Row 4: Revenue by Primary Concern, Revenue by Service
  const cards: React.ReactNode[] = [];

  // Delay from position rather than a hard-coded constant, so hiding a card
  // never leaves a hole in the stagger. The base sits after the stat cards
  // above (which finish around 0.2) and the step is small enough that eight
  // cards still land before the sections below, so the page assembles in
  // reading order instead of the pinned-reports strip arriving first.
  const nextDelay = () => 0.2 + cards.length * 0.03;

  // A chart with nothing in it is not rendered at all - but only once the data
  // has actually arrived. Every query is keyed on the date range, so while a
  // filter change is in flight the data is briefly empty; hiding on that would
  // collapse the whole grid and re-animate it on every filter change.
  const show = (empty: boolean) => Boolean(loading) || !empty;

  // Row 1 — Revenue Trend (always shown)
  if (show(data.revenueByDate.every((d) => d.paid === 0 && d.invoiced === 0)))
  cards.push(
    <ChartCard key="revenue_trend" title="Revenue Trend (₹)" delay={nextDelay()} loading={loading} onClick={() => onChartClick("revenue_by_date")}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data.revenueByDate}>
          <CartesianGrid className="stroke-muted" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={money} />
          <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => <span className="text-muted-foreground">{value}</span>} />
          <Line type="monotone" dataKey="paid" name="Paid" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="invoiced" name="Invoiced" stroke="hsl(var(--info))" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  // Row 1 — Appointment Trend (conditional)
  if (showAppointmentTrend && show(!data.appointmentsByDate || data.appointmentsByDate.every((d) => d.completed === 0))) {
    cards.push(
      <ChartCard
        key="appointment_trend"
        title="Appointment Trend"
        delay={nextDelay()}
        loading={loading}
        onClick={() => onChartClick("appointment_trend")}
      >
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data.appointmentsByDate || []}>
            <CartesianGrid className="stroke-muted" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => <span className="text-muted-foreground">{value}</span>} />
            <Line
              type="monotone"
              dataKey="completed"
              name="Billed Appointments"
              stroke="hsl(var(--primary))"
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
  if (show(data.revenueByDr.length === 0))
  cards.push(
    <ChartCard key="revenue_by_dr" title="Revenue by Doctor (₹)" delay={nextDelay()} loading={loading} onClick={() => onChartClick("revenue_by_dr")}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data.revenueByDr}>
          <CartesianGrid className="stroke-muted" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={money} />
          <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => <span className="text-muted-foreground">{value}</span>} />
          <Bar dataKey="paid" name="Paid" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} onClick={(e: any) => onChartClick("revenue_by_dr", e?.name)} />
          <Bar dataKey="invoiced" name="Invoiced" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} onClick={(e: any) => onChartClick("revenue_by_dr", e?.name)} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  // Row 2 — Appointments by Doctor (renamed from Staff)
  if (show(data.appointmentsByDr.length === 0))
  cards.push(
    <ChartCard key="appointments_by_dr" title="Appointments by Doctor" delay={nextDelay()} loading={loading} onClick={() => onChartClick("appointments_by_dr")}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data.appointmentsByDr}>
          <CartesianGrid className="stroke-muted" />
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
  if (show(data.revenueByPaymentMode.length === 0))
  cards.push(
    <ChartCard key="revenue_by_payment_mode" title="Revenue by Payment Mode (₹)" delay={nextDelay()} loading={loading} onClick={() => onChartClick("revenue_by_payment_mode")}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data.revenueByPaymentMode}
            cx="50%" cy="50%" innerRadius={isMobile ? 42 : 50} outerRadius={isMobile ? 68 : 80}
            paddingAngle={3} dataKey="value"
            label={isMobile ? false : donutLabel(formatMoney)}
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
  if (show(data.appointmentStatus.length === 0))
  cards.push(
    <ChartCard key="appointment_status" title="Appointment Status" delay={nextDelay()} loading={loading} onClick={() => onChartClick("appointment_status")}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data.appointmentStatus}
            cx="50%" cy="50%" innerRadius={isMobile ? 42 : 50} outerRadius={isMobile ? 68 : 80}
            paddingAngle={3} dataKey="value"
            label={isMobile ? false : donutLabel((v) => String(v))}
            onClick={(e: any) => onChartClick("appointment_status", e?.name)}
          >
            {data.appointmentStatus.map((entry) => (
              <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || "hsl(var(--muted-foreground))"} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  // Row 4 — Patient Feedback
  //
  // This card used to be "Revenue by Primary Concern", which was one
  // "Unspecified" bar and always would be: the concern is filled on 7 of 56,763
  // appointments. Feedback is the opposite - every response carries a score, and
  // the clinic collected 224 in its first twelve days.
  const npsBands = feedback
    ? [
        { name: `Promoters (9-10)`, value: feedback.promoters },
        { name: `Passives (7-8)`, value: feedback.passives },
        { name: `Detractors (0-6)`, value: feedback.detractors },
      ].filter((b) => b.value > 0)
    : [];
  if (show(npsBands.length === 0))
  cards.push(
    <HorizontalBarCard
      key="patient_feedback"
      title={
        feedback && feedback.nps !== null
          ? `Patient Feedback — NPS ${feedback.nps} (${feedback.responses} responses · ${feedback.averageRating ?? "—"}★)`
          : "Patient Feedback"
      }
      delay={nextDelay()}
      loading={loading}
      data={npsBands}
      barName="Patients"
      chartKey="patient_feedback"
      onChartClick={onChartClick}
      isMobile={isMobile}
      formatTick={formatNumber}
      tooltipFormatter={(v: number, name: string) => [`${v} patient(s)`, name] as [string, string]}
    />
  );

  // Row 4 — Revenue by Service (conditional)
  if (showRevenueByService && show((data.revenueByService || []).length === 0)) {
    cards.push(
      <HorizontalBarCard
        key="revenue_by_service"
        title="Revenue by Service (₹)"
        delay={nextDelay()}
        loading={loading}
        data={data.revenueByService || []}
        barName="Revenue"
        chartKey="revenue_by_service"
        onChartClick={onChartClick}
        isMobile={isMobile}
        formatTick={formatNumber}
        tooltipFormatter={money}
      />
    );
  }

  // Nothing survived: render nothing at all rather than an empty grid holding
  // 24px of dead margin. A lone survivor takes the full width instead of
  // sitting by itself in the left half.
  if (cards.length === 0) return null;

  return (
    <div className={`grid grid-cols-1 ${cards.length > 1 ? "md:grid-cols-2" : ""} gap-4 mb-6`}>
      {cards}
    </div>
  );
}
