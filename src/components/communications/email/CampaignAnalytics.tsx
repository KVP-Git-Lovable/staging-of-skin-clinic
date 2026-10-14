import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { mailchimpApi } from "@/lib/comms/mailchimp";
import { toast } from "@/hooks/use-toast";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface Props { campaignId: string; onBack: () => void }

function pct(n: number, d: number) { if (!d) return "0.0%"; return `${((n / d) * 100).toFixed(1)}%`; }

export function CampaignAnalytics({ campaignId, onBack }: Props) {
  const qc = useQueryClient();
  const refreshMailchimp = useMutation({
    mutationFn: () => mailchimpApi("sync_report", { campaign_id: campaignId, force: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mkt-campaign", campaignId] });
      qc.invalidateQueries({ queryKey: ["mkt-events", campaignId] });
      qc.invalidateQueries({ queryKey: ["marketing-campaigns"] });
      toast({ title: "Report refreshed from Mailchimp" });
    },
    onError: (e: Error) => toast({ title: "Refresh failed", description: e.message, variant: "destructive" }),
  });
  const { data: c, isLoading } = useQuery({
    queryKey: ["mkt-campaign", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.from("comms_email_campaigns").select("*").eq("id", campaignId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["mkt-events", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comms_email_events")
        .select("event_type, event_timestamp, url")
        .eq("campaign_id", campaignId)
        .order("event_timestamp", { ascending: true })
        .limit(20000);
      if (error) throw error;
      return data || [];
    },
  });

  // Bucket events by hour
  const buckets: Record<string, Record<string, number>> = {};
  for (const e of events as any[]) {
    const key = format(new Date(e.event_timestamp), "MMM d HH:00");
    buckets[key] = buckets[key] || {};
    buckets[key][e.event_type] = (buckets[key][e.event_type] || 0) + 1;
  }
  const trend = Object.entries(buckets).map(([k, v]) => ({
    time: k,
    delivered: v["delivered"] || 0,
    opens: v["open"] || 0,
    clicks: v["click"] || 0,
    bounces: v["bounce"] || 0,
  }));

  const topLinks: Record<string, number> = {};
  for (const e of events as any[]) {
    if (e.event_type === "click" && e.url) topLinks[e.url] = (topLinks[e.url] || 0) + 1;
  }
  const topLinksArr = Object.entries(topLinks).sort((a, b) => b[1] - a[1]).slice(0, 10);

  if (isLoading || !c) return <div className="space-y-3"><Skeleton className="h-8 w-40" /><Skeleton className="h-40 w-full" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">{c.name}</h2>
          <Badge>{c.status}</Badge>
          <Button size="sm" variant="outline" onClick={() => refreshMailchimp.mutate()} disabled={refreshMailchimp.isPending || !c.mailchimp_campaign_id}>
            {refreshMailchimp.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}Refresh from Mailchimp
          </Button>
          {c.mailchimp_web_id && (
            <a className="inline-flex items-center gap-1 text-xs underline text-muted-foreground" href={`https://admin.mailchimp.com/campaigns/show?id=${c.mailchimp_web_id}`} target="_blank" rel="noreferrer">
              Open in Mailchimp <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <span className="text-xs text-muted-foreground">
            {c.mailchimp_report_synced_at ? `Last synced ${format(new Date(c.mailchimp_report_synced_at), "MMM d, HH:mm")}` : "Not synced yet"}
          </span>
        </div>
        <div className="text-sm text-muted-foreground">Subject: {c.subject}</div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-6">
        {[
          { l: "Sent", v: c.sent_count },
          { l: "Delivered", v: c.delivered_count },
          { l: "Opens", v: c.open_count },
          { l: "Open rate", v: pct(c.open_count, c.delivered_count) },
          { l: "Clicks", v: c.click_count },
          { l: "CTR", v: pct(c.click_count, c.delivered_count) },
          { l: "Bounce", v: c.bounce_count },
          { l: "Spam reports", v: c.spam_count },
          { l: "Unsubscribes", v: c.unsubscribe_count },
          { l: "Dropped", v: c.dropped_count },
          { l: "Audience", v: c.audience_snapshot_count?.toLocaleString() || "—" },
          { l: "Scheduled", v: c.scheduled_at ? format(new Date(c.scheduled_at), "MMM d, HH:mm") : "—" },
        ].map((k) => (
          <Card key={k.l}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{k.l}</div><div className="text-xl font-semibold whitespace-nowrap">{k.v ?? 0}</div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Engagement over time</CardTitle></CardHeader>
        <CardContent className="h-72">
          {trend.length === 0 ? (
            <div className="text-muted-foreground text-sm">No events yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="delivered" stroke="#10b981" dot={false} />
                <Line type="monotone" dataKey="opens" stroke="#3b82f6" dot={false} />
                <Line type="monotone" dataKey="clicks" stroke="#f59e0b" dot={false} />
                <Line type="monotone" dataKey="bounces" stroke="#ef4444" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Top clicked links</CardTitle></CardHeader>
        <CardContent>
          {topLinksArr.length === 0 ? (
            <div className="text-sm text-muted-foreground">No click data yet.</div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>URL</TableHead><TableHead className="text-right">Clicks</TableHead></TableRow></TableHeader>
              <TableBody>
                {topLinksArr.map(([url, count]) => (
                  <TableRow key={url}><TableCell className="font-mono text-xs break-all">{url}</TableCell><TableCell className="text-right">{count}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default CampaignAnalytics;
