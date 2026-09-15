import { formatMoney } from "@/lib/currency";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

export type DrillKind = "invoices" | "appointments" | "patients";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  records: any[];
  kind: DrillKind;
}

export function DashboardDrillDown({ open, onOpenChange, title, records, kind }: Props) {
  const navigate = useNavigate();

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {title} <span className="text-muted-foreground font-normal">({records.length})</span>
          </DialogTitle>
        </DialogHeader>
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No records found</p>
        ) : kind === "invoices" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Invoice #</TableHead>
                <TableHead className="text-xs">Patient</TableHead>
                <TableHead className="text-xs">Doctor</TableHead>
                <TableHead className="text-xs">Payment Mode</TableHead>
                <TableHead className="text-xs">Amount</TableHead>
                <TableHead className="text-xs">Paid</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r: any) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => go(`/billing?viewInvoice=${r.id}`)}>
                  <TableCell className="text-xs text-primary underline font-medium">{r.invoice_number}</TableCell>
                  <TableCell className="text-xs">{r.patient_name || "Walk-in"}</TableCell>
                  <TableCell className="text-xs">{r._doctorName || "—"}</TableCell>
                  <TableCell className="text-xs">{r.payment_mode || "—"}</TableCell>
                  <TableCell className="text-xs">{formatMoney(Number(r.total_amount))}</TableCell>
                  <TableCell className="text-xs">{formatMoney(Number(r.paid_amount))}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px]">{r.status}</Badge></TableCell>
                  <TableCell className="text-xs">{format(new Date(r.created_at), "dd MMM yyyy")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : kind === "patients" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Phone</TableHead>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Gender</TableHead>
                <TableHead className="text-xs">Added On</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r: any) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => go(`/patients/${r.id}`)}>
                  <TableCell className="text-xs text-primary underline font-medium">
                    {`${r.first_name || ""} ${r.last_name || ""}`.trim() || "Unnamed"}
                  </TableCell>
                  <TableCell className="text-xs">{r.phone || "—"}</TableCell>
                  <TableCell className="text-xs">{r.email || "—"}</TableCell>
                  <TableCell className="text-xs">{r.gender || "—"}</TableCell>
                  <TableCell className="text-xs">{format(new Date(r.created_at), "dd MMM yyyy")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Patient</TableHead>
                <TableHead className="text-xs">Service</TableHead>
                <TableHead className="text-xs">Staff</TableHead>
                <TableHead className="text-xs">Time</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r: any) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => go(`/appointments/${r.id}`)}>
                  <TableCell className="text-xs text-primary underline font-medium">
                    {r.patients ? `${r.patients.first_name} ${r.patients.last_name}` : r.patient_name || "Walk-in"}
                  </TableCell>
                  <TableCell className="text-xs">{r.service}</TableCell>
                  <TableCell className="text-xs">{r._staffName || "—"}</TableCell>
                  <TableCell className="text-xs">{format(new Date(r.start_time), "dd MMM h:mm a")}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px]">{r.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
