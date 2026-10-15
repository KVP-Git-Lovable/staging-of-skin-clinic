import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv } from "@/lib/comms/csv";
import { describeTwilioError } from "@/lib/comms/twilioErrors";

type LogRow = {
  id: string;
  patient_id: string | null;
  status: string;
  delivery_status: string | null;
  error_code: string | null;
  error_message: string | null;
  sent_at: string;
  twilio_message_sid: string | null;
  template: { name: string; body: string } | null;
  patient: { first_name: string; last_name: string | null; phone: string | null } | null;
};

const RANK: Record<string, number> = { read: 5, delivered: 4, sent: 3, queued: 2, failed: 0, undelivered: 0 };
const rank = (s: string) => RANK[s] ?? 1;

const statusStyle = (s: string) =>
  s === "read" ? "bg-info/10 text-info" : s === "delivered" ? "bg-success/10 text-success" : s === "failed" || s === "undelivered" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";

export function JourneyLogsDialog({
  open,
  onOpenChange,
  journeyId,
  journeyName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  journeyId: string;
  journeyName?: string;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const { data = [], isLoading } = useQuery({
    queryKey: ["comms-journey-logs", journeyId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comms_journey_message_log")
        .select("id, patient_id, status, delivery_status, error_code, error_message, sent_at, twilio_message_sid, template:comms_whatsapp_templates(name, body), patient:patients(first_name, last_name, phone)")
        .eq("journey_id", journeyId)
        .order("sent_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data || []) as unknown as LogRow[];
    },
  });

  // One row per patient: the furthest status reached (read > delivered > sent > failed), latest on ties.
  const rows = useMemo(() => {
    const best = new Map<string, LogRow>();
    for (const r of data) {
      const key = r.patient_id ?? r.id;
      const cur = best.get(key);
      if (!cur || rank(r.status) > rank(cur.status)) best.set(key, r);
    }
    const q = search.trim().toLowerCase();
    return Array.from(best.values()).filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      const name = `${r.patient?.first_name ?? ""} ${r.patient?.last_name ?? ""}`.toLowerCase();
      return name.includes(q) || (r.patient?.phone ?? "").includes(q);
    });
  }, [data, search, status]);

  const nameOf = (r: LogRow) => (r.patient ? `${r.patient.first_name} ${r.patient.last_name ?? ""}`.trim() : "—");
  const reasonOf = (r: LogRow) => (r.error_code || r.error_message ? describeTwilioError(r.error_code, r.error_message) : "");

  const exportCsv = () =>
    downloadCsv(`journey-${journeyId}-logs.csv`, [
      ["Patient", "Phone", "Message", "Status", "Reason", "Sent At", "SID"],
      ...rows.map((r) => [nameOf(r), r.patient?.phone ?? "", r.template?.name ?? "", r.status, reasonOf(r), r.sent_at, r.twilio_message_sid ?? ""]),
    ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Message logs{journeyName ? ` — ${journeyName}` : ""}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="read">Read</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
        </div>

        <div className="max-h-[55vh] overflow-auto rounded-md border">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading logs…</div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{data.length === 0 ? "No messages have been sent by this journey yet." : "No logs match your filters."}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Sent at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm font-medium">{nameOf(r)}</TableCell>
                    <TableCell className="text-xs">{r.patient?.phone ?? "—"}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs" title={r.template?.body}>{r.template?.name ?? "—"}</TableCell>
                    <TableCell><Badge className={statusStyle(r.status)}>{r.status}</Badge></TableCell>
                    <TableCell className="max-w-[220px] text-xs text-destructive">{reasonOf(r) || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{format(new Date(r.sent_at), "MMM d, HH:mm")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <p className="text-xs text-muted-foreground">One row per patient, showing the furthest status reached. Up to the latest 2,000 messages are loaded.</p>
      </DialogContent>
    </Dialog>
  );
}
