import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ClipboardList, Download, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/visitsReviewCsv";

/**
 * Past visits marked Completed with nothing recorded against them.
 *
 * The clinic reported a patient whose 25 September visit read "Billed"
 * although she never attended and was never invoiced. The badge had been
 * derived from the appointment's status, and the status said "Completed" -
 * a word that came from the Salesforce import rather than from this clinic.
 * The badge now reads the invoice, so it no longer lies. This page is about
 * the records underneath it.
 *
 * It is a QUESTION, not a verdict, and the page says so out loud. A free
 * follow-up that genuinely happened and was never charged is indistinguishable
 * from a visit that never took place - which is exactly why nothing here
 * changes anything. Read-only, every row, on purpose: the only corrections
 * made are the ones a human has vouched for, one at a time.
 *
 * The heavy lifting is the `visits_needing_review` view, which carries the
 * definition of "nothing to show for it" so this page and any future report
 * cannot drift apart. It is declared security_invoker, so row level security
 * still applies to whoever opens it.
 */
const PAGE_SIZE = 50;

interface ReviewRow {
  appointment_id: string;
  patient_id: string | null;
  patient_name: string | null;
  start_time: string;
  service: string | null;
  doctor_name: string | null;
  from_salesforce: boolean;
}

export default function VisitsNeedingReview() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  const range = useMemo(() => ({ from, to }), [from, to]);

  const { data, isFetching } = useQuery({
    queryKey: ["visits-needing-review", range, page],
    queryFn: async () => {
      let q = supabase
        .from("visits_needing_review" as never)
        .select("*", { count: "exact" })
        .order("start_time", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (range.from) q = q.gte("start_time", `${range.from}T00:00:00`);
      if (range.to) q = q.lte("start_time", `${range.to}T23:59:59`);
      const { data: rows, error, count } = await q;
      if (error) throw error;
      return { rows: (rows ?? []) as unknown as ReviewRow[], total: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  /**
   * The whole filtered set, not just the page on screen.
   *
   * Reviewing four thousand visits is not something anyone will do fifty rows
   * at a time in a browser - it is a job for a spreadsheet passed round the
   * clinic. Capped so a mis-set filter cannot try to pull the entire history
   * into one file.
   */
  const exportCsv = async () => {
    setExporting(true);
    try {
      let q = supabase
        .from("visits_needing_review" as never)
        .select("*")
        .order("start_time", { ascending: false })
        .limit(5000);
      if (range.from) q = q.gte("start_time", `${range.from}T00:00:00`);
      if (range.to) q = q.lte("start_time", `${range.to}T23:59:59`);
      const { data: all, error } = await q;
      if (error) throw error;
      downloadCsv((all ?? []) as unknown as ReviewRow[]);
      toast.success(`${(all ?? []).length} visits exported`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not export the list");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold font-display flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" />Visits to review
        </h1>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting || total === 0} className="min-h-11 gap-2 sm:min-h-0">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export CSV
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {isFetching && !data ? "Counting…" : `${total.toLocaleString("en-IN")} visits`}
          </CardTitle>
          <CardDescription>
            Past appointments marked <strong>Completed</strong> with no bill and no procedure recorded
            against them. These are <strong>questions, not mistakes</strong> — a follow-up that genuinely
            happened and was never charged looks exactly the same from here. Nothing on this page changes
            any record; open a visit to decide on it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 sm:flex-none">
              <Label htmlFor="from" className="text-xs">From</Label>
              <Input id="from" type="date" value={from}
                onChange={(e) => { setFrom(e.target.value); setPage(0); }} className="w-full sm:w-40" />
            </div>
            <div className="min-w-0 flex-1 sm:flex-none">
              <Label htmlFor="to" className="text-xs">To</Label>
              <Input id="to" type="date" value={to}
                onChange={(e) => { setTo(e.target.value); setPage(0); }} className="w-full sm:w-40" />
            </div>
            {(from || to) && (
              <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-0"
                onClick={() => { setFrom(""); setTo(""); setPage(0); }}>Clear</Button>
            )}
          </div>

          {rows.length === 0 && !isFetching ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing to review in this range.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Origin</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.appointment_id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(r.start_time), "dd/MM/yyyy")}
                      <span className="block text-xs text-muted-foreground">
                        {format(new Date(r.start_time), "hh:mm a")}
                      </span>
                    </TableCell>
                    <TableCell>{r.patient_name || "—"}</TableCell>
                    <TableCell>{r.service || "—"}</TableCell>
                    <TableCell>{r.doctor_name || "—"}</TableCell>
                    <TableCell>
                      {/* The strongest clue on the row: almost all of these
                          arrived already marked Completed by the migration,
                          rather than being completed by anybody here. */}
                      <Badge variant="outline" className="text-xs">
                        {r.from_salesforce ? "Salesforce" : "Created here"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.patient_id && (
                        <Button asChild variant="ghost" size="icon" className="h-9 w-9">
                          <Link to={`/patients/${r.patient_id}`} title="Open the patient">
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-2 pt-2">
              <span className="text-xs text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString("en-IN")}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="min-h-11 sm:min-h-0"
                  disabled={page === 0 || isFetching} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" className="min-h-11 sm:min-h-0"
                  disabled={page >= lastPage || isFetching} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
