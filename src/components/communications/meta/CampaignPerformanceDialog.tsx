import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, RefreshCw } from "lucide-react";

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
const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function daysBetween(a?: string | null, b?: string | null) {
  if (!a) return null;
  const start = new Date(a).getTime();
  const end = b ? new Date(b).getTime() : Date.now();
  return Math.max(0, Math.round((end - start) / 86400000));
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold whitespace-nowrap">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function CampaignPerformanceDialog({
  campaignId,
  onOpenChange,
}: {
  campaignId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [preset, setPreset] = useState("maximum");

  const load = async () => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);
    const { data: res, error: err } = await supabase.functions.invoke("meta-api", {
      body: { action: "campaign_performance", payload: { campaign_id: campaignId, date_preset: preset } },
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
    if (campaignId) load();
    else setData(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, preset]);

  const t = data?.totals;
  const meta = data?.campaign?.meta;
  const runDays = daysBetween(meta?.start_time || data?.campaign?.start_date, meta?.stop_time || data?.campaign?.end_date);
  const actionCount = (type: string) =>
    Number((t?.actions || []).find((a: any) => a.action_type === type)?.value || 0);

  return (
    <Dialog open={!!campaignId} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Campaign Performance</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">{data?.campaign?.name || "—"}</p>
            <p className="text-xs text-muted-foreground font-mono">{meta?.id || ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESETS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : data ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant="secondary" className="capitalize">{meta?.effective_status || data.campaign.status}</Badge>
              <span className="text-muted-foreground">
                Ran from {fmtDate(meta?.start_time || data.campaign.start_date)} to{" "}
                {meta?.stop_time || data.campaign.end_date ? fmtDate(meta?.stop_time || data.campaign.end_date) : "ongoing"}
              </span>
              {runDays !== null && <Badge variant="outline">{runDays} day{runDays === 1 ? "" : "s"}</Badge>}
            </div>

            {!t ? (
              <p className="py-8 text-center text-muted-foreground">
                Meta has not reported any delivery data for this campaign in the selected period.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Kpi label="Impressions" value={num(t.impressions)} />
                  <Kpi label="Reach" value={num(t.reach)} />
                  <Kpi label="Clicks" value={num(t.clicks)} hint={`${num(t.unique_clicks)} unique`} />
                  <Kpi label="CTR" value={`${dec(t.ctr)}%`} />
                  <Kpi label="Amount Spent" value={inr(t.spend)} />
                  <Kpi label="CPC" value={inr(t.cpc)} />
                  <Kpi label="CPM" value={inr(t.cpm)} />
                  <Kpi label="Frequency" value={dec(t.frequency)} />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Kpi label="Link Clicks" value={num(actionCount("link_click"))} />
                  <Kpi label="Leads" value={num(actionCount("lead"))} />
                  <Kpi label="Post Engagement" value={num(actionCount("post_engagement"))} />
                </div>

                {data.ads?.length > 0 && (
                  <Card className="rounded-xl">
                    <CardHeader><CardTitle className="text-base">Performance by Ad</CardTitle></CardHeader>
                    <CardContent className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Ad</TableHead>
                            <TableHead>Ad Set</TableHead>
                            <TableHead className="text-right">Impressions</TableHead>
                            <TableHead className="text-right">Clicks</TableHead>
                            <TableHead className="text-right">CTR</TableHead>
                            <TableHead className="text-right">Spend</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.ads.map((a: any) => (
                            <TableRow key={a.ad_id}>
                              <TableCell className="whitespace-nowrap font-medium">{a.ad_name}</TableCell>
                              <TableCell className="whitespace-nowrap">{a.adset_name || "—"}</TableCell>
                              <TableCell className="text-right">{num(a.impressions)}</TableCell>
                              <TableCell className="text-right">{num(a.clicks)}</TableCell>
                              <TableCell className="text-right">{dec(a.ctr)}%</TableCell>
                              <TableCell className="text-right whitespace-nowrap">{inr(a.spend)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {data.daily?.length > 0 && (
                  <Card className="rounded-xl">
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
                )}
              </>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
