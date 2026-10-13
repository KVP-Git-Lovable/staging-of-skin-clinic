import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, FileText, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Template = {
  sid: string;
  name: string;
  language: string;
  body: string;
  variables: string[];
  status: string;
  category: string | null;
  rejection_reason: string | null;
  updated_at: string;
};

const statusStyle: Record<string, string> = {
  approved: "bg-success/10 text-success",
  pending: "bg-warning/10 text-warning",
  received: "bg-warning/10 text-warning",
  rejected: "bg-destructive/10 text-destructive",
};

export default function WhatsAppTemplates() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["comms-whatsapp-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("comms-whatsapp-templates");
      if (error || !data || data.error) throw new Error(data?.error || error?.message || "templates_unavailable");
      return data.templates as Template[];
    },
    retry: false,
  });

  return (
    <div>
      <div className="page-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/communications/whatsapp" className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 h-4 w-4" /> WhatsApp Center
          </Link>
          <h1 className="page-title flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> WhatsApp Templates
          </h1>
          <p className="page-subtitle">Templates registered with Twilio for this clinic's WhatsApp sender</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <Skeleton className="m-4 h-48" />
          ) : isError || !data ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Templates could not be loaded. Check that the communications edge functions are deployed and the Twilio credentials are set.
            </p>
          ) : data.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No templates found on this Twilio account.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((t) => (
                  <TableRow key={t.sid}>
                    <TableCell className="align-top">
                      <p className="font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.language}{t.category ? ` · ${t.category}` : ""}</p>
                    </TableCell>
                    <TableCell className="max-w-md align-top">
                      <p className="whitespace-pre-wrap text-sm">{t.body || "—"}</p>
                      {t.variables.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">Variables: {t.variables.join(", ")}</p>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge className={statusStyle[t.status] ?? ""} variant={statusStyle[t.status] ? "default" : "outline"}>
                        {t.status.replace("_", " ")}
                      </Badge>
                      {t.rejection_reason && <p className="mt-1 text-xs text-destructive">{t.rejection_reason}</p>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top text-sm text-muted-foreground">
                      {format(new Date(t.updated_at), "d MMM yyyy")}
                    </TableCell>
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
