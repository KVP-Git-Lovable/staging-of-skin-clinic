import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  DollarSign,
  Download,
  Eye,
  FileText,
  MessageCircle,
  MessageSquare,
  MousePointer,
  Pause,
  Play,
  Send,
  ShieldAlert,
  Target,
  Users,
} from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useJourneyAnalytics } from "@/hooks/useJourneyAnalytics";
import { JourneyLogsDialog } from "@/components/communications/journey/JourneyLogsDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { downloadCsv } from "@/lib/comms/csv";
import { invokeJourneyActions, statusColors } from "@/lib/comms/journeys";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const num = (n: number) => n.toLocaleString("en-IN");

export default function JourneyAnalytics() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [rangeKey, setRangeKey] = useState<"7d" | "30d" | "all">("30d");
  const [logsOpen, setLogsOpen] = useState(false);

  const range = useMemo(() => {
    if (rangeKey === "all") return undefined;
    const to = new Date();
    return { from: new Date(to.getTime() - (rangeKey === "7d" ? 7 : 30) * 86_400_000), to };
  }, [rangeKey]);

  const { data: journey, isLoading: journeyLoading } = useQuery({
    queryKey: ["comms-journey", id],
    enabled: !!id,
    queryFn: async () => (await supabase.from("comms_journeys").select("*").eq("id", id).maybeSingle()).data,
  });
  const isActive = journey?.status === "active";
  const ja = useJourneyAnalytics(id, range, isActive);
  const k = ja.kpis;

  const toggle = useMutation({
    mutationFn: () => invokeJourneyActions({ action: isActive ? "pause" : "resume", journey_id: id }),
    onSuccess: () => {
      toast.success(isActive ? "Sending stopped" : "Sending resumed");
      qc.invalidateQueries({ queryKey: ["comms-journey", id] });
      qc.invalidateQueries({ queryKey: ["comms-journeys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (journeyLoading) return <Skeleton className="h-96 w-full" />;
  if (!journey) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Journey not found. <Link to="/communications/journeys" className="text-primary hover:underline">Back to journeys</Link>
      </div>
    );
  }

  const canToggle = journey.status === "active" || journey.status === "paused";
  const progressPct = k.entered > 0 ? Math.round(((k.sent + k.failed) / k.entered) * 100) : 0;
  const scoreColor = ja.health.score >= 70 ? "text-success" : ja.health.score >= 40 ? "text-warning" : "text-destructive";

  const exportCsv = () =>
    downloadCsv(`journey-${id}-analytics.csv`, [
      ["Metric", "Value"],
      ["Entered", k.entered],
      ["Delivered", k.delivered],
      ["Read", k.read],
      ["Failed", k.failed],
      ["Appointments booked (patients)", k.bookedPatients],
      ["Revenue (paid invoices)", Math.round(k.revenue)],
    ]);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/communications/journeys/${id}`)} aria-label="Back to journey">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
                {journey.name} — Analytics
                <Badge className={statusColors[journey.status]}>{journey.status}</Badge>
              </h1>
              <p className="text-sm text-muted-foreground">
                Created {format(new Date(journey.created_at), "dd MMM yyyy")} · Audience {num(k.entered)} · Channel WhatsApp
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as typeof rangeKey)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setLogsOpen(true)}><FileText className="mr-1 h-4 w-4" /> View Logs</Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/communications/journeys/${id}/failures?tab=rate`)}>
              <AlertTriangle className="mr-1 h-4 w-4" /> Rate-limited Failures
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/communications/journeys/${id}/failures?tab=63049`)}>
              <ShieldAlert className="mr-1 h-4 w-4" /> Status code failures
            </Button>
            {canToggle && (
              <Button
                size="sm"
                disabled={toggle.isPending}
                onClick={() => toggle.mutate()}
                className={isActive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-success text-white hover:bg-success/90"}
              >
                {isActive ? <><Pause className="mr-1 h-4 w-4" /> Stop Sending</> : <><Play className="mr-1 h-4 w-4" /> Resume Sending</>}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm"><Download className="mr-1 h-4 w-4" /> Export</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => window.print()}>Print / Save as PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={exportCsv}>Download CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigator.clipboard.writeText(window.location.href).then(() => toast.success("Link copied"))}>Copy shareable link</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => navigate("/communications/whatsapp/conversations")}>
                  <MessageCircle className="mr-1 h-4 w-4 text-success" /> View WhatsApp Conversations
                </Button>
              </TooltipTrigger>
              <TooltipContent>Opens all WhatsApp conversations; journey sends are not listed per journey.</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {!ja.isLoading && !ja.hasData && (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            No messages have been sent by this journey yet. The numbers below fill in once it starts sending.
          </p>
        )}
        {ja.isError && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">Analytics could not be loaded. Please try again.</p>}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <KpiTile label="Entered Journey" value={num(k.entered)} icon={<Users className="h-4 w-4" />} />
          <KpiTile label="Active" value={num(k.active)} />
          <KpiTile label="Completed" value={num(k.completed)} />
          <KpiTile label="Delivery Rate" value={`${k.deliveryRate.toFixed(1)}%`} accent="text-success" icon={<Send className="h-4 w-4" />} />
          <KpiTile label="Read Rate" value={`${k.readRate.toFixed(1)}%`} accent="text-info" icon={<BookOpen className="h-4 w-4" />} />
          <KpiTile label="Click Rate" untracked icon={<MousePointer className="h-4 w-4" />} />
          <KpiTile label="Reply Rate" untracked icon={<MessageSquare className="h-4 w-4" />} />
          <KpiTile label="Conversion Rate" value={`${k.conversionRate.toFixed(2)}%`} icon={<Target className="h-4 w-4" />} hint="Patients who booked an appointment after their first message" />
          <KpiTile label="Revenue Generated" value={inr(k.revenue)} accent="text-success" icon={<DollarSign className="h-4 w-4" />} hint="Paid invoices after the first message" />
          <KpiTile label="Appointments Booked" value={num(k.bookings)} icon={<CalendarCheck className="h-4 w-4" />} />
          <KpiTile label="Avg Invoice Value" value={inr(k.avgInvoiceValue)} />
          <KpiTile label="Opted Out" untracked />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Journey Funnel</CardTitle></CardHeader>
            <CardContent><FunnelView funnel={ja.funnel} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Engagement Over Time</CardTitle></CardHeader>
            <CardContent className="h-[260px]">
              {ja.trend.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No activity yet</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ja.trend}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <RTooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="delivered" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="read" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Journey Health Score</CardTitle></CardHeader>
            <CardContent>
              <div className="mb-4 text-center">
                <div className={`text-5xl font-bold ${scoreColor}`}>{ja.health.score}<span className="text-base text-muted-foreground">/100</span></div>
                <p className="mt-1 text-xs text-muted-foreground">{ja.health.label}</p>
              </div>
              {ja.health.strengths.length > 0 && (
                <div className="mb-2">
                  <p className="mb-1 text-xs font-medium text-success">Strengths</p>
                  {ja.health.strengths.map((s) => <p key={s} className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="h-3 w-3 text-success" />{s}</p>)}
                </div>
              )}
              {ja.health.areas.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-warning">Areas to Improve</p>
                  {ja.health.areas.map((s) => <p key={s} className="flex items-center gap-1 text-xs text-muted-foreground"><AlertTriangle className="h-3 w-3 text-warning" />{s}</p>)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Best Time to Engage</CardTitle></CardHeader>
            <CardContent>
              <Heatmap data={ja.heat} />
              <p className="mt-2 text-[11px] text-muted-foreground">Read messages by the time they were sent (IST).</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Audience Segments</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <SegRow label="Highly Engaged" untracked color="bg-success/10 text-success" />
                <SegRow label="Warm" value={ja.segments.warm} color="bg-warning/10 text-warning" />
                <SegRow label="Cold" value={ja.segments.cold} color="bg-info/10 text-info" />
                <SegRow label="Lost" value={ja.segments.lost} color="bg-destructive/10 text-destructive" />
                <SegRow label="High Intent" untracked color="bg-primary/10 text-primary" />
                <SegRow label="High Value" value={ja.segments.highValue} color="bg-success/10 text-success" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Revenue Attribution</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-2 text-center">
                {(["d1", "d7", "d15", "d30"] as const).map((key, i) => (
                  <div key={key} className="rounded-lg border p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">{["1 day", "7 days", "15 days", "30 days"][i]}</p>
                    <p className="text-sm font-semibold">{inr(ja.attribution[key].revenue)}</p>
                    <p className="text-[10px] text-muted-foreground">{ja.attribution[key].bookings} bookings</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>Avg invoice: <span className="font-medium text-foreground">{inr(k.avgInvoiceValue)}</span></div>
                <div>Revenue / patient: <span className="font-medium text-foreground">{inr(k.revenuePerPatient)}</span></div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Counted from each patient's first message: appointments booked and paid invoices.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Cohort Analysis (Retention)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cohort (Week of)</TableHead>
                    <TableHead className="text-right">Entered</TableHead>
                    <TableHead className="text-right">Day 1 Read %</TableHead>
                    <TableHead className="text-right">Day 7 Read %</TableHead>
                    <TableHead className="text-right">Day 30 Booked %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ja.cohorts.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-4 text-center text-sm text-muted-foreground">No cohort data yet</TableCell></TableRow>
                  ) : (
                    ja.cohorts.map((c) => (
                      <TableRow key={c.week}>
                        <TableCell>{format(new Date(`${c.week}T00:00:00`), "dd MMM yyyy")}</TableCell>
                        <TableCell className="text-right">{c.entered}</TableCell>
                        <TableCell className="text-right">{c.d1ReadPct.toFixed(1)}%</TableCell>
                        <TableCell className="text-right">{c.d7ReadPct.toFixed(1)}%</TableCell>
                        <TableCell className="text-right">{c.d30ConvPct.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {k.entered > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span>Live Send Progress</span>
                {isActive && (
                  <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                    </span>
                    Live · refreshes every 5s
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <ProgressBox label="Total Enrolled" value={num(k.entered)} />
                <ProgressBox label="Sent" value={num(k.sent)} tone="text-success" />
                <ProgressBox label="Pending" value={num(k.pending)} tone="text-warning" />
                <ProgressBox label="Failed" value={num(k.failed)} tone="text-destructive" />
                <ProgressBox label="Read" value={num(k.read)} tone="text-info" />
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progressPct}%` }} />
              </div>
              <p className="text-right text-xs text-muted-foreground">{progressPct}% processed</p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <BottomTile label="Messages Sent" value={num(k.messagesSent)} icon={<Send className="h-5 w-5 text-info" />} tone="bg-info/10" />
          <BottomTile label="Delivered" value={num(k.deliveredMessages)} icon={<CheckCircle2 className="h-5 w-5 text-success" />} tone="bg-success/10" />
          <BottomTile label="Read" value={num(k.readMessages)} icon={<BookOpen className="h-5 w-5 text-primary" />} tone="bg-primary/10" />
          <BottomTile label="Failed" value={num(k.failed)} icon={<Eye className="h-5 w-5 text-destructive" />} tone="bg-destructive/10" />
          <BottomTile label="Completed" value={num(k.completed)} icon={<Target className="h-5 w-5 text-warning" />} tone="bg-warning/10" />
        </div>
      </div>

      <JourneyLogsDialog open={logsOpen} onOpenChange={setLogsOpen} journeyId={id} journeyName={journey.name} />
    </TooltipProvider>
  );
}

function KpiTile({ label, value, accent, icon, untracked, hint }: { label: string; value?: string; accent?: string; icon?: JSX.Element; untracked?: boolean; hint?: string }) {
  const body = (
    <Card className={untracked ? "opacity-60" : ""}>
      <CardContent className="p-3">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
          {icon && <span className="text-muted-foreground">{icon}</span>}
        </div>
        {untracked ? (
          <>
            <p className="text-xl font-bold text-muted-foreground">—</p>
            <p className="text-[10px] text-muted-foreground">Not tracked yet</p>
          </>
        ) : (
          <p className={`whitespace-nowrap text-xl font-bold ${accent || ""}`}>{value}</p>
        )}
      </CardContent>
    </Card>
  );
  if (!hint) return body;
  return (
    <Tooltip>
      <TooltipTrigger asChild><div>{body}</div></TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
    </Tooltip>
  );
}

function FunnelView({ funnel }: { funnel: { label: string; count: number; tracked: boolean }[] }) {
  const max = Math.max(...funnel.map((f) => f.count), 1);
  const colors = ["#3b82f6", "#06b6d4", "#10b981", "#f59e0b", "#f97316", "#ef4444"];
  const first = funnel[0]?.count || 0;
  return (
    <div className="space-y-1.5">
      {funnel.map((f, i) => (
        <div key={f.label} className={`flex items-center gap-2 text-xs ${f.tracked ? "" : "opacity-50"}`}>
          <span className="w-28 text-muted-foreground">{f.label}</span>
          <div className="relative h-7 flex-1 overflow-hidden rounded bg-muted">
            {f.tracked && <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${(f.count / max) * 100}%`, background: colors[i % colors.length], opacity: 0.85 }} />}
            <span className="absolute inset-0 flex items-center justify-end pr-2 text-[11px] font-medium">{f.tracked ? num(f.count) : "Not tracked yet"}</span>
          </div>
          <span className="w-12 text-right text-muted-foreground">{f.tracked ? `${first ? ((f.count / first) * 100).toFixed(1) : "0.0"}%` : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function Heatmap({ data }: { data: number[][] }) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const max = Math.max(...data.flat(), 1);
  return (
    <div className="overflow-x-auto">
      <table className="text-[10px]">
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, h) => <th key={h} className="px-0.5 font-normal text-muted-foreground">{h % 4 === 0 ? `${h}h` : ""}</th>)}
          </tr>
        </thead>
        <tbody>
          {days.map((d, di) => (
            <tr key={d}>
              <td className="pr-1 text-muted-foreground">{d}</td>
              {data[di].map((v, hi) => (
                <td key={hi} className="p-0">
                  <div className="h-3 w-3 rounded-sm" style={{ background: `hsl(217 91% 60% / ${0.08 + (v / max) * 0.92})` }} title={`${d} ${hi}:00 — ${v} reads`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SegRow({ label, value, color, untracked }: { label: string; value?: number; color: string; untracked?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${color} ${untracked ? "opacity-50" : ""}`}>
      <p className="text-[11px] uppercase tracking-wide">{label}</p>
      {untracked ? <p className="text-sm font-medium">Not tracked yet</p> : <p className="text-lg font-bold">{num(value ?? 0)}</p>}
    </div>
  );
}

function ProgressBox({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${tone || ""}`}>{value}</p>
    </div>
  );
}

function BottomTile({ label, value, icon, tone }: { label: string; value: string; icon: JSX.Element; tone: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg p-2 ${tone}`}>{icon}</div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
