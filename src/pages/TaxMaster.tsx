import { useState } from "react";
import { Plus, Percent, Lock, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProductServiceTaxRates from "@/components/settings/ProductServiceTaxRates";
import { toast } from "sonner";

type TaxRow = {
  id: string;
  hsn_code: string;
  igst: number;
  cgst: number;
  sgst?: number;
  is_active: boolean | null;
  active_from: string | null;
  inactive_from: string | null;
};

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function TaxMaster() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [hsnCode, setHsnCode] = useState("");
  const [igst, setIgst] = useState("");
  const [cgst, setCgst] = useState("");
  const [sgst, setSgst] = useState("");
  const [active, setActive] = useState<string>("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["hsn-tax-master"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hsn_tax_master")
        .select("*")
        .order("hsn_code");
      if (error) throw error;
      return (data || []) as TaxRow[];
    },
  });

  const reset = () => { setHsnCode(""); setIgst(""); setCgst(""); setSgst(""); setActive(""); };

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("hsn_tax_master").insert({
        hsn_code: hsnCode.trim(),
        igst: parseFloat(igst) || 0,
        cgst: parseFloat(cgst) || 0,
        sgst: parseFloat(sgst) || 0,
        is_active: active === "" ? null : active === "yes",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hsn-tax-master"] });
      queryClient.invalidateQueries({ queryKey: ["hsn-tax-active"] });
      toast.success("Tax record created");
      reset();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("hsn_tax_master").update({ is_active: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hsn-tax-master"] });
      queryClient.invalidateQueries({ queryKey: ["hsn-tax-active"] });
      toast.success("Active status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold font-display">Tax Master</h1>
        <p className="text-sm text-muted-foreground">
          All tax configuration in one place — HSN rates for invoices and named rates linked to products &amp; services.
        </p>
      </div>

      <Tabs defaultValue="hsn" className="space-y-4">
        <TabsList className="tabs-scroll">
          <TabsTrigger value="hsn">HSN Rates</TabsTrigger>
          <TabsTrigger value="rates">Product &amp; Service Rates</TabsTrigger>
        </TabsList>

        <TabsContent value="hsn" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            HSN codes with their IGST and CGST rates. Records are locked after saving — only the Active status can be changed.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> New HSN Tax</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">New Tax Record</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>HSN Code *</Label>
                <Input className="mt-1.5" placeholder="9993" value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>IGST (%)</Label>
                  <Input type="number" step="0.01" className="mt-1.5" placeholder="18" value={igst} onChange={(e) => setIgst(e.target.value)} />
                </div>
                <div>
                  <Label>CGST (%)</Label>
                  <Input type="number" step="0.01" className="mt-1.5" placeholder="9" value={cgst} onChange={(e) => setCgst(e.target.value)} />
                </div>
                <div>
                  <Label>SGST (%)</Label>
                  <Input type="number" step="0.01" className="mt-1.5" placeholder="9" value={sgst} onChange={(e) => setSgst(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Active</Label>
                <Select value={active} onValueChange={setActive}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select Yes or No" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Active from / Inactive from dates are stamped automatically when this changes.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!hsnCode.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? "Saving..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>HSN Code</TableHead>
              <TableHead>IGST %</TableHead>
              <TableHead>CGST %</TableHead>
              <TableHead>SGST %</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Active From</TableHead>
              <TableHead>Inactive From</TableHead>
              <TableHead className="w-10">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No tax records yet.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium flex items-center gap-2">
                  <Lock className="h-3 w-3 text-muted-foreground" /> {r.hsn_code}
                </TableCell>
                <TableCell>{Number(r.igst)}%</TableCell>
                <TableCell>{Number(r.cgst)}%</TableCell>
                <TableCell>{Number(r.sgst ?? 0)}%</TableCell>
                <TableCell>
                  <Select
                    value={r.is_active === null ? "" : r.is_active ? "yes" : "no"}
                    onValueChange={(v) => activeMutation.mutate({ id: r.id, value: v === "yes" })}
                  >
                    <SelectTrigger className="h-8 w-[110px]"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmt(r.active_from)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmt(r.inactive_from)}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => navigate(`/tax-master/${r.id}`)}
                    title="Edit tax record"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Percent className="h-3 w-3" /> Total tax applied on a service = IGST + CGST + SGST of its linked HSN code.
      </p>

      <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
        Only HSN codes marked Active = Yes appear in Service Master
      </Badge>
        </TabsContent>

        <TabsContent value="rates">
          <ProductServiceTaxRates />
        </TabsContent>
      </Tabs>
    </div>
  );
}