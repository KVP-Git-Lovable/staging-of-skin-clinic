import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Merge, Link2, Loader2 } from "lucide-react";

export interface ResolveTargets {
  /** Record kept after resolution. */
  primaryId: string;
  /** Record folded into the primary. */
  duplicateId: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  primary: Record<string, any> | null;
  duplicate: Record<string, any> | null;
  /** Called after a successful merge/link with the mode used. */
  onResolved?: (mode: "merged" | "linked", kept: string) => void;
}

const label = (p: Record<string, any> | null) =>
  p ? [p.first_name, p.last_name].filter(Boolean).join(" ") || p.phone || "Patient" : "—";

/** Tables that hold patient-owned records and can be carried over on merge. */
const CARRY_GROUPS = [
  { key: "appointments", label: "Appointments", tables: ["appointments"] },
  { key: "invoices", label: "Invoices & bills", tables: ["invoices", "pharma_bills"] },
  {
    key: "clinical",
    label: "Clinical records (procedures, prescriptions, photos, surveys)",
    tables: ["procedures", "prescriptions", "patient_photos", "survey_responses", "therapy_notes"],
  },
] as const;

type ConflictPolicy = "keep_existing" | "prefer_latest" | "prefer_duplicate" | "manual";
type InvoicePolicy = "keep_historical" | "skip_conflicting" | "fill_missing_tax";

const ignorable = (msg?: string) =>
  !!msg && /column .* does not exist|relation .* does not exist/i.test(msg);

/**
 * Carry billing rows to the kept patient, honouring the configured tax/HSN conflict policy.
 * Returns the number of rows left behind (skipped because their tax/HSN differs).
 */
async function carryInvoices(
  table: string,
  kept: Record<string, any>,
  dropped: Record<string, any>,
  policy: InvoicePolicy,
  restampName: boolean,
): Promise<number> {
  const { data: rows, error } = await (supabase as any)
    .from(table)
    .select("*")
    .eq("patient_id", dropped.id);
  if (error) {
    if (ignorable(error.message)) return 0;
    throw error;
  }
  const list = (rows || []) as Record<string, any>[];
  if (list.length === 0) return 0;

  // Reference tax/HSN comes from the kept patient's most recent billing row.
  const { data: keptRows } = await (supabase as any)
    .from(table)
    .select("*")
    .eq("patient_id", kept.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const ref = ((keptRows || [])[0] || {}) as Record<string, any>;
  const refTax = ref.tax_id ?? null;
  const refRate = ref.tax_rate ?? null;

  const keptName = [kept.first_name, kept.last_name].filter(Boolean).join(" ") || kept.phone || null;
  let skipped = 0;

  for (const row of list) {
    const hasTax = row.tax_id !== null && row.tax_id !== undefined;
    const mismatched =
      (refTax !== null && hasTax && row.tax_id !== refTax) ||
      (refRate !== null && row.tax_rate !== null && row.tax_rate !== undefined && Number(row.tax_rate) !== Number(refRate));

    if (policy === "skip_conflicting" && mismatched) {
      skipped++;
      continue;
    }

    const patch: Record<string, any> = { patient_id: kept.id };
    if (restampName && "patient_name" in row && keptName) patch.patient_name = keptName;
    if (policy === "fill_missing_tax") {
      if (!hasTax && refTax !== null) patch.tax_id = refTax;
      if ((row.tax_rate === null || row.tax_rate === undefined) && refRate !== null) patch.tax_rate = refRate;
    }

    const { error: upErr } = await (supabase as any).from(table).update(patch).eq("id", row.id);
    if (upErr && !ignorable(upErr.message)) throw upErr;
  }
  return skipped;
}



const CONFLICT_FIELDS = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "date_of_birth",
  "gender",
  "city",
  "state",
  "pincode",
  "address",
];

const isBlank = (v: any) => v === null || v === undefined || v === "";

export default function DuplicateResolveDialog({ open, onClose, primary, duplicate, onResolved }: Props) {
  const [keepId, setKeepId] = useState<string>("");
  const [carry, setCarry] = useState<Record<string, boolean>>({ appointments: true, invoices: true, clinical: true });
  const [fillBlanks, setFillBlanks] = useState(true);
  const [deactivate, setDeactivate] = useState(true);
  const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>("keep_existing");
  const [manualPicks, setManualPicks] = useState<Record<string, "kept" | "dropped">>({});
  const [invoicePolicy, setInvoicePolicy] = useState<InvoicePolicy>("keep_historical");
  const [restampName, setRestampName] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && primary) setKeepId(primary.id);
    if (open) setManualPicks({});
  }, [open, primary?.id]);

  const kept = keepId === duplicate?.id ? duplicate : primary;
  const dropped = keepId === duplicate?.id ? primary : duplicate;

  const diffRows = useMemo(() => {
    if (!kept || !dropped) return [];
    return CONFLICT_FIELDS.map((k) => ({
      key: k,
      keptValue: kept[k],
      droppedValue: dropped[k],
      conflict: !isBlank(kept[k]) && !isBlank(dropped[k]) && String(kept[k]) !== String(dropped[k]),
    }));
  }, [kept, dropped]);

  const conflicts = diffRows.filter((r) => r.conflict);

  /** Resolve a single conflicting value according to the configured policy. */
  const resolveValue = (row: { key: string; keptValue: any; droppedValue: any }) => {
    switch (conflictPolicy) {
      case "prefer_duplicate":
        return row.droppedValue;
      case "prefer_latest": {
        const keptAt = new Date((kept as any)?.updated_at || (kept as any)?.created_at || 0).getTime();
        const dropAt = new Date((dropped as any)?.updated_at || (dropped as any)?.created_at || 0).getTime();
        return dropAt > keptAt ? row.droppedValue : row.keptValue;
      }
      case "manual":
        return manualPicks[row.key] === "dropped" ? row.droppedValue : row.keptValue;
      default:
        return row.keptValue;
    }
  };

  const run = async (mode: "merged" | "linked") => {
    if (!kept || !dropped) return;
    setBusy(true);
    let skippedRef = 0;
    try {

      if (mode === "merged") {
        const patch: Record<string, any> = {};

        if (fillBlanks) {
          Object.entries(dropped).forEach(([k, v]) => {
            if (["id", "created_at", "updated_at"].includes(k)) return;
            if (isBlank((kept as any)[k]) && !isBlank(v)) patch[k] = v;
          });
        }

        // Conflicting values follow the configured conflict policy.
        diffRows.filter((r) => r.conflict).forEach((r) => {
          const value = resolveValue(r);
          if (String(value ?? "") !== String(r.keptValue ?? "")) patch[r.key] = value;
        });

        if (Object.keys(patch).length) {
          const { error } = await (supabase as any).from("patients").update(patch).eq("id", kept.id);
          if (error) throw error;
        }

        let skippedBills = 0;
        for (const group of CARRY_GROUPS) {
          if (!carry[group.key]) continue;
          for (const table of group.tables) {
            if (group.key === "invoices") {
              skippedBills += await carryInvoices(table, kept, dropped, invoicePolicy, restampName);
              continue;
            }
            const { error } = await (supabase as any)
              .from(table)
              .update({ patient_id: kept.id })
              .eq("patient_id", dropped.id);
            if (error && !ignorable(error.message)) throw error;
          }
        }
        skippedRef = skippedBills;

        if (deactivate) {
          const { error } = await supabase.from("patients").update({ status: "Inactive" } as any).eq("id", dropped.id);
          if (error) throw error;
        }
      }

      await (supabase as any)
        .from("duplicate_alerts")
        .update({ status: mode, resolved_at: new Date().toISOString() })
        .or(
          `and(record_id.eq.${kept.id},match_record_id.eq.${dropped.id}),and(record_id.eq.${dropped.id},match_record_id.eq.${kept.id})`,
        );

      toast({
        title: mode === "merged" ? "Records merged" : "Records linked",
        description:
          mode === "merged"
            ? `${label(dropped)} was folded into ${label(kept)}.` +
              (skippedRef ? ` ${skippedRef} bill(s) with a different tax/HSN were left on the duplicate.` : "")
            : `Both records were kept and marked as reviewed.`,
      });

      onResolved?.(mode, kept.id);
      onClose();
    } catch (e: any) {
      toast({ title: "Could not resolve duplicate", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5 text-primary" /> Resolve duplicate patients
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">Which record should be kept?</Label>
            <RadioGroup value={keepId} onValueChange={setKeepId} className="grid gap-2 sm:grid-cols-2">
              {[primary, duplicate].filter(Boolean).map((p: any) => (
                <Card key={p.id} className={"p-3 " + (keepId === p.id ? "border-primary ring-1 ring-primary" : "")}>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <RadioGroupItem value={p.id} className="mt-1" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{label(p)}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {p.phone || "no phone"}
                        {p.email ? ` · ${p.email}` : ""}
                      </div>
                      {keepId === p.id && <Badge className="mt-1">Keep</Badge>}
                    </div>
                  </label>
                </Card>
              ))}
            </RadioGroup>
          </div>

          <Card className="p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs font-medium">Field comparison</div>
              {conflicts.length > 0 && (
                <Badge variant="secondary">{conflicts.length} conflicting field(s)</Badge>
              )}
            </div>
            <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 text-[11px] text-muted-foreground mb-1">
              <span>Field</span>
              <span>Kept record</span>
              <span>Duplicate</span>
            </div>
            <div className="space-y-1 text-xs">
              {diffRows.map((r) => {
                const winner = r.conflict ? resolveValue(r) : r.keptValue;
                return (
                  <div key={r.key} className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-muted-foreground">{r.key.replace(/_/g, " ")}</span>
                    <button
                      type="button"
                      disabled={conflictPolicy !== "manual" || !r.conflict}
                      onClick={() => setManualPicks((m) => ({ ...m, [r.key]: "kept" }))}
                      className={
                        "truncate text-left rounded px-1 " +
                        (r.conflict && String(winner ?? "") === String(r.keptValue ?? "")
                          ? "bg-primary/10 font-medium"
                          : "")
                      }
                    >
                      {String(r.keptValue ?? "—")}
                    </button>
                    <button
                      type="button"
                      disabled={conflictPolicy !== "manual" || !r.conflict}
                      onClick={() => setManualPicks((m) => ({ ...m, [r.key]: "dropped" }))}
                      className={
                        "truncate text-left rounded px-1 " +
                        (r.conflict
                          ? String(winner ?? "") === String(r.droppedValue ?? "")
                            ? "bg-primary/10 font-medium"
                            : "text-amber-600"
                          : "")
                      }
                    >
                      {String(r.droppedValue ?? "—")}
                    </button>
                  </div>
                );
              })}
            </div>
            {conflictPolicy === "manual" && conflicts.length > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Click a value to choose which one survives the merge.
              </p>
            )}
          </Card>

          <div className="space-y-2">
            <Label>When both records have a value (e.g. two different phone numbers)</Label>
            <Select value={conflictPolicy} onValueChange={(v) => setConflictPolicy(v as ConflictPolicy)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="z-50 bg-popover">
                <SelectItem value="keep_existing">Keep the existing value on the kept record</SelectItem>
                <SelectItem value="prefer_latest">Prefer the most recently updated record's value</SelectItem>
                <SelectItem value="prefer_duplicate">Prefer the duplicate record's value</SelectItem>
                <SelectItem value="manual">Decide field by field (pick above)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Invoices &amp; bills with a different tax / HSN</Label>
            <Select value={invoicePolicy} onValueChange={(v) => setInvoicePolicy(v as InvoicePolicy)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="z-50 bg-popover">
                <SelectItem value="keep_historical">Move them, keep their original tax / HSN (recommended)</SelectItem>
                <SelectItem value="skip_conflicting">Leave mismatched bills on the duplicate record</SelectItem>
                <SelectItem value="fill_missing_tax">Move them and fill missing tax / HSN from the kept record</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Checkbox id="restamp-name" checked={restampName} onCheckedChange={(v) => setRestampName(!!v)} />
              <Label htmlFor="restamp-name" className="text-sm font-normal">
                Update the patient name printed on carried bills
              </Label>
            </div>
          </div>


          <div className="space-y-2">
            <Label>Carry over to the kept record</Label>
            {CARRY_GROUPS.map((g) => (
              <div key={g.key} className="flex items-center gap-2">
                <Checkbox
                  id={`carry-${g.key}`}
                  checked={!!carry[g.key]}
                  onCheckedChange={(v) => setCarry((c) => ({ ...c, [g.key]: !!v }))}
                />
                <Label htmlFor={`carry-${g.key}`} className="text-sm font-normal">{g.label}</Label>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Checkbox id="fill-blanks" checked={fillBlanks} onCheckedChange={(v) => setFillBlanks(!!v)} />
              <Label htmlFor="fill-blanks" className="text-sm font-normal">
                Fill empty fields on the kept record from the duplicate
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="deactivate" checked={deactivate} onCheckedChange={(v) => setDeactivate(!!v)} />
              <Label htmlFor="deactivate" className="text-sm font-normal">
                Mark the duplicate record as Inactive after merging
              </Label>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="secondary" onClick={() => run("linked")} disabled={busy || !kept || !dropped}>
              <Link2 className="h-4 w-4 mr-1" /> Link only
            </Button>
            <Button onClick={() => run("merged")} disabled={busy || !kept || !dropped}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Merge className="h-4 w-4 mr-1" />}
              Merge records
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
