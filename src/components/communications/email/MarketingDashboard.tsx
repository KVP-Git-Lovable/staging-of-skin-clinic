import { useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import {
  Plus, MoreHorizontal, Copy, Pencil, Trash2, PauseCircle, PlayCircle, BarChart3, FileText, Send, Plug,
} from "lucide-react";
import { format } from "date-fns";
import { mailchimpApi, type MailchimpStatus } from "@/lib/comms/mailchimp";

type Campaign = {
  id: string;
  name: string;
  subject: string;
  status: string;
  scheduled_at: string | null;
  created_at: string;
  audience_snapshot_count: number;
  sent_count: number;
  delivered_count: number;
  open_count: number;
  click_count: number;
  bounce_count: number;
  unsubscribe_count: number;
  from_email: string;
  from_name: string;
  html: string;
  audience_config: any;
  preview_text: string | null;
  reply_to: string | null;
  timezone: string | null;
  mailchimp_campaign_id?: string | null;
  mailchimp_account_id?: string | null;
  mailchimp_report_synced_at?: string | null;
};

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "sent": return "default";
    case "sending": return "default";
    case "scheduled": return "secondary";
    case "paused": return "outline";
    case "failed": return "destructive";
    case "cancelled": return "destructive";
    default: return "outline";
  }
}

function pct(n: number, d: number) {
  if (!d) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}

interface Props {
  onNew: () => void;
  onEdit: (id: string) => void;
  onAnalytics: (id: string) => void;
  onOpenTemplates: () => void;
  onOpenConnections?: () => void;
}

export function MarketingDashboard({ onNew, onEdit, onAnalytics, onOpenTemplates, onOpenConnections }: Props) {
  const qc = useQueryClient();

  // Current Mailchimp account, to flag campaigns created under a previously connected account.
  const { data: mcStatus } = useQuery({
    queryKey: ["mailchimp-status"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MailchimpStatus> => {
      try { return await mailchimpApi<MailchimpStatus>("status"); } catch (e) { return { ok: false, error: (e as Error).message, connection: null }; }
    },
  });
  const currentAccountId = mcStatus?.connection?.account_id || null;
  const otherAccount = (c: Campaign) => !!c.mailchimp_account_id && !!currentAccountId && c.mailchimp_account_id !== currentAccountId;

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["marketing-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comms_email_campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Campaign[];
    },
  });

  // Mailchimp has no open/click webhooks: pull fresh report numbers for its live campaigns
  // (the edge function skips anything synced in the last 10 minutes).
  const syncedOnce = useRef(false);
  useEffect(() => {
    if (syncedOnce.current) return;
    const due = campaigns.some((c) => c.mailchimp_campaign_id
      && (c.status === "sending" || c.status === "scheduled" || c.status === "sent"));
    if (!due) return;
    syncedOnce.current = true;
    mailchimpApi("sync_report", {})
      .then(() => qc.invalidateQueries({ queryKey: ["marketing-campaigns"] }))
      .catch(() => { /* dashboard still shows the last synced numbers */ });
  }, [campaigns, qc]);

  const groups = useMemo(() => {
    const g: Record<string, Campaign[]> = { draft: [], scheduled: [], running: [], completed: [] };
    for (const c of campaigns) {
      if (c.status === "draft" || c.status === "paused" || c.status === "failed") g.draft.push(c);
      else if (c.status === "scheduled") g.scheduled.push(c);
      else if (c.status === "sending") g.running.push(c);
      else if (c.status === "sent" || c.status === "cancelled") g.completed.push(c);
      else g.draft.push(c);
    }
    return g;
  }, [campaigns]);

  const kpis = useMemo(() => {
    const totals = campaigns.reduce(
      (a, c) => {
        a.sent += c.sent_count || 0;
        a.delivered += c.delivered_count || 0;
        a.opens += c.open_count || 0;
        a.clicks += c.click_count || 0;
        a.bounces += c.bounce_count || 0;
        return a;
      },
      { sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0 },
    );
    return totals;
  }, [campaigns]);

  const duplicate = useMutation({
    mutationFn: async (c: Campaign) => {
      const { error } = await supabase.from("comms_email_campaigns").insert({
        name: `${c.name} (copy)`,
        subject: c.subject,
        preview_text: c.preview_text,
        from_name: c.from_name,
        from_email: c.from_email,
        reply_to: c.reply_to,
        html: c.html,
        audience_config: c.audience_config,
        timezone: c.timezone,
        status: "draft",
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketing-campaigns"] }); toast({ title: "Campaign duplicated" }); },
    onError: (e: Error) => toast({ title: "Duplicate failed", description: e.message, variant: "destructive" }),
  });

  const control = useMutation({
    mutationFn: async ({ campaign_id, action, scheduled_at }: { campaign_id: string; action: string; scheduled_at?: string }) => {
      await mailchimpApi("control", { campaign_id, action, scheduled_at });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketing-campaigns"] }); },
    onError: (e: Error) => toast({ title: "Action failed", description: e.message, variant: "destructive" }),
  });

  const renderTable = (rows: Campaign[]) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campaign</TableHead>
            <TableHead>Audience</TableHead>
            <TableHead>Scheduled</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Sent</TableHead>
            <TableHead className="text-right">Delivered</TableHead>
            <TableHead className="text-right">Opens</TableHead>
            <TableHead className="text-right">CTR</TableHead>
            <TableHead className="text-right">Bounce</TableHead>
            <TableHead className="text-right">Unsub</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.id} className="cursor-pointer" onClick={() => onAnalytics(c.id)}>
              <TableCell>
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground line-clamp-1">{c.subject}</div>
                {otherAccount(c) && <Badge variant="outline" className="mt-1 text-[10px] font-normal" title="Created under a previously connected Mailchimp account; duplicate it to send from the current one.">other Mailchimp account</Badge>}
              </TableCell>
              <TableCell>{c.audience_snapshot_count?.toLocaleString() || "—"}</TableCell>
              <TableCell className="text-xs">{c.scheduled_at ? format(new Date(c.scheduled_at), "MMM d, HH:mm") : "—"}</TableCell>
              <TableCell><Badge variant={statusVariant(c.status)}>{c.status}</Badge></TableCell>
              <TableCell className="text-right">{c.sent_count?.toLocaleString() || 0}</TableCell>
              <TableCell className="text-right">{c.delivered_count?.toLocaleString() || 0}</TableCell>
              <TableCell className="text-right">{c.open_count?.toLocaleString() || 0}</TableCell>
              <TableCell className="text-right">{pct(c.click_count, c.delivered_count)}</TableCell>
              <TableCell className="text-right">{pct(c.bounce_count, c.sent_count)}</TableCell>
              <TableCell className="text-right">{pct(c.unsubscribe_count, c.delivered_count)}</TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onAnalytics(c.id)}><BarChart3 className="h-4 w-4 mr-2" />View analytics</DropdownMenuItem>
                    {(c.status === "draft" || c.status === "scheduled" || c.status === "paused" || c.status === "failed") && !otherAccount(c) && (
                      <DropdownMenuItem onClick={() => onEdit(c.id)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => duplicate.mutate(c)}><Copy className="h-4 w-4 mr-2" />Duplicate</DropdownMenuItem>
                    {c.status === "scheduled" && !otherAccount(c) && (
                      <DropdownMenuItem onClick={() => control.mutate({ campaign_id: c.id, action: "pause" })}>
                        <PauseCircle className="h-4 w-4 mr-2" />Pause
                      </DropdownMenuItem>
                    )}
                    {c.status === "paused" && !otherAccount(c) && (
                      <DropdownMenuItem onClick={() => control.mutate({ campaign_id: c.id, action: "resume", scheduled_at: c.scheduled_at || undefined })}>
                        <PlayCircle className="h-4 w-4 mr-2" />Resume
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => {
                        if (confirm(`Delete campaign "${c.name}"?`)) control.mutate({ campaign_id: c.id, action: "delete" });
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-6 text-sm">No campaigns</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Email marketing</h2>
          <p className="text-sm text-muted-foreground">Design, target, schedule and track marketing campaigns via Mailchimp.</p>
        </div>
        <div className="flex gap-2">
          {onOpenConnections && <Button variant="outline" onClick={onOpenConnections}><Plug className="h-4 w-4 mr-2" />Connections</Button>}
          <Button variant="outline" onClick={onOpenTemplates}><FileText className="h-4 w-4 mr-2" />Templates</Button>
          <Button onClick={onNew}><Plus className="h-4 w-4 mr-2" />New Campaign</Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total sent</div><div className="text-2xl font-semibold">{kpis.sent.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Delivered</div><div className="text-2xl font-semibold">{kpis.delivered.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Open rate</div><div className="text-2xl font-semibold">{pct(kpis.opens, kpis.delivered)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">CTR</div><div className="text-2xl font-semibold">{pct(kpis.clicks, kpis.delivered)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Bounce rate</div><div className="text-2xl font-semibold">{pct(kpis.bounces, kpis.sent)}</div></CardContent></Card>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-base">Draft & needs attention</CardTitle>
              <span className="text-xs text-muted-foreground">{groups.draft.length}</span>
            </CardHeader>
            <CardContent className="p-0">{renderTable(groups.draft)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-base">Scheduled</CardTitle>
              <span className="text-xs text-muted-foreground">{groups.scheduled.length}</span>
            </CardHeader>
            <CardContent className="p-0">{renderTable(groups.scheduled)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-base">Running</CardTitle>
              <Send className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-0">{renderTable(groups.running)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-base">Completed</CardTitle>
              <span className="text-xs text-muted-foreground">{groups.completed.length}</span>
            </CardHeader>
            <CardContent className="p-0">{renderTable(groups.completed)}</CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default MarketingDashboard;
