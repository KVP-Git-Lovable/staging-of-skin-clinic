import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { format } from "date-fns";
import { RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { APPOINTMENT_CONFIRMATION_WHATSAPP_ENABLED } from "@/lib/whatsappNotifications";
import {
  AUTO_SYNC_DAYS,
  CONVERSATION_POLL_MS,
  STATUS_SYNC_MS,
  lastUpdatedLabel,
  shouldAutoSync,
} from "@/lib/whatsappAutoSync";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  read: { label: "Read", cls: "bg-success/15 text-success border-success/30" },
  delivered: { label: "Delivered", cls: "bg-success/15 text-success border-success/30" },
  sent: { label: "Sent (awaiting delivery)", cls: "bg-warning/15 text-warning border-warning/30" },
  queued: { label: "Queued", cls: "bg-warning/15 text-warning border-warning/30" },
  accepted: { label: "Queued", cls: "bg-warning/15 text-warning border-warning/30" },
  undelivered: { label: "Not delivered", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  failed: { label: "Failed", cls: "bg-destructive/15 text-destructive border-destructive/30" },
};

const ERROR_HINT: Record<number, string> = {
  63024: "Number is not on WhatsApp or is saved wrongly",
  63016: "Outside 24-hour window",
  63003: "Invalid WhatsApp number",
  63049: "Blocked by WhatsApp (marketing limit)",
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { label: status, cls: "" };
  return <Badge variant="outline" className={s.cls}>{s.label}</Badge>;
}

type Filter = "all" | "problem";

export function WhatsAppDeliveryLog({ patientId }: { patientId?: string }) {
  const qc = useQueryClient();
  // Everything, wherever this card is shown. It used to open the WhatsApp
  // Delivery page narrowed to the failures, on the reasoning that the page
  // exists to surface them - but a page that hides most of its rows until you
  // change a dropdown reads as broken rather than filtered, and the clinic
  // wants to see what went out. The dropdown still narrows it on demand.
  const [filter, setFilter] = useState<Filter>("all");
  // When Twilio was last asked, by anyone on this screen. Drives both the
  // "Updated 3 min ago" line and the guard that stops the timer following a
  // manual Refresh with an automatic one.
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const lastSyncedRef = useRef<number | null>(null);
  // Re-rendered on a clock of its own, or the label would freeze at whatever
  // it said when the last query happened to settle.
  const [, setTick] = useState(0);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["whatsapp-delivery-log", patientId ?? "all", filter],
    queryFn: async () => {
      // The sync now records everything the clinic sends (tagged `kind`) so the
      // Conversations tab can show it. This card is only about appointment
      // confirmations - without the filter, bot replies and invoices bury the
      // confirmations that actually failed to arrive.
      let q = supabase
        .from("whatsapp_delivery_log")
        .select("message_sid, patient_id, phone, status, error_code, error_message, sent_at, patients(first_name, last_name)")
        .eq("kind", "confirmation")
        .order("sent_at", { ascending: false })
        .limit(patientId ? 100 : 300);
      if (patientId) q = q.eq("patient_id", patientId);
      if (filter === "problem") q = q.in("status", ["undelivered", "failed", "sent", "queued", "accepted"]);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
    // Statuses another machine has already synced show up here without a
    // click, and this costs one indexed read.
    refetchInterval: CONVERSATION_POLL_MS,
    refetchOnWindowFocus: true,
  });

  const runSync = useCallback(async (days: number) => {
    const { data, error } = await supabase.functions.invoke("whatsapp-delivery-sync", { body: { days } });
    if (error) {
      const details = error instanceof FunctionsHttpError ? await error.context.text() : error.message;
      throw new Error(details);
    }
    lastSyncedRef.current = Date.now();
    setLastSyncedAt(lastSyncedRef.current);
    return data as { synced: number };
  }, []);

  /**
   * Refresh status, pressed on purpose.
   *
   * Six months, not a week: this is also what fills the conversation screen
   * with the messages patients received, and the sync upserts by Twilio SID,
   * so re-reading what we already hold costs nothing but time. It is the
   * exception now - the automatic one below keeps the page current.
   */
  const sync = useMutation({
    mutationFn: () => runSync(180),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp-delivery-log"] });
      toast.success("Delivery status updated");
    },
    onError: (e: Error) => toast.error(`Could not update: ${e.message}`),
  });

  /**
   * The same thing, quietly, over the couple of days where a status can still
   * change. No toast: nobody asked for it, and an error every two minutes
   * because the network dropped would be worse than a stale badge.
   */
  useEffect(() => {
    let cancelled = false;
    const trySync = async () => {
      if (document.hidden) return;
      if (!shouldAutoSync(lastSyncedRef.current)) return;
      try {
        await runSync(AUTO_SYNC_DAYS);
        if (!cancelled) qc.invalidateQueries({ queryKey: ["whatsapp-delivery-log"] });
      } catch (e) {
        console.error("Automatic WhatsApp status sync failed", e);
      }
    };
    void trySync();
    const timer = window.setInterval(trySync, STATUS_SYNC_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [qc, runSync]);

  // Keeps "Updated 3 min ago" honest while the page sits open.
  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">WhatsApp confirmations</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All messages</SelectItem>
              <SelectItem value="problem">Not delivered / pending</SelectItem>
            </SelectContent>
          </Select>
          {lastSyncedAt !== null && (
            <span className="text-xs text-muted-foreground">{lastUpdatedLabel(lastSyncedAt)}</span>
          )}
          <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1">Refresh status</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Without this the screen reads as a live feed: it is headed
            "WhatsApp confirmations", it lists messages, and it has a Refresh
            button, so the clinic quite reasonably asked why messages were still
            going out three days after they were switched off. They were not -
            these are the ones sent before. Read from the same constant the
            sending code reads, so the two cannot disagree. */}
        {!APPOINTMENT_CONFIRMATION_WHATSAPP_ENABLED && (
          <p className="mb-3 text-xs text-amber-700 dark:text-amber-500 bg-amber-500/10 rounded-md px-3 py-2">
            Appointment confirmations are switched off. Nothing new is being sent — these are the
            messages sent before.
          </p>
        )}
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {filter === "problem" ? "No undelivered messages." : "No confirmation messages recorded yet."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent</TableHead>
                  {!patientId && <TableHead>Patient</TableHead>}
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.message_sid}>
                    <TableCell className="whitespace-nowrap">{format(new Date(r.sent_at), "dd MMM yyyy, hh:mm a")}</TableCell>
                    {!patientId && (
                      <TableCell>
                        {r.patient_id && r.patients ? (
                          <Link className="text-primary hover:underline" to={`/patients/${r.patient_id}`}>
                            {r.patients.first_name} {r.patients.last_name}
                          </Link>
                        ) : <span className="text-muted-foreground">Unknown</span>}
                      </TableCell>
                    )}
                    <TableCell className="whitespace-nowrap">{r.phone}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.error_code ? (ERROR_HINT[r.error_code] ?? r.error_message ?? `Error ${r.error_code}`) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
