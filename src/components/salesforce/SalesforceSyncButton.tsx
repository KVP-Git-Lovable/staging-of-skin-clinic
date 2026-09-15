import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Cloud, Loader2, CircleCheck, CircleAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSalesforceSync } from "@/hooks/useSalesforceSync";

const STAGE_LABEL: Record<string, string> = {
  linking: "Linking patients",
  clinical: "Appointments, procedures & billing",
  pictures: "Photos",
  attachments: "Documents & attachments",
};

async function fetchPendingCounts() {
  const count = async (build: (q: any) => any) => {
    const { count } = await build(
      supabase.from("patients").select("id", { count: "exact", head: true }),
    );
    return count ?? 0;
  };
  const [totalPatients, linked, clinicalPending, picturesPending, attachmentsPending] = await Promise.all([
    count((q) => q),
    count((q) => q.not("sf_id", "is", null)),
    count((q) => q.not("sf_id", "is", null).is("sf_clinical_synced_at", null)),
    count((q) => q.not("sf_id", "is", null).is("sf_pictures_synced_at", null)),
    count((q) => q.not("sf_id", "is", null).is("sf_attachments_synced_at", null)),
  ]);
  return { totalPatients, linked, clinicalPending, picturesPending, attachmentsPending };
}

// Shared "Sync from Salesforce" trigger + progress panel. Safe to mount on
// multiple pages at once - they all reflect the same underlying run and
// resume automatically from whatever's still pending (nothing gets
// re-imported or missed, tracked per-patient via the sf_*_synced_at
// columns rather than by page or session).
export function SalesforceSyncButton() {
  const sync = useSalesforceSync();
  const queryClient = useQueryClient();
  const wasRunning = useRef(false);

  // Day boundaries in clinic time (IST) so "today" matches what staff see.
  const runRecent = (daysBack: number) => {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const start = new Date(now);
    start.setDate(start.getDate() - daysBack);
    start.setHours(0, 0, 0, 0);
    sync.startRecentSync(start, end);
  };


  const { data: pending, refetch } = useQuery({
    queryKey: ["salesforce-sync-pending"],
    queryFn: fetchPendingCounts,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (wasRunning.current && !sync.running) {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["invoices-page"] });
      queryClient.invalidateQueries({ queryKey: ["invoices-bounded"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-stats"] });
      queryClient.invalidateQueries({ queryKey: ["procedures"] });
      queryClient.invalidateQueries({ queryKey: ["patient-photos"] });
      if (sync.error) {
        toast.error(`Salesforce sync stopped: ${sync.error}`);
      } else if (sync.message === "Sync complete.") {
        const t = sync.totals;
        const total = t.clinical.imported + t.pictures.imported + t.attachments.imported;
        toast.success(`Salesforce sync complete — ${total} record(s) imported`);
      }
    }
    wasRunning.current = sync.running;
  }, [sync.running]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only real incomplete-import backlog for already-linked patients counts
  // as "pending" here - patients with no sf_id (totalPatients - linked)
  // aren't necessarily unsynced Salesforce records; many are app-only
  // patients (walk-ins/manual entries) that will never have a Salesforce
  // match, so folding that gap into this badge overstated outstanding work.
  const totalPending = pending
    ? pending.clinicalPending + pending.picturesPending + pending.attachmentsPending
    : undefined;
  const unmatchedPatients = pending ? pending.totalPatients - pending.linked : 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2">
          {sync.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
          {sync.running ? "Syncing…" : "Sync from Salesforce"}
          {!sync.running && totalPending !== undefined && totalPending > 0 && (
            <Badge variant="secondary" className="ml-1">{totalPending.toLocaleString()} pending</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-4 space-y-3">
        <div>
          <p className="text-sm font-medium">Salesforce sync</p>
          <p className="text-xs text-muted-foreground">
            Pulls patients, appointments, procedures, billing, photos and documents from Salesforce.
            Already-imported records are skipped automatically — nothing gets duplicated, and nothing
            manually entered in the app is ever touched or deleted.
          </p>
        </div>

        {pending && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>Patients linked</span>
            <span className="text-right font-medium text-foreground">{pending.linked.toLocaleString()} / {pending.totalPatients.toLocaleString()}</span>
            {unmatchedPatients > 0 && (
              <span className="col-span-2 text-[11px] text-muted-foreground/80">
                {unmatchedPatients.toLocaleString()} have no Salesforce match by phone — likely app-only patients, not outstanding sync work.
              </span>
            )}
            <span>Appointments/billing/procedures pending</span>
            <span className="text-right font-medium text-foreground">{pending.clinicalPending.toLocaleString()}</span>
            <span>Photos pending</span>
            <span className="text-right font-medium text-foreground">{pending.picturesPending.toLocaleString()}</span>
            <span>Documents pending</span>
            <span className="text-right font-medium text-foreground">{pending.attachmentsPending.toLocaleString()}</span>
          </div>
        )}

        {sync.stage && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-medium">
              <Loader2 className="h-3 w-3 animate-spin" />
              {STAGE_LABEL[sync.stage]}
            </div>
            <p className="text-muted-foreground">{sync.message}</p>
          </div>
        )}

        {!sync.running && sync.message === "Sync complete." && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-600">
            <CircleCheck className="h-3.5 w-3.5" /> Last run completed successfully.
          </div>
        )}
        {!sync.running && sync.error && (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <CircleAlert className="h-3.5 w-3.5" /> {sync.error}
          </div>
        )}

        {sync.log.length > 0 && (
          <div className="max-h-32 overflow-y-auto rounded-md border bg-muted/20 px-2 py-1.5 text-[11px] font-mono text-muted-foreground space-y-0.5">
            {sync.log.slice(-12).map((line, i) => <div key={i}>{line}</div>)}
          </div>
        )}

        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium">Bring in recent appointments</p>
          <p className="text-[11px] text-muted-foreground">
            Checks Salesforce for appointments booked on these dates — including patients who
            were only ever registered in Salesforce.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={sync.running} onClick={() => runRecent(0)}>Today</Button>
            <Button size="sm" variant="secondary" disabled={sync.running} onClick={() => runRecent(7)}>Last 7 days</Button>
            <Button size="sm" variant="secondary" disabled={sync.running} onClick={() => runRecent(30)}>Last 30 days</Button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          {sync.running ? (
            <Button size="sm" variant="outline" onClick={sync.stopSync}>Stop after current batch</Button>
          ) : (
            <Button size="sm" onClick={sync.startSync} className="gap-1.5">
              <Cloud className="h-3.5 w-3.5" />
              Sync everything
            </Button>
          )}
        </div>

      </PopoverContent>
    </Popover>
  );
}
