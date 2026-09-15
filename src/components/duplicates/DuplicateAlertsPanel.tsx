import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayCircle, Loader2, Merge, ArrowRight, EyeOff } from "lucide-react";
import { fetchDuplicateRules, traceRule, recordLabel } from "@/lib/duplicates/engine";
import { getObject } from "@/lib/validation/schema";
import DuplicateResolveDialog from "./DuplicateResolveDialog";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  merged: "Merged",
  linked: "Linked",
  ignored: "Ignored",
};

/** Bulk re-evaluation job + unresolved duplicate action items. */
export default function DuplicateAlertsPanel({ objectKey }: { objectKey: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [scanLimit, setScanLimit] = useState("500");
  const [statusFilter, setStatusFilter] = useState("open");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resolve, setResolve] = useState<{ a: any; b: any } | null>(null);

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["duplicate-alerts", objectKey, statusFilter],
    queryFn: async () => {
      let q = (supabase as any)
        .from("duplicate_alerts")
        .select("*")
        .eq("object_key", objectKey)
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const runJob = async () => {
    const obj = getObject(objectKey);
    if (!obj) return;
    setRunning(true);
    setProgress(0);
    try {
      const rules = (await fetchDuplicateRules(objectKey)).filter((r) => (r.match_fields || []).length > 0);
      if (rules.length === 0) {
        toast({ title: "No active rules", description: `Add an active rule for ${obj.label} first.`, variant: "destructive" });
        return;
      }
      const limit = Number(scanLimit);
      const { data: records, error } = await (supabase as any)
        .from(obj.table)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const rows = (records || []) as Record<string, any>[];

      // Existing pairs so re-running the job never duplicates action items.
      const { data: existing } = await (supabase as any)
        .from("duplicate_alerts")
        .select("record_id, match_record_id, rule_id")
        .eq("object_key", objectKey);
      const seen = new Set(
        ((existing || []) as any[]).map((a) => [a.rule_id, a.record_id, a.match_record_id].join("|")),
      );

      const inserts: any[] = [];
      for (let i = 0; i < rows.length; i++) {
        if (i % 25 === 0) setProgress(Math.round((i / rows.length) * 100));
        for (let j = i + 1; j < rows.length; j++) {
          for (const rule of rules) {
            const t = traceRule(rule, objectKey, rows[i], rows[j]);
            if (!t.isDuplicate) continue;
            const [a, b] = [rows[i].id, rows[j].id].sort();
            const key = [rule.id, a, b].join("|");
            if (seen.has(key)) continue;
            seen.add(key);
            inserts.push({
              rule_id: rule.id,
              rule_name: rule.name,
              object_key: objectKey,
              record_id: a,
              record_label: recordLabel(objectKey, a === rows[i].id ? rows[i] : rows[j]),
              match_record_id: b,
              match_record_label: recordLabel(objectKey, b === rows[i].id ? rows[i] : rows[j]),
              matched_fields: t.fieldTraces.filter((f) => f.matched).map((f) => ({ ...f.field, label: f.label })),
              severity: t.severity,
              message: t.message,
              status: "open",
            });
          }
        }
      }
      setProgress(100);

      for (let k = 0; k < inserts.length; k += 200) {
        const { error: insErr } = await (supabase as any).from("duplicate_alerts").insert(inserts.slice(k, k + 200));
        if (insErr) throw insErr;
      }

      qc.invalidateQueries({ queryKey: ["duplicate-alerts"] });
      toast({
        title: "Re-evaluation complete",
        description: `${rows.length} record(s) scanned · ${inserts.length} new duplicate alert(s).`,
      });
    } catch (e: any) {
      toast({ title: "Job failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    const { error } = await (supabase as any)
      .from("duplicate_alerts")
      .update({ status, resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    qc.invalidateQueries({ queryKey: ["duplicate-alerts"] });
  };

  const openResolve = async (alert: any) => {
    const { data } = await (supabase as any)
      .from("patients")
      .select("*")
      .in("id", [alert.record_id, alert.match_record_id]);
    const rows = (data || []) as any[];
    const a = rows.find((r) => r.id === alert.record_id);
    const b = rows.find((r) => r.id === alert.match_record_id);
    if (!a || !b) return toast({ title: "Record not found", variant: "destructive" });
    setResolve({ a, b });
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div>
            <Label>Records to scan (most recent)</Label>
            <Select value={scanLimit} onValueChange={setScanLimit}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="200">200 records</SelectItem>
                <SelectItem value="500">500 records</SelectItem>
                <SelectItem value="1000">1000 records</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={runJob} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-1" />}
            Run bulk re-evaluation
          </Button>
          <div className="sm:ml-auto">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="merged">Merged</SelectItem>
                <SelectItem value="linked">Linked</SelectItem>
                <SelectItem value="ignored">Ignored</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {running && <Progress value={progress} className="h-2" />}
        <p className="text-xs text-muted-foreground">
          Re-runs every active rule across existing records and records unresolved pairs as action items. Already
          recorded pairs are skipped, so the job is safe to re-run.
        </p>
      </Card>

      <Card className="divide-y">
        {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && alerts.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">No duplicate alerts here.</div>
        )}
        {alerts.map((a: any) => (
          <div key={a.id} className="p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={a.severity === "block" ? "destructive" : "secondary"}>
                {a.severity === "block" ? "Blocking" : "Alert"}
              </Badge>
              <span className="text-sm font-medium">{a.record_label} ↔ {a.match_record_label}</span>
              <Badge variant="outline">{STATUS_LABEL[a.status] || a.status}</Badge>
              <span className="text-xs text-muted-foreground ml-auto">{a.rule_name}</span>
            </div>
            {a.message && <p className="text-xs text-muted-foreground">{a.message}</p>}
            <div className="flex flex-wrap gap-1.5">
              {(a.matched_fields || []).map((f: any, i: number) => (
                <Badge key={i} variant="outline" className="text-[10px]">{f.label || f.field_key}</Badge>
              ))}
            </div>
            {a.status === "open" && (
              <div className="flex flex-wrap gap-2 pt-1">
                {objectKey === "patients" && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openResolve(a)}>
                    <Merge className="h-3.5 w-3.5 mr-1" /> Merge / link
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => navigate(`/patients/${a.record_id}`)}
                >
                  <ArrowRight className="h-3.5 w-3.5 mr-1" /> Open record
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setStatus(a.id, "ignored")}>
                  <EyeOff className="h-3.5 w-3.5 mr-1" /> Not a duplicate
                </Button>
              </div>
            )}
          </div>
        ))}
      </Card>

      <DuplicateResolveDialog
        open={!!resolve}
        onClose={() => setResolve(null)}
        primary={resolve?.a || null}
        duplicate={resolve?.b || null}
        onResolved={() => qc.invalidateQueries({ queryKey: ["duplicate-alerts"] })}
      />
    </div>
  );
}
