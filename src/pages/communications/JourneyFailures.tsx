import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, ArrowLeft, Download, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadCsv } from "@/lib/comms/csv";
import { describeTwilioError } from "@/lib/comms/twilioErrors";

type Row = {
  id: string;
  patient_id: string | null;
  status: string;
  delivery_status: string | null;
  error_code: string | null;
  error_message: string | null;
  sent_at: string;
  patient: { first_name: string; last_name: string | null; phone: string | null } | null;
};

const TABS = [
  { key: "rate", label: "Rate-limited", hint: "Sends Twilio or WhatsApp throttled. They can be sent again later." },
  { key: "63049", label: "63049", hint: "Meta chose not to deliver this marketing message to the recipient." },
  { key: "63024", label: "63024", hint: "The recipient's number could not be reached on WhatsApp." },
  { key: "63032", label: "63032", hint: "The recipient's WhatsApp account cannot receive this kind of message." },
];

const isRateLimited = (r: Row) => /rate limit/i.test(r.error_message ?? "") || r.error_code === "63018" || r.error_code === "63038";

// Read-only view of failed sends. Retry and exclude tools arrive with the sending engine.
export default function JourneyFailures() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") && TABS.some((t) => t.key === params.get("tab")) ? params.get("tab")! : "rate";

  const { data = [], isLoading } = useQuery({
    queryKey: ["comms-journey-failures", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comms_journey_message_log")
        .select("id, patient_id, status, delivery_status, error_code, error_message, sent_at, patient:patients(first_name, last_name, phone)")
        .eq("journey_id", id!)
        .order("sent_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data || []) as unknown as Row[];
    },
  });

  const { data: journey } = useQuery({
    queryKey: ["comms-journey-name", id],
    enabled: !!id,
    queryFn: async () => (await supabase.from("comms_journeys").select("name").eq("id", id!).maybeSingle()).data,
  });

  const rows = useMemo(() => {
    // People who were later delivered successfully are not failures any more.
    const succeeded = new Set(data.filter((r) => r.status === "delivered" || r.status === "read" || r.delivery_status === "delivered").map((r) => r.patient_id));
    const latest = new Map<string, Row>();
    for (const r of data) {
      const failed = r.status === "failed" || r.status === "undelivered" || r.delivery_status === "failed";
      if (!failed || succeeded.has(r.patient_id)) continue;
      const key = r.patient_id ?? r.id;
      if (!latest.has(key)) latest.set(key, r);
    }
    return Array.from(latest.values()).filter((r) => (tab === "rate" ? isRateLimited(r) : r.error_code === tab));
  }, [data, tab]);

  const nameOf = (r: Row) => (r.patient ? `${r.patient.first_name} ${r.patient.last_name ?? ""}`.trim() : "—");
  const current = TABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-4">
      <div>
        <Link to={`/communications/journeys/${id}/analytics`} className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1 h-4 w-4" /> Analytics
        </Link>
        <h1 className="page-title flex items-center gap-2">
          {tab === "rate" ? <AlertTriangle className="h-6 w-6 text-warning" /> : <ShieldAlert className="h-6 w-6 text-destructive" />}
          Failed deliveries{journey?.name ? ` — ${journey.name}` : ""}
        </h1>
        <p className="page-subtitle">Read-only list of patients whose message could not be delivered</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-3 border-b p-4">
            <p className="text-sm text-muted-foreground">{current.hint} <span className="font-medium text-foreground">{rows.length} patient{rows.length === 1 ? "" : "s"}.</span></p>
            <Button
              variant="outline"
              size="sm"
              disabled={rows.length === 0}
              onClick={() =>
                downloadCsv(`journey-${id}-failures-${tab}.csv`, [
                  ["Patient", "Phone", "Error", "Last attempt"],
                  ...rows.map((r) => [nameOf(r), r.patient?.phone ?? "", describeTwilioError(r.error_code, r.error_message), r.sent_at]),
                ])
              }
            >
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
          </div>
          {isLoading ? (
            <Skeleton className="m-4 h-40" />
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No failures in this category.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Last attempt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{nameOf(r)}</TableCell>
                    <TableCell className="text-sm">{r.patient?.phone ?? "—"}</TableCell>
                    <TableCell className="max-w-md text-sm text-destructive">{describeTwilioError(r.error_code, r.error_message) || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{format(new Date(r.sent_at), "MMM d, HH:mm")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
