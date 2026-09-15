import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Check, X, FlaskConical, Loader2, ShieldAlert, AlertTriangle } from "lucide-react";
import { getObject } from "@/lib/validation/schema";
import { simulateDuplicates, type RuleTrace } from "@/lib/duplicates/engine";
import { toast } from "@/hooks/use-toast";

/**
 * Rule test simulator — enter sample values and see exactly which fields
 * matched, how AND/OR resolved, the rendered notification tokens and whether
 * the save would be blocked.
 */
export default function RuleSimulator({ objectKey }: { objectKey: string }) {
  const obj = getObject(objectKey)!;
  const testKeys = useMemo(() => {
    const preferred = ["first_name", "last_name", "phone", "email"];
    const keys = obj.fields.filter((f) => preferred.includes(f.key)).map((f) => f.key);
    return keys.length ? keys : obj.fields.slice(0, 4).map((f) => f.key);
  }, [obj]);

  const [values, setValues] = useState<Record<string, any>>({});
  const [extraKey, setExtraKey] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ traces: RuleTrace[]; rulesEvaluated: number; candidatesScanned: number } | null>(null);

  const run = async () => {
    setRunning(true);
    try {
      const res = await simulateDuplicates(objectKey, values, { limit: 10 });
      setResult(res);
    } catch (e: any) {
      toast({ title: "Simulation failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const hits = (result?.traces || []).filter((t) => t.isDuplicate);
  const blocked = hits.some((t) => t.severity === "block");
  const activeKeys = [...testKeys, ...(extraKey ? [extraKey] : [])];

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FlaskConical className="h-4 w-4 text-primary" /> Test input
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {activeKeys.map((k) => {
            const f = obj.fields.find((x) => x.key === k)!;
            return (
              <div key={k}>
                <Label>{f.label}</Label>
                <Input
                  value={values[k] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                  placeholder={`Enter ${f.label.toLowerCase()}`}
                />
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {obj.fields
            .filter((f) => !activeKeys.includes(f.key))
            .slice(0, 8)
            .map((f) => (
              <Button key={f.key} size="sm" variant="outline" className="h-7 text-xs" onClick={() => setExtraKey(f.key)}>
                + {f.label}
              </Button>
            ))}
        </div>
        <div className="flex gap-2">
          <Button onClick={run} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-1" />}
            Run simulation
          </Button>
          <Button variant="ghost" onClick={() => { setValues({}); setResult(null); }}>Clear</Button>
        </div>
      </Card>

      {result && (
        <Card
          className={
            "p-4 space-y-1 " +
            (blocked ? "border-destructive/50 bg-destructive/5" : hits.length ? "border-amber-500/50 bg-amber-500/5" : "")
          }
        >
          <div className="flex items-center gap-2 font-medium text-sm">
            {blocked ? <ShieldAlert className="h-4 w-4 text-destructive" /> : hits.length ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <Check className="h-4 w-4 text-emerald-600" />}
            Enforcement result:{" "}
            {blocked ? "Save would be BLOCKED" : hits.length ? "Save allowed with warning" : "No duplicate — save proceeds"}
          </div>
          <p className="text-xs text-muted-foreground">
            {result.rulesEvaluated} active rule(s) · {result.candidatesScanned} candidate record(s) scanned · {hits.length} duplicate match(es)
          </p>
        </Card>
      )}

      {(result?.traces || []).map((t, i) => (
        <Card key={i} className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={t.isDuplicate ? (t.severity === "block" ? "destructive" : "secondary") : "outline"}>
              {t.isDuplicate ? (t.severity === "block" ? "Blocks save" : "Alert") : "No match"}
            </Badge>
            <span className="text-sm font-medium">{t.rule.name}</span>
            <span className="text-xs text-muted-foreground">vs {t.recordLabel}</span>
          </div>

          <div className="space-y-1">
            {t.fieldTraces.map((ft, j) => (
              <div key={j} className="flex flex-wrap items-center gap-2 text-xs rounded-md bg-muted/40 px-2 py-1.5">
                {j > 0 && <Badge variant="outline" className="uppercase text-[10px]">{ft.field.joiner}</Badge>}
                <span className="font-medium">{ft.label}</span>
                <span className="text-muted-foreground">({ft.field.matchType})</span>
                <span className="truncate">"{ft.inputValue || "—"}" vs "{ft.recordValue || "—"}"</span>
                {ft.matched ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <Badge variant="outline" className="ml-auto text-[10px]">
                  running = {String(ft.runningResult)}
                </Badge>
              </div>
            ))}
          </div>

          <div className="text-xs">
            <span className="font-medium">Expression: </span>
            <span className="text-muted-foreground">{t.expression || "—"}</span>
            <span className="ml-2">→ {String(t.isDuplicate)}</span>
          </div>

          <div className="rounded-md border p-2">
            <div className="text-[11px] font-medium mb-0.5">Notification preview (tokens rendered)</div>
            <div className="text-sm font-medium">{t.rule.notification?.title || "Possible duplicate found"}</div>
            <p className="text-xs text-muted-foreground">{t.message || "—"}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(t.rule.actions || []).map((a) => (
                <Badge key={a.key} variant="secondary" className="text-[10px]">{a.label}</Badge>
              ))}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
