import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Check, Copy, RefreshCw, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type ConfigResponse = {
  sender_number: string;
  sender_source: "secret" | "default";
  status: string;
  sender_sid: string | null;
  business_name: string | null;
  webhook_url: string;
  secrets: Record<string, boolean>;
  fetched_at: string;
};

const THROUGHPUT = "80 messages per second";

function statusBadge(status: string) {
  if (status === "ONLINE" || status === "IN-USE") return <Badge className="bg-success/10 text-success">Active</Badge>;
  if (status === "not_found") return <Badge variant="outline">Not found on Twilio</Badge>;
  if (status === "unknown") return <Badge variant="outline">Unknown</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}

export default function WhatsAppConfig() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["comms-whatsapp-config"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("comms-whatsapp-config");
      if (error || !data || data.error) throw new Error(data?.error || error?.message || "config_unavailable");
      return data as ConfigResponse;
    },
    retry: false,
  });

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
  };

  return (
    <div>
      <div className="page-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/communications/whatsapp" className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 h-4 w-4" /> WhatsApp Center
          </Link>
          <h1 className="page-title flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-primary" /> WhatsApp Configuration
          </h1>
          <p className="page-subtitle">Sender, connection status and webhook for this clinic</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : isError || !data ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Configuration could not be loaded. Check that the communications edge functions are deployed.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sender</CardTitle>
            </CardHeader>
            <CardContent>
              <Row label="Sender number">
                <span className="flex items-center gap-2">
                  {data.sender_number}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copy(data.sender_number)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </Row>
              <Row label="Status">{statusBadge(data.status)}</Row>
              <Row label="Business name">{data.business_name || "—"}</Row>
              <Row label="Throughput">{THROUGHPUT}</Row>
              <Row label="Last synced">{format(new Date(data.fetched_at), "d MMM yyyy, h:mm a")}</Row>
              {data.sender_source === "default" && (
                <p className="mt-3 rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  The <code>TWILIO_WHATSAPP_FROM</code> secret is not set, so this number is only a display default.
                  Messages cannot be sent until the secret is set.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connection</CardTitle>
            </CardHeader>
            <CardContent>
              <Row label="Webhook URL">
                <span className="flex items-center gap-2 break-all">
                  {data.webhook_url}
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copy(data.webhook_url)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </Row>
              {Object.entries(data.secrets).map(([name, present]) => (
                <Row key={name} label={name}>
                  {present ? (
                    <span className="inline-flex items-center gap-1 text-success"><Check className="h-4 w-4" /> Configured</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-destructive"><X className="h-4 w-4" /> Missing</span>
                  )}
                </Row>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
