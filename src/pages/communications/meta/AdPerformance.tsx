import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useParams } from "react-router-dom";
import { BackButton } from "@/components/shared/BackButton";
import { cn } from "@/lib/utils";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, RefreshCw, Eye, Users, Wallet, UserRound, type LucideIcon } from "lucide-react";

type Ad = { id: string; name: string; external_id: string | null; lead_form_id: string | null };

const PRESETS = [
  ["maximum", "Lifetime"],
  ["last_7d", "Last 7 days"],
  ["last_14d", "Last 14 days"],
  ["last_30d", "Last 30 days"],
  ["this_month", "This month"],
];

const num = (v: any) => new Intl.NumberFormat("en-IN").format(Number(v || 0));
const inr = (v: any) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(v || 0));
const dec = (v: any, d = 2) => Number(v || 0).toFixed(d);

function Kpi({ label, value, hint, icon: Icon, iconColor }: { label: string; value: string; hint?: string; icon?: LucideIcon; iconColor?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold break-words tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && <div className={cn("shrink-0 rounded-lg p-2", iconColor)}><Icon className="h-4 w-4" /></div>}
      </CardContent>
    </Card>
  );
}

const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function AdPerformance() {
  const { id } = useParams<{ id: string }>();
  const [ad, setAd] = useState<Ad | null>(null);
  const [adLoading, setAdLoading] = useState(true);
  const [adError, setAdError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAd(null);
    setAdLoading(true);
    setAdError(null);
    const loadAd = async () => {
      if (!id) {
        setAdError("Ad not found.");
        setAdLoading(false);
        return;
      }
      const { data: row, error: err } = await supabase.from("social_ads")
        .select("id,name,external_id,lead_form_id").eq("id", id).maybeSingle();
      if (cancelled) return;
      setAd(row);
      setAdError(err?.message || (!row ? "Ad not found." : !row.external_id ? "This ad has not been published to Meta yet." : null));
      setAdLoading(false);
    };
    loadAd();
    return () => { cancelled = true; };
  }, [id]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [preset, setPreset] = useState("maximum");

  const load = async () => {
    if (!ad?.external_id) return;
    setLoading(true);
    setError(null);
    const { data: res, error: err } = await supabase.functions.invoke("meta-api", {
      body: { action: "ad_performance", payload: { ad_id: ad.id, date_preset: preset } },
    });
    let message = res?.error || null;
    if (err && !message) {
      try {
        message = (await (err as any).context?.json())?.error || err.message;
      } catch {
        message = err.message;
      }
    }
    if (message) {
      setError(message);
      setData(null);
    } else {
      setData(res);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (ad?.external_id) load();
    else setData(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad?.id, preset]);

  const t = data?.totals;
  const meta = data?.ad?.meta;
  const isLeadAd = !!ad?.lead_form_id;
  const actionCount = (type: string) =>
    Number((t?.actions || []).find((a: any) => a.action_type === type)?.value || 0);
  const leads = actionCount("lead");

  return (
    <div className="space-y-6">
      <BackButton fallback="/communications/meta/ads" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold md:text-3xl">Ad Performance</h1>
            <p className="font-medium break-words">{data?.ad?.name || ad?.name || "—"}</p>
            <p className="text-xs text-muted-foreground font-mono break-all">{meta?.id || ad?.external_id || id || ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={preset} onValueChange={setPreset} disabled={adLoading || !!adError}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESETS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={load} disabled={loading || adLoading || !!adError} aria-label="Refresh ad performance" title="Refresh ad performance">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {(error || adError) && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <span>{adError || error}</span>
          </div>
        )}

        {loading || adLoading ? (
          <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : data && !adError ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant="secondary" className="capitalize">{meta?.effective_status || data.ad.status}</Badge>
            </div>

            {!t ? (
              <p className="py-8 text-center text-muted-foreground">
                Meta has not reported any delivery data for this ad in the selected period.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Kpi label="Impressions" value={num(t.impressions)} icon={Eye} iconColor="bg-primary/10 text-primary" />
                  <Kpi label="Reach" value={num(t.reach)} icon={Users} iconColor="bg-accent/10 text-accent" />
                  <Kpi label="Clicks" value={num(t.clicks)} hint={`${num(t.unique_clicks)} unique`} />
                  <Kpi label="CTR" value={`${dec(t.ctr)}%`} />
                  <Kpi label="Amount Spent" value={inr(t.spend)} icon={Wallet} iconColor="bg-success/10 text-success" />
                  <Kpi label="CPC" value={inr(t.cpc)} />
                  <Kpi label="CPM" value={inr(t.cpm)} />
                  <Kpi label="Frequency" value={dec(t.frequency)} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Kpi label="Link Clicks" value={num(actionCount("link_click"))} />
                  <Kpi label="Leads" value={isLeadAd ? num(leads) : "Nil"} icon={UserRound} iconColor="bg-warning/10 text-warning" />
                  <Kpi label="Cost per Lead" value={isLeadAd ? (leads > 0 ? inr(t.spend / leads) : "—") : "Nil"} />
                  <Kpi label="Post Engagement" value={num(actionCount("post_engagement"))} />
                </div>

                {data.daily?.length > 0 && (
                  <>
                  <Card>
                    <CardHeader><CardTitle className="text-base">Spend & Impressions Trend</CardTitle></CardHeader>
                    <CardContent>
                      <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-primary" />Spend</span>
                        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-accent" />Impressions</span>
                      </div>
                      <div className="h-[280px] w-full" role="img" aria-label="Daily spend and impressions trend">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={data.daily.map((d: any) => ({ ...d, spend: Number(d.spend || 0), impressions: Number(d.impressions || 0) }))} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="adSpendGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="date_start" tickFormatter={(d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval={Math.floor(data.daily.length / 6)} />
                            <YAxis yAxisId="left" tickFormatter={(v) => v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={45} />
                            <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => num(v)} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={55} />
                            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} labelFormatter={(d) => fmtDate(String(d))} formatter={(v: number, name: string) => name === "spend" ? [inr(v), "Spend"] : [num(v), "Impressions"]} />
                            <Area yAxisId="left" type="monotone" dataKey="spend" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#adSpendGradient)" isAnimationActive={false} />
                            <Line yAxisId="right" type="monotone" dataKey="impressions" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} isAnimationActive={false} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-base">Daily Breakdown</CardTitle></CardHeader>
                    <CardContent className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Impressions</TableHead>
                            <TableHead className="text-right">Reach</TableHead>
                            <TableHead className="text-right">Clicks</TableHead>
                            <TableHead className="text-right">CTR</TableHead>
                            <TableHead className="text-right">Spend</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.daily.map((d: any) => (
                            <TableRow key={d.date_start}>
                              <TableCell className="whitespace-nowrap">{fmtDate(d.date_start)}</TableCell>
                              <TableCell className="text-right">{num(d.impressions)}</TableCell>
                              <TableCell className="text-right">{num(d.reach)}</TableCell>
                              <TableCell className="text-right">{num(d.clicks)}</TableCell>
                              <TableCell className="text-right">{dec(d.ctr)}%</TableCell>
                              <TableCell className="text-right whitespace-nowrap">{inr(d.spend)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                  </>
                )}
              </>
            )}
          </div>
        ) : null}
    </div>
  );
}
