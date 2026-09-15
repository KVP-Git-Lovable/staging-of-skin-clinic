import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * Named tax rates linked to products/services (the legacy `tax_master`).
 * Previously lived under Settings — now a tab of Master Data > Tax Master.
 */
export default function ProductServiceTaxRates() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);

  const { data: taxes = [] } = useQuery({
    queryKey: ["tax-master"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax_master")
        .select("*, tax_master_products(product_id, pharma_products(id, name))")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const toggleTax = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("tax_master").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tax-master"] });
      toast.success("Tax updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTax = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tax_master").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tax-master"] });
      toast.success("Tax deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (taxes as any[]).filter((t) => showInactive || t.is_active);

  return (
    <div>
      <div className="flex items-center justify-between mt-4 mb-4 gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          Include inactive (history)
        </label>
        <Button variant="outline" className="gap-2" onClick={() => navigate("/settings/tax-master/new")}>
          <Plus className="h-4 w-4" /> Add Tax Rate
        </Button>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="data-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tax Name</TableHead>
              <TableHead>CGST</TableHead>
              <TableHead>SGST</TableHead>
              <TableHead>IGST</TableHead>
              <TableHead>Products</TableHead>
              <TableHead className="w-20">Active</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No tax rates defined</TableCell></TableRow>
            ) : filtered.map((tax: any) => {
              const linkedProducts = (tax.tax_master_products || []).map((l: any) => l.pharma_products?.name).filter(Boolean);
              return (
                <TableRow
                  key={tax.id}
                  className="cursor-pointer hover:bg-accent/50"
                  onClick={() => navigate(`/settings/tax-master/${tax.id}`)}
                >
                  <TableCell className="font-medium">
                    {tax.name}
                    {!tax.is_active && <Badge variant="outline" className="ml-2 text-xs">Archived</Badge>}
                    {tax.description && <div className="text-xs text-muted-foreground">{tax.description}</div>}
                  </TableCell>
                  <TableCell>{Number(tax.cgst || 0)}%</TableCell>
                  <TableCell>{Number(tax.sgst || 0)}%</TableCell>
                  <TableCell>{Number(tax.igst || 0)}%</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs">
                    {linkedProducts.length === 0 ? "—" : (
                      <div className="flex flex-wrap gap-1">
                        {linkedProducts.slice(0, 3).map((n: string, i: number) => <Badge key={i} variant="secondary" className="text-xs">{n}</Badge>)}
                        {linkedProducts.length > 3 && <Badge variant="outline" className="text-xs">+{linkedProducts.length - 3}</Badge>}
                      </div>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={tax.is_active}
                      onCheckedChange={(checked) => toggleTax.mutate({ id: tax.id, is_active: checked })}
                    />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/settings/tax-master/${tax.id}`)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => {
                          if (confirm(`Delete tax rate "${tax.name}"? Existing invoices will keep their recorded tax amounts.`)) {
                            deleteTax.mutate(tax.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </motion.div>
    </div>
  );
}
