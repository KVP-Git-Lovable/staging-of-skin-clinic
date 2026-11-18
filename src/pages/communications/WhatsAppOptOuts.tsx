import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, BellOff, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { optOutKey } from "@/lib/comms/optOut";

type OptOutRow = {
  phone_last10: string;
  reason: string | null;
  source: string;
  created_at: string;
  patient: { first_name: string | null; last_name: string | null } | null;
};

const SOURCE_LABEL: Record<string, string> = { manual: "Added by staff", inbound_stop: "Replied STOP", import: "Imported" };

export default function WhatsAppOptOuts() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [removing, setRemoving] = useState<OptOutRow | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["comms-whatsapp-opt-outs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comms_whatsapp_opt_outs")
        .select("phone_last10, reason, source, created_at, patient:patients(first_name, last_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OptOutRow[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const key = optOutKey(phone);
      if (!key) throw new Error("Enter a phone number with at least 10 digits");
      const { data: match } = await supabase.from("patients").select("id").eq("phone_last10", key).limit(1);
      const { error } = await supabase.from("comms_whatsapp_opt_outs").upsert(
        { phone_last10: key, patient_id: match?.[0]?.id ?? null, source: "manual", reason: reason.trim() || null },
        { onConflict: "phone_last10" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Added to the opt-out list");
      qc.invalidateQueries({ queryKey: ["comms-whatsapp-opt-outs"] });
      setAdding(false); setPhone(""); setReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (key: string) => {
      const { error } = await supabase.from("comms_whatsapp_opt_outs").delete().eq("phone_last10", key);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed from the opt-out list");
      qc.invalidateQueries({ queryKey: ["comms-whatsapp-opt-outs"] });
      setRemoving(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/communications/whatsapp"><ArrowLeft className="mr-2 h-4 w-4" /> WhatsApp Center</Link>
      </Button>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight md:text-2xl"><BellOff className="h-6 w-6 text-primary" /> Opt-outs</h1>
          <p className="text-sm text-muted-foreground">
            People here are never sent journey messages. Patients are added automatically when they reply STOP.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}><Plus className="mr-2 h-4 w-4" /> Add number</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
          ) : error ? (
            <p className="p-4 text-sm text-destructive">Could not load the list: {(error as Error).message}</p>
          ) : !data?.length ? (
            <p className="p-6 text-sm text-muted-foreground">No one has opted out yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Phone</TableHead><TableHead>Patient</TableHead><TableHead>Source</TableHead><TableHead>Reason</TableHead><TableHead>Date</TableHead><TableHead className="w-12" /></TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((r) => (
                    <TableRow key={r.phone_last10}>
                      <TableCell className="font-mono text-sm">{r.phone_last10}</TableCell>
                      <TableCell>{r.patient ? `${r.patient.first_name ?? ""} ${r.patient.last_name ?? ""}`.trim() || "—" : <span className="text-muted-foreground">Not a patient</span>}</TableCell>
                      <TableCell><Badge variant="outline">{SOURCE_LABEL[r.source] ?? r.source}</Badge></TableCell>
                      <TableCell className="max-w-[260px] truncate" title={r.reason ?? ""}>{r.reason ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{format(new Date(r.created_at), "d MMM yyyy")}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" title="Remove from list" onClick={() => setRemoving(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={adding} onOpenChange={(o) => !add.isPending && setAdding(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add number to opt-out list</DialogTitle>
            <DialogDescription>Journeys will skip this number. Use it when someone asks you directly not to be messaged.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="optout-phone">Phone number</Label>
              <Input id="optout-phone" className="mt-1.5" inputMode="tel" placeholder="e.g. 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="optout-reason">Reason (optional)</Label>
              <Input id="optout-reason" className="mt-1.5" placeholder="e.g. Asked at the front desk" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)} disabled={add.isPending}>Cancel</Button>
            <Button onClick={() => add.mutate()} disabled={add.isPending || !phone.trim()}>
              {add.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from the opt-out list?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.phone_last10} can receive journey messages again. Only do this if the person has asked to hear from the clinic.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && remove.mutate(removing.phone_last10)}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
