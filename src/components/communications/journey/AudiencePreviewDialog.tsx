import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { invokeJourneyActions, type AudienceConfig } from "@/lib/comms/journeys";

type PreviewRow = { id: string; name: string; phone: string | null; email: string | null; date_of_birth: string | null; city: string | null };
type PreviewResponse = { total: number; without_phone: number; can_view_rows?: boolean; rows?: PreviewRow[] };

export function AudiencePreviewDialog({
  open,
  onOpenChange,
  audienceConfig,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audienceConfig: AudienceConfig | null;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["comms-audience-rows", JSON.stringify(audienceConfig)],
    enabled: open && !!audienceConfig?.segments?.length,
    queryFn: () => invokeJourneyActions<PreviewResponse>({ action: "audience-preview", audience_config: audienceConfig, include_rows: true }),
  });

  const rows = data?.rows ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Audience Preview
            {(audienceConfig?.segments?.length ?? 0) > 1 && <Badge variant="outline">Multi-segment</Badge>}
            {data && <Badge variant="secondary">{data.total} total</Badge>}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Resolving audience...
          </div>
        ) : error ? (
          <p className="py-4 text-sm text-destructive">{(error as Error).message}</p>
        ) : data && data.can_view_rows === false ? (
          <p className="py-4 text-sm text-muted-foreground">
            {data.total} patients match. Patient details are not shown for your role.
          </p>
        ) : rows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No matching patients with a usable phone number.</p>
        ) : (
          <div className="max-h-[400px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Date of birth</TableHead>
                  <TableHead>City</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm font-medium">{r.name || "—"}</TableCell>
                    <TableCell className="text-xs">{r.phone || "—"}</TableCell>
                    <TableCell className="text-xs">{r.email || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{r.date_of_birth ? format(new Date(r.date_of_birth), "d MMM yyyy") : "—"}</TableCell>
                    <TableCell className="text-xs">{r.city || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {data && data.can_view_rows !== false && (
          <p className="text-xs text-muted-foreground">
            Showing first {Math.min(50, data.total)} of {data.total} combined patients
            {data.without_phone > 0 ? ` (${data.without_phone} more skipped, no usable phone)` : ""}.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
