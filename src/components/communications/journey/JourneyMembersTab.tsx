import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv } from "@/lib/comms/csv";
import type { CanvasData } from "@/lib/comms/journeyGraph";
import {
  buildMembers, MEMBER_FILTERS, searchMembers,
  type EnrollmentRow, type InboundRow, type Member, type MemberFilter, type MemberLogRow, type MessageState,
} from "@/lib/comms/journeyMembers";
import { fetchAll } from "@/lib/supabasePaginate";

const PAGE_SIZE = 50;
const STATE_LABEL: Record<MessageState, string> = {
  read: "Read", delivered: "Delivered", sent: "Sent", failed: "Failed", skipped: "Skipped", queued: "Queued", none: "Not sent yet",
};
const STATE_TONE: Partial<Record<MessageState, string>> = {
  read: "bg-success/10 text-success", delivered: "bg-success/10 text-success", sent: "bg-primary/10 text-primary", failed: "bg-destructive/10 text-destructive",
};

async function loadMemberData(journeyId: string): Promise<{ enrollments: EnrollmentRow[]; logs: MemberLogRow[]; inbound: InboundRow[] }> {
  const enrollments = await fetchAll<EnrollmentRow>((from, to) =>
    supabase
      .from("comms_journey_enrollments")
      .select("id, patient_id, status, current_node_id, enrolled_at, patients(first_name, last_name, phone)")
      .eq("journey_id", journeyId)
      .order("enrolled_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  if (!enrollments.length) return { enrollments, logs: [], inbound: [] };
  const logs = await fetchAll<MemberLogRow>((from, to) =>
    supabase
      .from("comms_journey_message_log")
      .select("enrollment_id, channel, status, delivery_status, sent_at")
      .eq("journey_id", journeyId)
      .order("sent_at")
      .order("id")
      .range(from, to),
  );
  // Replies can only follow a message, so nothing older than the journey's first one is read.
  const inbound = logs.length
    ? await fetchAll<InboundRow>((from, to) =>
        supabase
          .from("whatsapp_conversations")
          .select("phone, created_at")
          .eq("direction", "inbound")
          .gte("created_at", logs[0].sent_at)
          .order("created_at")
          .order("id")
          .range(from, to),
      )
    : [];
  return { enrollments, logs, inbound };
}

/** Everyone enrolled in the journey. Read-only. */
export function JourneyMembersTab({ journeyId, canvas }: { journeyId: string; canvas: CanvasData }) {
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data: raw, isLoading, error } = useQuery({
    queryKey: ["comms-journey-members", journeyId],
    queryFn: () => loadMemberData(journeyId),
  });
  const data: Member[] = useMemo(() => (raw ? buildMembers(raw.enrollments, raw.logs, raw.inbound, canvas) : []), [raw, canvas]);
  const rows = useMemo(() => searchMembers(data, term, filter), [data, term, filter]);

  const exportCsv = () =>
    downloadCsv(`journey-${journeyId}-members.csv`, [
      ["Name", "Phone", "Entered", "Status", "Current step", "Last message", "Last message at", "Replied"],
      ...rows.map((m) => [m.name, m.phone, m.enrolledAt, m.status, m.currentStep, STATE_LABEL[m.lastMessage], m.lastMessageAt ?? "", m.replied ? "Yes" : "No"]),
    ]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) return <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">Members could not be loaded: {(error as Error).message}</p>;
  if (!data.length) {
    return <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">No one has entered this journey yet. Patients appear here after it is activated.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" aria-label="Search members" placeholder="Search name or phone" value={term} onChange={(e) => { setTerm(e.target.value); setLimit(PAGE_SIZE); }} />
        </div>
        <Select value={filter} onValueChange={(v) => { setFilter(v as MemberFilter); setLimit(PAGE_SIZE); }}>
          <SelectTrigger className="sm:w-[170px]" aria-label="Filter members"><SelectValue /></SelectTrigger>
          <SelectContent>{MEMBER_FILTERS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{rows.length} of {data.length}</span>
        <Button variant="outline" size="sm" className="sm:ml-auto" onClick={exportCsv} disabled={!rows.length}><Download className="mr-1.5 h-4 w-4" /> Export CSV</Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Entered</TableHead><TableHead>Status</TableHead>
                <TableHead>Current step</TableHead><TableHead>Last message</TableHead><TableHead>Replied</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-muted-foreground">No members match.</TableCell></TableRow>
              ) : rows.slice(0, limit).map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap font-medium">{m.name}</TableCell>
                  <TableCell className="whitespace-nowrap">{m.phone || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{format(new Date(m.enrolledAt), "d MMM yyyy, h:mm a")}</TableCell>
                  <TableCell><Badge variant="outline">{m.status.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell>{m.currentStep}</TableCell>
                  <TableCell><Badge variant="outline" className={STATE_TONE[m.lastMessage]}>{STATE_LABEL[m.lastMessage]}</Badge></TableCell>
                  <TableCell>{m.replied ? "Yes" : "No"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {rows.length > limit && <Button variant="ghost" size="sm" onClick={() => setLimit(limit + PAGE_SIZE)}>Show more</Button>}
    </div>
  );
}
