import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseFile } from "@/lib/patientImport";

type Parsed = { name: string; phone: string; email: string | null; city: string | null; source: string; interest: string | null };

const pick = (row: Record<string, unknown>, names: string[]) => {
  for (const key of Object.keys(row)) {
    if (names.includes(key.trim().toLowerCase().replace(/[\s_-]+/g, ""))) {
      const v = String(row[key] ?? "").trim();
      if (v) return v;
    }
  }
  return "";
};
const last10 = (p: string) => p.replace(/\D/g, "").slice(-10);

export function ImportLeadsDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [rows, setRows] = useState<Parsed[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    try {
      const { rows: raw } = await parseFile(file);
      const parsed: Parsed[] = [];
      let bad = 0;
      const seen = new Set<string>();
      for (const r of raw) {
        const name = pick(r, ["name", "fullname", "leadname"]) || [pick(r, ["firstname"]), pick(r, ["lastname"])].filter(Boolean).join(" ");
        const phone = pick(r, ["phone", "phonenumber", "mobile", "mobilenumber", "contact"]);
        if (!name || last10(phone).length < 8 || seen.has(last10(phone))) {
          bad++;
          continue;
        }
        seen.add(last10(phone));
        parsed.push({ name, phone, email: pick(r, ["email", "emailaddress"]) || null, city: pick(r, ["city"]) || null, source: pick(r, ["source"]) || "Other", interest: pick(r, ["interest", "interestedin", "concern", "treatment"]) || null });
      }
      setRows(parsed);
      setSkipped(bad);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the file");
    }
  };

  const run = async () => {
    setBusy(true);
    try {
      const { data: existing } = await supabase.from("leads").select("phone");
      const have = new Set((existing || []).map((l) => last10(l.phone)));
      const fresh = rows.filter((r) => !have.has(last10(r.phone)));
      for (let i = 0; i < fresh.length; i += 200) {
        const { error } = await supabase.from("leads").insert(fresh.slice(i, i + 200));
        if (error) throw error;
      }
      toast.success(`Imported ${fresh.length} lead${fresh.length === 1 ? "" : "s"}${rows.length - fresh.length ? `, ${rows.length - fresh.length} already existed` : ""}`);
      setRows([]);
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setRows([]); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Leads</DialogTitle>
          <DialogDescription>Upload a CSV or Excel file with columns such as Name, Phone, Email, City, Source and Interest. Rows without a name or valid phone, and numbers already saved, are skipped.</DialogDescription>
        </DialogHeader>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground hover:bg-muted/40">
          <Upload className="h-6 w-6" />
          Choose a CSV or XLSX file
          <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        </label>
        {rows.length > 0 && (
          <p className="text-sm">
            <span className="font-medium">{rows.length}</span> lead{rows.length === 1 ? "" : "s"} ready to import{skipped > 0 && <span className="text-muted-foreground"> · {skipped} skipped (missing or duplicate phone)</span>}.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={rows.length === 0 || busy} onClick={run}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
