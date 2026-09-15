import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type TaxRow = {
  id: string;
  hsn_code: string;
  igst: number;
  cgst: number;
  sgst?: number;
  is_active: boolean | null;
};

const TaxMasterDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [igst, setIgst] = useState("");
  const [cgst, setCgst] = useState("");
  const [sgst, setSgst] = useState("");
  const [active, setActive] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { data: taxRecord, isLoading } = useQuery({
    queryKey: ["hsn-tax-master", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hsn_tax_master")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as TaxRow;
    },
  });

  useEffect(() => {
    if (taxRecord) {
      setIgst(String(taxRecord.igst || ""));
      setCgst(String(taxRecord.cgst || ""));
      setSgst(String(taxRecord.sgst ?? 0));
      setActive(taxRecord.is_active === null ? "" : taxRecord.is_active ? "yes" : "no");
    }
  }, [taxRecord]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("hsn_tax_master")
        .update({
          igst: parseFloat(igst) || 0,
          cgst: parseFloat(cgst) || 0,
          sgst: parseFloat(sgst) || 0,
          is_active: active === "" ? null : active === "yes",
        })
        .eq("id", id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["hsn-tax-master"] });
      toast.success("Tax record updated");
      navigate("/settings?tab=tax");
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!taxRecord) {
    return (
      <div className="p-4 md:p-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings?tab=tax")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <p className="text-muted-foreground">Tax record not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings?tab=tax")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-display font-semibold">Edit Tax Record</h1>
            <p className="text-sm text-muted-foreground">HSN Code: {taxRecord.hsn_code}</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div>
          <Label>HSN Code</Label>
          <Input
            className="mt-1.5"
            value={taxRecord.hsn_code}
            disabled
          />
          <p className="text-xs text-muted-foreground mt-1.5">HSN codes cannot be changed</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>IGST (%)</Label>
            <Input
              type="number"
              step="0.01"
              className="mt-1.5"
              placeholder="0"
              value={igst}
              onChange={(e) => setIgst(e.target.value)}
            />
          </div>
          <div>
            <Label>CGST (%)</Label>
            <Input
              type="number"
              step="0.01"
              className="mt-1.5"
              placeholder="0"
              value={cgst}
              onChange={(e) => setCgst(e.target.value)}
            />
          </div>
          <div>
            <Label>SGST (%)</Label>
            <Input
              type="number"
              step="0.01"
              className="mt-1.5"
              placeholder="0"
              value={sgst}
              onChange={(e) => setSgst(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label>Active</Label>
          <Select value={active} onValueChange={setActive}>
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder="Select Yes or No" />
            </SelectTrigger>
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
    </div>
  );
};

export default TaxMasterDetail;
